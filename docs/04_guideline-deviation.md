# 04. 가이드라인 & 편차 추적

> 버전: v2.2.3 | 작성일: 2026-03-30

---

## 1. guidelines.json 구조

**월×시간 매트릭스: 12개월 × 24시간 = 288개 행**

```json
{
  "data": {
    "1": [
      {
        "hour": 0,
        "temp_min": 12.6,
        "temp_max": 14.6,
        "hum_min":  83.1,
        "hum_max":  94.7,
        "co2":      502.0
      },
      { "hour": 1, ... },
      ...
      { "hour": 23, ... }
    ],
    "2":  [ ... 24 entries ... ],
    ...
    "12": [ ... 24 entries ... ]
  },
  "alert_config": {
    "enabled":       true,
    "webhookUrl":    "https://outlook.office.com/webhook/...",
    "cooldownMin":   30,
    "flapThreshold": 3
  }
}
```

**필드 설명:**
| 필드 | 단위 | 설명 |
|------|------|------|
| `temp_min` / `temp_max` | °C | 허용 온도 범위 |
| `hum_min` / `hum_max` | % | 허용 습도 범위 |
| `co2` | ppm | CO₂ 목표값 (±10% 허용 여부는 설정에 따름) |

---

## 2. GuidelineContext

**파일:** `src/contexts/GuidelineContext.jsx`

```javascript
// Context 제공 값
{
  guidelines: {          // 전체 12개월 데이터
    "1": [...],
    ...
    "12": [...]
  },
  alertConfig: {
    enabled: boolean,
    webhookUrl: string,
    cooldownMin: number,
    flapThreshold: number,
  },
  getCurrent: () => GuidelineRow,   // 현재 시각 기준 행 반환
  fetchGuidelines: () => Promise,   // 수동 갱신
}
```

**getCurrent() 동작:**
```javascript
function getCurrent() {
  const now = new Date()
  const month = String(now.getMonth() + 1)   // 1~12
  const hour  = now.getHours()                // 0~23
  return guidelines[month]?.[hour] ?? null
}
```

**fetchGuidelines():**
- `GET /api/guidelines` 호출 (8초 타임아웃)
- 응답: `{ data: {...}, alert_config: {...} }`
- 실패 시 기존 state 유지

---

## 3. GuidelineSettingsPage

**파일:** `src/pages/GuidelineSettingsPage.jsx`

**UI 구성:**
```
┌────────────────────────────────────────────────┐
│  가이드라인 설정                                │
│  ┌──────────────────────────────────┐          │
│  │  월 선택 탭: 1월 2월 3월 ... 12월│          │
│  └──────────────────────────────────┘          │
│  ┌──────────────────────────────────┐          │
│  │  Area Chart: 선택된 월의 24시간  │          │
│  │  온도/습도/CO₂ 밴드 시각화       │          │
│  └──────────────────────────────────┘          │
│  ┌──────────────────────────────────┐          │
│  │  편집 테이블 (시간별 수치 직접 입력)         │
│  │  hour | temp_min | temp_max | hum_min | ...│
│  └──────────────────────────────────┘          │
│  [ 저장 ] → POST /api/guidelines               │
└────────────────────────────────────────────────┘
```

---

## 4. useDeviationTracker

**파일:** `src/hooks/useDeviationTracker.js` (122줄)

### 4.1 역할
- 각 KPI 슬롯의 `OUT_OF_RANGE` 지속시간을 측정
- 현재 이탈 중인 경우 경과 시간(ms) 실시간 제공
- 오늘 하루 누적 이탈 시간 계산 (자정 초기화)

### 4.2 반환값

```javascript
// useDeviationTracker(slots)
// → Map<slotId, DeviationInfo>

type DeviationInfo = {
  currentElapsedMs: number,     // 현재 이탈 중인 경우 경과 ms (복귀 시 0)
  todayAccumulatedMs: number,   // 오늘 자정부터 누적 이탈 ms
}
```

### 4.3 localStorage 영속성

```javascript
// 키 형식: 'deviation:{slotId}:{YYYY-MM-DD}'
// 예: 'deviation:xintemp1:2026-03-30'
// 값: number (누적 ms)

// 자정 초기화: 날짜가 바뀌면 자동으로 새 키 생성 (이전 날 키는 방치)
```

### 4.4 타이머 동작

```javascript
// 1초 주기 setInterval
// OUT_OF_RANGE 슬롯이 하나라도 있을 때만 활성화
// 복귀 시 currentElapsedMs = 0, todayAccumulatedMs는 유지
```

### 4.5 formatDuration(ms)

```javascript
// 렌더링 시 사용
// 60_000ms 미만  → '59초'
// 60_000ms 이상  → '12분'
// 3600_000ms 이상 → '1시간 23분'
```

---

## 5. DeviationPanel 컴포넌트

**파일:** `src/components/DeviationPanel/DeviationPanel.jsx`

### 5.1 렌더링 흐름

```
DashboardPage
  │
  ├── useDeviationTracker(slots) → deviationMap
  │
  └── <DeviationPanel
          slots={slots}
          deviationMap={deviationMap}
          guidelines={getCurrent()}
          dismissedIds={dismissedIds}
          onDismiss={(id) => ...}
        />
```

### 5.2 카드 표시 조건

- 슬롯의 `dataStatus === 'OUT_OF_RANGE'`
- AND `dismissedIds`에 포함되지 않음
- 복귀 시 자동 제거 (상태가 `OK`로 바뀌면 해당 카드 사라짐)

### 5.3 레드 카드 강조 조건

다음 중 하나 이상 해당 시 카드 테두리 빨간색:
- `todayAccumulatedMs >= 10 * 60_000` (오늘 누적 10분 이상)
- `|value - 범위중앙| / 범위폭 >= 0.10` (이탈 편차 10% 이상)

### 5.4 패널 레이아웃

```
┌─ 접힌 상태 (3개 이하) ────────────────────────┐
│  [내부 온도 28.5°C]  [CO₂ 550ppm]  [외 1건]  │
└───────────────────────────────────────────────┘

┌─ 펼친 상태 ───────────────────────────────────┐
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌──────┐│
│  │내부 온도│  │내부 습도│  │CO₂ 농도│  │  +  ││
│  │ 28.5°C │  │  72%   │  │ 550ppm │  │      ││
│  │+3.5°C  │  │+2.0%   │  │+48ppm  │  │      ││
│  │현재 12분│  │금일 5분 │  │금일 3분 │  │      ││
│  └────────┘  └────────┘  └────────┘  └──────┘│
│  [ 모두 닫기 ]                                │
└───────────────────────────────────────────────┘
```

### 5.5 닫기(Dismiss) 정책

```javascript
// DashboardPage.jsx
const [dismissedIds, setDismissedIds] = useState(new Set())

// 개별 닫기
onDismiss: (id) => setDismissedIds(prev => new Set([...prev, id]))

// '모두 닫기'
onDismissAll: () => setDismissedIds(new Set(slots.map(s => s.id)))

// 자동 해제: 해당 슬롯이 OUT_OF_RANGE → OK로 복귀하면
// DashboardPage useEffect에서 dismissedIds에서 해당 id 제거
```
