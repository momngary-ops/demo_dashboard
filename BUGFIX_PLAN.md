# 데이터 플로우 버그 수정 기획서

> 작성일: 2026-03-25
> 대상: `C:\Users\박찬형\Desktop\플랫폼 mock-up\dashboard\src\`
> 목적: 구역 등록 후 대시보드 "값없음" 지속 현상 해결

---

## 전체 흐름 요약

```
구역등록(FarmSettingsPage)
  → localStorage 저장 (farmSchema.saveFarmConfig)
  → CapabilitiesContext.updateZoneAvailable (React 상태)
  → DashboardPage: firstZoneId 결정 (zoneCapabilities 기반)
  → useKpiPolling: effectiveZoneId로 API 폴링
  → buildSlot: isAvailable 판정 → resolveKpiStatus
  → Widget/TopBanner KPI 카드 렌더
```

현재 이 흐름의 3개 지점에서 데이터가 끊기거나 잘못 판정되어 "값없음"이 발생한다.

---

## BUG-01 · TopBanner farmConfig 스냅샷 문제

### 현재 코드
```jsx
// src/components/TopBanner/TopBanner.jsx:32
const [farmConfig] = useState(loadFarmConfig)   // mount 시 1회만 실행
```

### 원인
`TopBanner`는 `DashboardPage` 내부에 렌더되며, 페이지 전환 시 **리마운트되지 않는다**.
따라서 `FarmSettingsPage`에서 구역을 추가/삭제한 뒤 Dashboard로 돌아와도
`farmConfig.zones`는 변경 이전 상태 그대로다.

**영향 범위:**
- `activeZoneId = farmConfig.zones[activeZone]?.id` → 존재하지 않는 구역 ID 또는 null
- `useKpiPolling(slotConfigs, activeZoneId)` → wrong zone 폴링
- TopBanner의 **모든 KPI 카드** 값없음 또는 오래된 구역 데이터 표시
- ZoneTabs에 새 구역이 나타나지 않음

### 개선 방향
`farmConfig`를 React state가 아닌, localStorage의 변화를 감지하는 **파생 값**으로 처리한다.

**구현 목표:**
1. `TopBanner`가 localStorage `'farm:config'` 변경을 감지하여 자동 동기화
2. 방법: `window` `storage` 이벤트 + 직접 재로드 트리거를 조합한 커스텀 훅 `useFarmConfig()` 작성
3. 또는 `App.jsx`에서 `farmConfig` state를 관리하고 `TopBanner`에 prop으로 전달

**권장 방법 — App.jsx 중앙관리 방식:**
```
App.jsx
  ├─ const [farmConfig, setFarmConfig] = useState(loadFarmConfig)
  ├─ FarmSettingsPage에 setFarmConfig 콜백 전달
  └─ TopBanner에 farmConfig prop 전달
```
- `FarmSettingsPage`의 `saveFarmConfig()` 호출 직후 `setFarmConfig(cfg)` 호출
- `TopBanner`는 `prop`으로 받은 `farmConfig`를 사용 (useState 제거)

**검증 기준:**
- 구역 추가 → Dashboard 이동 → TopBanner 구역 탭에 새 구역 즉시 표시
- 구역 삭제 → Dashboard 이동 → TopBanner 구역 탭에서 삭제된 구역 제거

---

## BUG-02 · 구역 삭제 시 상태 불일치

### 현재 코드
```jsx
// src/pages/FarmSettingsPage.jsx:122-128
const handleZoneDeleteConfirm = () => {
  setSaved(false)
  setConfig(prev => ({ ...prev, zones: prev.zones.filter(z => z.id !== pendingDeleteId) }))
  fetch(`/api/admin/zone/${pendingDeleteId}`, { method: 'DELETE' }).catch(() => {})
  setPendingDeleteId(null)
  // ← saveFarmConfig() 없음  → localStorage에 삭제된 구역 잔존
  // ← updateZoneAvailable() 없음 → zoneCapabilities에 삭제된 구역 잔존
}
```

### 원인
`handleZoneSave`(추가/수정)는 `saveFarmConfig(next)`를 즉시 호출하지만,
**삭제(handleZoneDeleteConfirm)는 localStorage를 갱신하지 않는다.**
또한 `CapabilitiesContext`에서도 해당 구역을 제거하지 않는다.

**영향 범위:**
- 페이지 새로고침 시 삭제된 구역이 localStorage에서 부활
- `zoneCapabilities`에 삭제된 구역이 남아있어 `firstZoneId`로 선택될 수 있음
- 삭제된 구역 ID로 `/api/zone/{id}/controller` 호출 → 404/에러 → 모든 위젯 API_TIMEOUT

### 개선 방향
삭제 확인 시 localStorage 갱신과 capabilities 동기화를 함께 처리한다.

**구현 목표:**
```jsx
const handleZoneDeleteConfirm = () => {
  setConfig(prev => {
    const next = { ...prev, zones: prev.zones.filter(z => z.id !== pendingDeleteId) }
    saveFarmConfig(next)   // ← 추가: 즉시 localStorage 반영
    return next
  })
  fetch(`/api/admin/zone/${pendingDeleteId}`, { method: 'DELETE' }).catch(() => {})
  removeZoneCapability(pendingDeleteId)  // ← 추가: capabilities에서 제거
  setPendingDeleteId(null)
}
```

`CapabilitiesContext`에 `removeZoneCapability(zoneId)` 함수 추가:
```jsx
const removeZoneCapability = useCallback((zoneId) => {
  setZoneCapabilities(prev => {
    const next = { ...prev }
    delete next[zoneId]
    return next
  })
}, [])
```

**검증 기준:**
- 구역 삭제 → 새로고침 → 삭제된 구역이 재표시되지 않음
- 구역 삭제 → Dashboard → 삭제된 구역으로 API 폴링 시도 없음
- `firstZoneId`가 삭제된 구역을 가리키지 않음

---

## BUG-03 · availableFields 대소문자 불일치 → 일부 KPI SENSOR_LOST

### 현재 코드
```jsx
// src/components/ZoneApiModal.jsx:80-82
// 서버 /api/admin/zone/test 응답의 fields를 그대로 저장
const ctrlF = testResult?.controller?.fields ?? []   // 예: ["XInTemp1", "XCO2", ...]
const allF  = [...new Set([...ctrlF, ...nutF])]
// allF 케이스 정규화 없음 → apiConfig.availableFields에 원본 케이스로 저장

// src/hooks/useKpiPolling.js:120
// 대소문자 구분 있는 Array.includes()
const isAvailable = !zoneAvailable || zoneAvailable.includes(cfg.id)
// cfg.id = "xintemp1" (소문자), zoneAvailable에 "XInTemp1" → false → SENSOR_LOST
```

### 원인
서버가 반환하는 필드명 케이스와 `kpiCandidates`에 정의된 `id`(소문자) 간의 불일치.
`Array.includes()`는 대소문자를 구분하므로, 케이스가 하나라도 다르면 `isAvailable=false`
→ `SENSOR_LOST` 상태 → **"값없음" 표시**.

이 결함은 어떤 필드는 우연히 케이스가 맞아 표시되고, 다른 필드는 안 되어
"**일부만 값없음**" 패턴을 만드는 직접적 원인이다.

### 개선 방향
`availableFields` 저장 시점 또는 비교 시점에 케이스를 통일한다.

**구현 목표 — 저장 시점 정규화 (권장):**
```jsx
// ZoneApiModal.jsx: allF 생성 직후 lowercase 정규화
const allF = [...new Set([...ctrlF, ...nutF])].map(f => f.trim().toLowerCase())
```

이렇게 하면:
- `availableFields = ["xintemp1", "xco2", ...]` (항상 소문자)
- `kpiCandidates.id = "xintemp1"` (소문자)
- `zoneAvailable.includes("xintemp1")` → `true` → 정상 표시

**추가 안전장치 — 비교 시점 정규화:**
```jsx
// useKpiPolling.js:120
const isAvailable = !zoneAvailable
  || zoneAvailable.some(f => f.toLowerCase() === cfg.id?.toLowerCase())
```
이 방식은 이미 저장된 레거시 데이터도 커버한다.

**검증 기준:**
- 구역 등록 후 대시보드에서 `xco2`, `now_ec`, `xinhum1` 등 모든 기본 위젯 정상 표시
- 서버가 대문자로 필드를 반환해도 SENSOR_LOST 없음

---

## BUG-04 · fetchKpi null 반환 시 NO_API → API_TIMEOUT 오표시 (보조)

### 현재 코드
```jsx
// src/hooks/useKpiPolling.js:101-103
async function fetchKpi(cfg, zoneId) {
  const source = Object.entries(API_SOURCE).find(([, ids]) => ids.includes(cfg.id))?.[0]
  if (!source) return null          // API_SOURCE에 없는 KPI → null 반환

  if (source === 'CLIMATE') { ... }
  return null                       // FARM_MANAGING / GROWTH / LABOR → null 반환
}

// src/hooks/useKpiPolling.js:163
results[i]
  ? buildSlot(cfg, results[i], zoneAvailable)
  : { ...cfg, dataStatus: cfg.id ? 'API_TIMEOUT' : 'NO_API' }
  //                              ↑ cfg.id가 있으면 API_TIMEOUT으로 잘못 표시
```

### 원인
`fetchKpi`가 두 경우에 `null`을 반환한다:
1. KPI가 `API_SOURCE` 어디에도 없음 → 실제로는 `NO_API`
2. `FARM_MANAGING` / `GROWTH` / `LABOR` 카테고리 → 미연동 의도적 null

그런데 `load()`에서 null 반환 케이스를 구분하지 않고 일괄 `API_TIMEOUT`으로 처리한다.
이는 사용자에게 "API 요청 실패"처럼 오해를 준다.

### 개선 방향
`fetchKpi`가 null 대신 상태를 명시하는 sentinel 값을 반환하도록 수정한다.

**구현 목표:**
```jsx
// fetchKpi에서 null 대신 상태 코드 반환
if (!source) return { __status: 'NO_API' }

// CLIMATE 외 미연동 카테고리
if (source !== 'CLIMATE') return { __status: 'NO_API' }

// load()에서 처리
slotConfigs.map((cfg, i) => {
  const r = results[i]
  if (!r)                    return { ...cfg, value: null, data: [], dataStatus: 'API_TIMEOUT' }
  if (r.__status === 'NO_API') return { ...cfg, value: null, data: [], dataStatus: 'NO_API' }
  return buildSlot(cfg, r, zoneAvailable)
})
```

**검증 기준:**
- `GROWTH` / `FARM_MANAGING` 카테고리 KPI 위젯이 `API_TIMEOUT`이 아닌 `NO_API` 상태 표시
- 실제 API 호출 실패 시에만 `API_TIMEOUT` 표시

---

## 수정 우선순위 및 파일 목록

| 우선순위 | 버그 | 수정 파일 |
|---|---|---|
| P0 | BUG-03 availableFields 케이스 불일치 | `src/components/ZoneApiModal.jsx` |
| P0 | BUG-02 구역 삭제 상태 불일치 | `src/pages/FarmSettingsPage.jsx`, `src/contexts/CapabilitiesContext.jsx` |
| P1 | BUG-01 TopBanner farmConfig 스냅샷 | `src/App.jsx`, `src/components/TopBanner/TopBanner.jsx`, `src/pages/FarmSettingsPage.jsx` |
| P2 | BUG-04 NO_API 오표시 | `src/hooks/useKpiPolling.js` |

---

## 수정 후 기대 동작 흐름

```
구역 등록 (ZoneApiModal)
  → availableFields 저장 시 lowercase 정규화           [BUG-03 fix]
  → saveFarmConfig() 즉시 호출                         [기존 동작 유지]
  → updateZoneAvailable(zoneId, fields)               [기존 동작 유지]
  → App.jsx의 farmConfig state 갱신                   [BUG-01 fix]

구역 삭제 (FarmSettingsPage)
  → saveFarmConfig() 즉시 호출                         [BUG-02 fix]
  → removeZoneCapability(zoneId)                       [BUG-02 fix]
  → App.jsx의 farmConfig state 갱신                   [BUG-01 fix]

TopBanner 렌더
  → App.jsx에서 prop으로 최신 farmConfig 수신          [BUG-01 fix]
  → 구역 탭에 현재 구역 목록 반영
  → activeZoneId → useKpiPolling → 정상 폴링

DashboardPage 위젯 렌더
  → firstZoneId: 삭제된 구역 제외, 유효한 구역만 선택   [BUG-02 fix]
  → zoneAvailable.includes(cfg.id): 케이스 일치        [BUG-03 fix]
  → isAvailable=true → resolveKpiStatus → OK
  → 값없음 없이 정상 표시
```

---

## 주의사항

- `App.jsx`의 `farmConfig` state 도입 시, `FarmSettingsPage`는 `loadFarmConfig()`로 초기화하되 저장 후 부모의 setter를 호출하는 방식으로 연결한다. `FarmSettingsPage` 자체 state는 유지한다.
- `TopBanner`에서 `useState(loadFarmConfig)` 제거 후 prop 방식으로 전환 시, `farmConfig.zones`가 빈 배열일 때의 방어 처리(`zones[activeZone]?.id ?? null`)는 기존대로 유지한다.
- `availableFields` lowercase 정규화는 **저장 시점**에 한다. 비교 시점 정규화는 레거시 데이터 대응용 보조 수단으로만 사용한다.
- 기존 localStorage에 이미 대소문자가 섞인 `availableFields`가 저장되어 있을 수 있다. `farmSchema.js`의 `loadFarmConfig()`에서 마이그레이션 처리를 추가하는 것을 고려한다.
