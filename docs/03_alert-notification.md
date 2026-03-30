# 03. 알림 시스템

> 버전: v2.2.3 | 작성일: 2026-03-30

---

## 1. 알림 흐름 개요

```
[ useKpiPolling → slots 배열 ]
  각 slot: { id, value, dataStatus, ... }
         |
         v
[ useAlertNotifier(slots) ]
  슬롯 상태 변화 감시
  OUT_OF_RANGE / STALE_CRIT / SENSOR_FAULT / SENSOR_LOST
         |
    ┌────┴────────────────┐
    v                     v
[ NotificationContext ]  [ teamsNotifier.js ]
  in-app 이력 추가         Teams Webhook POST
  Toast 표시 (최대 3개)    Adaptive Card 전송
```

---

## 2. 감지 대상 알림 상태

**파일:** `src/hooks/useAlertNotifier.js`

```javascript
const ALERT_STATUSES = new Set([
  'OUT_OF_RANGE',   // 측정값이 가이드라인 범위 이탈
  'STALE_CRIT',     // 마지막 수신 10분 초과
  'SENSOR_FAULT',   // 비정상 수치 (< -999 또는 > 9999)
  'SENSOR_LOST',    // 해당 필드가 구역 capabilities에 없음
])
```

---

## 3. FLAPPING 감지 로직

**정의:** 알림 지연 시간 내에 정상 복귀가 3회 이상 반복되는 불안정 센서

```javascript
// 각 슬롯별 내부 상태
outSinceRef[id]  = timestamp   // 알림 상태 진입 시각
flapCountRef[id] = number      // alertDelayMin 내 정상 복귀 횟수

// FLAPPING 트리거 조건:
// - 이전에 ALERT_STATUS 였다가 정상으로 복귀
// - 복귀 시각이 (outSinceRef + alertDelayMin) 이내
// - flapCountRef[id] >= flapThreshold (기본값: 3)
```

**FLAPPING 발생 시:**
1. `addNotification({ status: 'FLAPPING', ... })` → in-app 이력
2. `sendTeamsFlapping()` → Teams 카드 전송
3. `flapCountRef[id] = 0` 초기화

---

## 4. 딜레이 / 쿨다운 정책

| 설정 | 기본값 | 설명 |
|------|--------|------|
| `alertDelayMin` | `0분` | 알림 상태 진입 후 전송 대기 시간 |
| `cooldownMin` | `30분` | 동일 센서×상태 재알림 방지 시간 |
| `flapThreshold` | `3회` | FLAPPING 판정 반복 횟수 |

**쿨다운 체크:**
```javascript
// localStorage 키: 'alert:cd:{id}:{status}'
function isInCooldown(id, status, cooldownMin) {
  const key = `alert:cd:${id}:${status}`
  const last = parseInt(localStorage.getItem(key) || '0')
  return Date.now() - last < cooldownMin * 60_000
}
```

---

## 5. Teams MessageCard 포맷

**파일:** `src/utils/teamsNotifier.js`

모든 카드는 Microsoft Adaptive Card v1.2 형식으로 `/api/admin/notify/teams` 엔드포인트를 통해 전송 (CORS 우회).

### 5.1 경고 카드 (OUT_OF_RANGE)
```
┌─────────────────────────────────┐
│ ⚠️ [경고]  센서명 이탈           │  ← 주황색 헤더
├─────────────────────────────────┤
│ 구역: Zone A                    │
│ 센서: 내부 온도 (xintemp1)       │
│ 현재값: 28.5 °C                 │
│ 허용 범위: 20.0 ~ 25.0 °C       │
└─────────────────────────────────┘
```

### 5.2 복구 카드 (RECOVERED)
```
┌─────────────────────────────────┐
│ ✅ [복구]  센서명 정상화          │  ← 녹색 헤더
├─────────────────────────────────┤
│ 구역: Zone A                    │
│ 현재값: 22.3 °C                 │
└─────────────────────────────────┘
```

### 5.3 FLAPPING 카드
```
┌─────────────────────────────────┐
│ 🔄 [불안정]  센서명 반복 이탈    │  ← 노란색 헤더
├─────────────────────────────────┤
│ 반복 횟수: 3회                   │
│ 최근 이탈값 / 범위               │
└─────────────────────────────────┘
```

### 5.4 장애 카드 (STALE_CRIT / SENSOR_FAULT / SENSOR_LOST)
```
┌─────────────────────────────────┐
│ 🔴 [장애]  센서 장애 또는 통신두절│  ← 빨간색 헤더
├─────────────────────────────────┤
│ 상태: STALE_CRIT / SENSOR_FAULT │
│ 마지막 수신: 10분 전             │
└─────────────────────────────────┘
```

**전송 코드 패턴:**
```javascript
// teamsNotifier.js
export async function sendTeamsAlert(webhookUrl, slot) {
  const payload = buildWarningPayload(slot)
  await fetch('/api/admin/notify/teams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ webhookUrl, payload }),
  })
}
```

---

## 6. NotificationContext

**파일:** `src/contexts/NotificationContext.jsx`

```javascript
// 상태 구조
notifications: [
  {
    id: string,           // 고유 ID (crypto.randomUUID())
    kpiId: string,        // 센서 ID
    status: string,       // OUT_OF_RANGE / FLAPPING / ...
    title: string,        // 표시 이름
    icon: string,         // lucide 아이콘명
    value: number|null,
    unit: string,
    timestamp: string,    // ISO 8601
    read: boolean,
  },
  ...
]
toasts: [...]  // notifications의 최신 3개 서브셋
unreadCount: number
```

**메서드:**
```javascript
addNotification(item)   // 최대 50개 유지 (초과 시 오래된 것 제거)
dismissToast(id)        // Toast 닫기 (notifications에는 유지)
markAllRead()           // 전체 읽음 처리
clearAll()              // 이력 초기화
```

**제한:**
- 이력 최대: **50개**
- 동시 Toast 최대: **3개** (최신순)
- Toast는 자동 dismiss 없음 (사용자 클릭 또는 `dismissToast()` 호출 필요)
