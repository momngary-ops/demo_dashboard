# 02. 대시보드 KPI & 위젯 렌더링

> 버전: v2.2.3 | 작성일: 2026-03-30

---

## 1. 데이터 흐름 개요

```
[ pollingConfig.js ]
  API_SOURCE 매핑
  (CLIMATE / NUTRIENT / FARM_MANAGING / GROWTH / LABOR)
         |
         v
[ useKpiPolling(slotConfigs, zoneId, refreshKey) ]
  - fetchZoneData(zoneId) 호출
  - _zoneCache TTL 28초
  - 60초 폴링 주기
         |
         v
[ _kpiHistory (24h 윈도우) ]
  - _loadHistoryFromDB(): SQLite 12h 초기값 적재
  - _mergeHistory(): 중복 제거 + 타임스탬프 정렬
  - _getSparkline(id): 80포인트 다운샘플
         |
         v
[ resolveKpiStatus() ]
  9가지 상태 판정
         |
         v
[ Widget 컴포넌트 / TopBanner 슬롯 ]
  스파크라인 + 수치 + 상태 배지 렌더링
```

---

## 2. API_SOURCE 매핑

**파일:** `src/constants/pollingConfig.js`

```javascript
export const API_SOURCE = {
  CLIMATE: [
    'xouttemp', 'xintemp1', 'xinhum1', 'xco2',
    'xinsunvol', 'xventtemp1', 'xheattemp1', 'xhumlack',
    // ... 총 ~22개 제어기 필드
    'now_ec', 'now_ph', 'water_con',  // 일부 양액 필드도 포함
  ],
  FARM_MANAGING: ['daily_shipment_kg', 'monthly_sales_total', ...],  // 11개 (미연결)
  GROWTH: ['chojang', 'julggi', 'num_leaves', ...],                  // 10개 (미연결)
  LABOR: ['task_rate'],                                               // 1개 (미연결)
}
```

---

## 3. 캐시 구조 (_zoneCache)

**파일:** `src/hooks/useKpiPolling.js`

```javascript
// 모듈 레벨 캐시 (컴포넌트 언마운트 후에도 유지)
const _zoneCache = {}
// {
//   [zoneId]: {
//     fields: { xintemp1: 22.5, xinhum1: 68.3, ... },
//     ts: 1743200000000,           // epoch ms
//     lastReceivedAt: "2026-03-30T10:00:00Z"
//   }
// }

const CACHE_TTL = 28_000  // 28초 (30초 폴링보다 2초 짧게 설정)

const _zonePending = {}   // 중복 요청 방지 (promise dedup)
```

**fetchZoneData(zoneId) 흐름:**
1. 캐시 유효 여부 확인 (`Date.now() - ts < CACHE_TTL`)
2. 유효하면 캐시 즉시 반환
3. `_zonePending[zoneId]` 진행 중이면 해당 Promise 재사용
4. 새 요청: `GET /api/zone/{id}/controller` + `GET /api/zone/{id}/nutrient` 병렬 실행

---

## 4. 초기화 시퀀스

```
컴포넌트 마운트
  │
  ├─▶ load() 즉시 실행                    ← (1) 빠른 첫 화면
  │     현재 캐시에서 KPI 값 렌더링
  │
  ├─▶ _loadHistoryFromDB() 비동기 시작    ← (2) SQLite 12h 데이터 로드
  │     /api/zone/{id}/recent + /api/logs
  │
  └─▶ _loadHistoryFromDB 완료 콜백
        └─▶ load() 재호출                 ← (3) 히스토리 로드 후 스파크라인 보장
```

> **이유:** 스파크라인은 `_kpiHistory`에 데이터가 있어야 렌더링됨.
> DB 로드 전 첫 `load()`는 현재값만 표시, DB 로드 후 재호출로 스파크라인 완성.

---

## 5. KPI 상태 판정 (resolveKpiStatus)

**파일:** `src/utils/kpiStatusResolver.js`

```javascript
export function resolveKpiStatus(apiId, value, lastReceivedAt, yMin, yMax, isAvailable)
```

| 우선순위 | 상태 | 조건 |
|---------|------|------|
| 1 | `NO_API` | `apiId`가 없음 (미연결 KPI) |
| 2 | `SENSOR_LOST` | `isAvailable === false` |
| 3 | `LOADING` | `lastReceivedAt === undefined` (첫 수신 전) |
| 4 | `STALE_CRIT` | 마지막 수신 후 10분 초과 |
| 5 | `STALE_WARN` | 마지막 수신 후 5분 초과 |
| 6 | `NULL_DATA` | `value === null || value === undefined` |
| 7 | `SENSOR_FAULT` | `value < -999 || value > 9999` |
| 8 | `OUT_OF_RANGE` | `value < yMin || value > yMax` |
| 9 | `OK` | 정상 범위 |

---

## 6. 폴링 타이밍 설정

```javascript
// src/hooks/useKpiPolling.js
const POLLING = {
  KPI_INTERVAL_MS:     60_000,   // 60초 주기
  REQUEST_TIMEOUT_MS:  3_000,    // 요청 타임아웃
  RETRY_COUNT:         2,        // 실패 시 재시도
  RETRY_DELAY_MS:      1_500,    // 재시도 대기
  STALE_WARN_MS:       5 * 60_000,    // 5분 → STALE_WARN
  STALE_CRIT_MS:       10 * 60_000,   // 10분 → STALE_CRIT
}
```

---

## 7. 히스토리 & 스파크라인

```javascript
// 모듈 레벨 히스토리 (구역×필드별)
const _kpiHistory = {}
// {
//   [kpiId]: [
//     { value: 22.5, ts: 1743200000000 },
//     ...
//   ]
// }

const HISTORY_MS    = 24 * 60 * 60_000  // 24시간 윈도우
const SPARK_POINTS  = 80                 // 스파크라인 최대 포인트 수
```

**_getSparkline(id):**
- `_kpiHistory[id]`에서 `HISTORY_MS` 이내 데이터 필터
- 80포인트로 균등 다운샘플 (길이 초과 시)
- `number[]` 반환 → recharts `<LineChart>` 또는 인라인 SVG에 전달

---

## 8. 위젯 타입 7종

**파일:** `src/components/Widget.jsx`, `src/pages/DashboardPage.jsx`

| 타입 | `cardType` 값 | 설명 |
|------|--------------|------|
| ChartMain | `'chart-main'` | 라인 차트 + 현재값 + 밴드 오버레이 |
| Stat | `'stat'` | 수치 강조 카드 (대형 폰트) |
| MultiLine | `'multi-line'` | 복수 KPI 라인 차트 |
| Computed | `'computed'` | 계산 값 (ex. 이슬점) |
| GaugeSet | `'gauge-set'` | 원형 게이지 그룹 |
| StatusPanel | `'status-panel'` | ON/OFF 상태 패널 |
| AvgTemp | `'avg-temp'` | 구역 평균 온도 |

**기본 위젯 설정 (DEFAULT_WIDGETS):**
```javascript
// src/pages/DashboardPage.jsx
const DEFAULT_WIDGETS = {
  w1: { type: 'chart-main', title: '내부 온도', kpiId: 'xintemp1' },
  w2: { type: 'chart-main', title: '내부 습도', kpiId: 'xinhum1' },
  w3: { type: 'chart-main', title: 'CO₂ 농도', kpiId: 'xco2' },
  w4: { type: 'chart-main', title: '급액 EC',  kpiId: 'now_ec' },
  w5: { type: 'chart-main', title: '함수율',   kpiId: 'water_con' },
}
```

---

## 9. react-grid-layout 브레이크포인트

**파일:** `src/pages/DashboardPage.jsx`

```javascript
const BREAKPOINTS    = { xl: 1600, lg: 1200, md: 900, sm: 600, xs: 0 }
const RESPONSIVE_COLS = { xl: 20,   lg: 16,   md: 10,  sm: 6,  xs: 4 }
const ROW_H          = 80    // 픽셀
const MARGIN         = [12, 12]
const PAD            = [16, 16]
```

**기본 레이아웃 (xl, 20컬럼):**
```javascript
const DEFAULT_LAYOUT_BASE = [
  { i: 'w1', x: 0,  y: 0, w: 4, h: 3, minW: 2, minH: 2 },
  { i: 'w2', x: 4,  y: 0, w: 4, h: 3, minW: 2, minH: 2 },
  { i: 'w3', x: 8,  y: 0, w: 4, h: 3, minW: 2, minH: 2 },
  { i: 'w4', x: 12, y: 0, w: 4, h: 3, minW: 2, minH: 2 },
  { i: 'w5', x: 16, y: 0, w: 4, h: 3, minW: 2, minH: 2 },
]
```

---

## 10. localStorage 키 목록

| 키 | 값 형식 | 설명 |
|----|---------|------|
| `dashboard:layouts` | `{ xl: [...], lg: [...], md: [...], sm: [...], xs: [...] }` | 반응형 레이아웃 |
| `dashboard:layout` | `[{i, x, y, w, h}, ...]` | 레거시 단일 레이아웃 |
| `dashboard:widgets` | `{ w1: {type, title, kpiId}, ... }` | 위젯 설정 맵 |
| `topbanner:slots` | `[{id, title, unit, ...}, ...]` | TopBanner 슬롯 선택 |
| `farm:config` | `{ farmName, zones, adminPassword, ... }` | 농장 전체 설정 |

**초기화 (대시보드 리셋):**
```javascript
// DashboardPage.jsx - handleResetDashboard()
localStorage.removeItem('dashboard:layouts')
localStorage.removeItem('dashboard:layout')
localStorage.removeItem('dashboard:widgets')
// 이후 key state 증가 → 컴포넌트 강제 언마운트/재마운트
```
