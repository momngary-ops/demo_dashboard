# 01. 데이터 수집 파이프라인

> 버전: v2.2.3 | 작성일: 2026-03-30

---

## 1. 데이터 흐름 개요

```
[ 외부 장치 API ]
   제어기 API (controllerUrl)   양액기 API (nutrientUrl)
         |                              |
         |  HTTP (외부망)               |  HTTP (외부망)
         v                              v
   ┌─────────────────────────────────────────────────┐
   │     FastAPI  /  mock_data_server.py              │
   │                                                  │
   │  _proxy_cache (TTL 15초)                         │
   │    └── GET /api/zone/{id}/controller             │
   │    └── GET /api/zone/{id}/nutrient               │
   │                                                  │
   │  _zone_buffer (30분 인메모리, 1분 해상도)         │
   │    └── 병렬 병합: controller + nutrient 필드      │
   │                                                  │
   │  _log_zone_data_loop (5분 주기)                  │
   │    └── kpi_log → data_log.db (SQLite)            │
   └─────────────────────────────────────────────────┘
         |
         | HTTP :8000
         v
   [ 프론트엔드 useKpiPolling (60초 주기) ]
     캐시 28초 TTL
     24시간 히스토리 (_kpiHistory)
     80포인트 스파크라인 다운샘플
```

---

## 2. 프록시 캐시 (Proxy Cache)

**위치:** `mock_data_server.py`

```python
PROXY_CACHE_TTL = 15   # 초
_proxy_cache: dict[str, tuple[dict, Exception|None, float]] = {}
# key: url, value: (data, error, fetched_at_timestamp)
```

- 동일 URL에 대한 중복 요청을 15초 동안 캐싱
- TTL 만료 시 다음 요청에서 외부 API 재호출
- 외부 API 오류 시 이전 캐시 값 유지 (best-effort)

---

## 3. 인메모리 버퍼 (_zone_buffer)

```python
from collections import deque

_zone_buffer: dict[str, deque] = {}
# key: zone_id
# value: deque(maxlen=30)  ← 30분 × 1분 해상도

# 각 항목 구조:
{
    "ts": "2026-03-30T10:00:00Z",   # ISO 타임스탬프
    "fields": {
        "xintemp1": 22.5,
        "xinhum1": 68.3,
        "xco2": 498.0,
        ...
    }
}
```

- `maxlen=30`: 최근 30분 데이터만 유지
- 제어기 + 양액기 필드를 하나의 `fields` 객체로 병합
- `GET /api/zone/{id}/recent?field=xintemp1` 엔드포인트로 조회

---

## 4. SQLite 로깅 루프 (_log_zone_data_loop)

```python
# 5분(300초) 주기로 실행
async def _log_zone_data_loop():
    while True:
        await asyncio.sleep(300)
        for zone_id, buf in _zone_buffer.items():
            if buf:
                latest = buf[-1]  # 가장 최근 스냅샷
                for field, value in latest["fields"].items():
                    db.execute(
                        "INSERT INTO data_log (ts, zone_id, field, value) VALUES (?,?,?,?)",
                        (latest["ts"], zone_id, field, value)
                    )
```

---

## 5. DB 스키마

### 5.1 data_log 테이블

```sql
CREATE TABLE IF NOT EXISTS data_log (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    ts       TEXT NOT NULL,      -- ISO 8601 타임스탬프
    zone_id  TEXT NOT NULL,      -- 구역 ID (예: "Z-1")
    field    TEXT NOT NULL,      -- KPI 필드명 (예: "xintemp1")
    value    REAL                -- 센서 수치
);

CREATE INDEX IF NOT EXISTS idx_data_log_zone_field_ts
    ON data_log(zone_id, field, ts DESC);
```

### 5.2 alerts 테이블

```sql
CREATE TABLE IF NOT EXISTS alerts (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        TEXT NOT NULL,     -- 알림 발생 시각
    zone_id   TEXT NOT NULL,
    field     TEXT NOT NULL,
    value     REAL,              -- 이탈 시점의 측정값
    range_min REAL,              -- 하한 기준선
    range_max REAL               -- 상한 기준선
);
```

---

## 6. 설정 파일 구조

### 6.1 zone_config.json

```json
{
  "zones": {
    "Z-1": {
      "label": "Zone A",
      "controllerUrl": "http://192.168.0.10/api/data",
      "nutrientUrl": "http://192.168.0.20/api/data",
      "availableFields": ["xintemp1", "xinhum1", "xco2", "now_ec", "now_ph"]
    },
    "Z-2": {
      "label": "Zone B",
      "controllerUrl": "http://192.168.0.11/api/data",
      "nutrientUrl": "http://192.168.0.21/api/data",
      "availableFields": ["xintemp1", "xinhum1"]
    }
  }
}
```

### 6.2 guidelines.json

```json
{
  "data": {
    "1": [
      { "hour": 0,  "temp_min": 12.6, "temp_max": 14.6, "hum_min": 83.1, "hum_max": 94.7, "co2": 502.0 },
      { "hour": 1,  "temp_min": 12.6, "temp_max": 14.6, "hum_min": 83.1, "hum_max": 94.7, "co2": 502.0 },
      ...
      { "hour": 23, ... }
    ],
    "2": [ ... ],
    ...
    "12": [ ... ]
  },
  "alert_config": {
    "enabled": true,
    "webhookUrl": "https://outlook.office.com/webhook/...",
    "cooldownMin": 30,
    "flapThreshold": 3
  }
}
```

- 12개월 × 24시간 = 288개 행
- `GET /api/guidelines` → `POST /api/guidelines`로 CRUD

---

## 7. 백그라운드 루프 2개

| 루프 | 주기 | 역할 |
|------|------|------|
| `_log_zone_data_loop` | 5분 | _zone_buffer 최신값 → SQLite 삽입 |
| `_alert_check_loop` | 1분 | 현재 값과 guidelines 비교 → alerts 테이블 삽입 |

두 루프 모두 FastAPI `lifespan` 이벤트에서 `asyncio.create_task()`로 시작.

---

## 8. 데이터 조회 API

| 엔드포인트 | 설명 | 응답 |
|-----------|------|------|
| `GET /api/zone/{id}/controller` | 제어기 API 프록시 (캐시 15초) | `{ fields: {...} }` |
| `GET /api/zone/{id}/nutrient` | 양액기 API 프록시 (캐시 15초) | `{ fields: {...} }` |
| `GET /api/zone/{id}/recent?field=` | 인메모리 버퍼 조회 (최근 30분) | `[{ ts, value }, ...]` |
| `GET /api/logs?zone_id=&field=&limit=` | SQLite 히스토리 조회 (최대 12h) | `[{ ts, value }, ...]` |
| `GET /api/capabilities` | 구역별 사용 가능 필드 목록 | `{ available: { Z-1: [...] } }` |

---

## 9. 데이터 보호 정책

- **`data_log.db`**: `.gitignore`에 등록됨 → `git push` 시 포함되지 않음
- **배포 주의**: SCP로 `dist/`만 전송. `data_log.db`를 절대 덮어쓰지 말 것
- **크기 경고**: 서버 운영 파일 454MB. 1MB 미만이면 덮어쓰기 사고 가능성
  ```python
  # mock_data_server.py 내 경고 로직
  if data_log.db < 1.0 MB:
      print("[경고] data_log.db 크기가 비정상적으로 작습니다")
      print("[경고] 배포 중 덮어쓰여졌을 가능성")
  ```
- **단일 인스턴스 잠금**: `.server.lock` 파일로 중복 실행 방지
  - Windows: `msvcrt.locking()`
  - Unix: `fcntl.flock(LOCK_EX | LOCK_NB)`
