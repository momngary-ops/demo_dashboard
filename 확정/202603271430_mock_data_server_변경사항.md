# mock_data_server.py 변경사항 — 202603271430

## 배포 대상
- 서버: `223.130.138.59`
- 경로: `/var/www/dashboard/mock_data_server.py`
- 서비스: `dashboard-api` (유일하게 유지)

## 배포 전 필수 작업
```bash
# 충돌 서비스 4개 비활성화
systemctl stop mock_data_server.service mock-data-server.service smartfarm.service smartfarm-api.service
systemctl disable mock_data_server.service mock-data-server.service smartfarm.service smartfarm-api.service

# dashboard-api 서비스 파일 hardening
sed -i 's/Restart=always/Restart=on-failure/' /etc/systemd/system/dashboard-api.service
sed -i '/RestartSec=10/a StartLimitIntervalSec=60\nStartLimitBurst=3' /etc/systemd/system/dashboard-api.service
systemctl daemon-reload
```

---

## 변경 내용

### 1. 단일 인스턴스 잠금 (모듈 최상단)
- `import fcntl, os, sys` 추가
- `_acquire_instance_lock()` 함수: `fcntl.LOCK_EX | LOCK_NB`로 `.server.lock` 파일 잠금
- 잠금 실패 시 `sys.exit(0)` → `Restart=on-failure`와 조합해 재시작 루프 방지
- 로그: `[lock] dashboard-api 단일 인스턴스 잠금 획득 — PID {pid}`

### 2. DEFAULT_ALERT_CONFIG — webhookUrl 추가
```python
DEFAULT_ALERT_CONFIG = {
    "temp":       {"enabled": True, "delay_min": 10, "deviation_pct": 0},
    "humidity":   {"enabled": True, "delay_min": 10, "deviation_pct": 0},
    "co2":        {"enabled": True, "delay_min": 10, "deviation_pct": 10},
    "webhookUrl": "",   # ← 추가
}
```

### 3. _log_single_zone() — 양액기 데이터 kpi_log 저장
- controller fetch 후 `nutrientUrl` 도 fetch
- 동일 `skip` 셋 적용, 동일 `kpi_log` 테이블에 append
- 5분마다 제어기+양액기 데이터 함께 SQLite 저장

### 4. _send_teams_alert() 신규 함수
- Teams MessageCard 포맷으로 httpx 비동기 POST
- httpx 없을 시 `requests` 동기 fallback
- 라벨 매핑: `xintemp1`→"내부 온도", `xinhum1`→"습도", `xco2`→"CO₂"

### 5. _check_zone_alert() 수정
- 양액기 데이터 fetch 후 controller raw와 merge → `_push_to_buffer()` 1회 호출
  (이전: controller만 버퍼에 push)
- 알림 발송 시 `webhookUrl` 있으면 `_send_teams_alert()` 호출
- 온도 알림 기준: `xintemp1` (위젯 '내부 온도'와 동일 필드)

### 6. zone_nutrient 엔드포인트 — timeout 단축
```python
data, err = await _fetch_url(nut_url, timeout=4)  # 클라이언트 5s abort보다 짧게
```
- 기존 10s → 4s: 느린 양액기 기기 응답 시 클라이언트 abort 전에 서버가 먼저 실패 응답
- 다음 요청은 _check_zone_alert 캐시 워밍(60s)으로 빠르게 처리

---

## 검증 순서
```bash
systemctl restart dashboard-api
journalctl -u dashboard-api -f

# 확인 로그
# [lock] dashboard-api 단일 인스턴스 잠금 획득 — PID xxxx
# [kpi_log] 2026-xx-xxTxx:xx:xxZ — N개 저장
# [alert_check] (1분 후) 실행 로그
# [teams] (가이드라인 이탈 시) zone=xxx/field=xintemp1 → HTTP 200
```
