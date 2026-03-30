# 05. 구역 관리 & 동적 필드 탐색

> 버전: v2.2.3 | 작성일: 2026-03-30

---

## 1. CapabilitiesContext

**파일:** `src/contexts/CapabilitiesContext.jsx` (160줄)

### 1.1 역할
- 서버에서 구역별 사용 가능 KPI 필드 목록 조회
- `sensorFamilies.js` 패턴 매칭으로 동적 KPI 후보 생성

### 1.2 Context 값 구조

```javascript
{
  capabilities: null | {
    available: {
      'Z-1': ['xintemp1', 'xinhum1', 'xco2', 'xintemp2', ...],
      'Z-2': ['xintemp1', 'xinhum1'],
    },
    zones: ['Z-1', 'Z-2', ...]
  },
  zoneCapabilities: {
    'Z-1': {
      available: [...],
      loading: false,
      lastFetched: "2026-03-30T10:00:00Z",
      error: null,
    },
    ...
  },
  loading: boolean,
  lastFetched: string | null,
  dynamicCandidates: KpiCandidate[],   // 동적 생성 KPI 목록
  refetch: () => Promise,              // 전체 재탐색
  refetchZone: (zoneId) => Promise,    // 구역 단위 재탐색
}
```

### 1.3 fetchCapabilities() 흐름

```
GET /api/capabilities
  ↓
{ available: { 'Z-1': [...], 'Z-2': [...] }, zones: [...] }
  ↓
buildDynamicCandidates(available)
  ↓
dynamicCandidates 업데이트 → useKpiPolling에서 참조
```

### 1.4 refetchZone(zoneId) 흐름

```
POST /api/admin/zone/{zoneId}/rediscover
  ↓
서버가 구역 API 재호출 → 사용 가능 필드 재탐색
  ↓
GET /api/capabilities 재호출 (전체 갱신)
```

---

## 2. 동적 KPI 생성 (sensorFamilies.js)

**파일:** `src/constants/sensorFamilies.js` (18줄)

### 2.1 SENSOR_FAMILIES 정의

```javascript
export const SENSOR_FAMILIES = {
  xintemp:   { title: '내부 온도',  unit: '°C',  yMin: 0,   yMax: 50  },
  xinhum:    { title: '내부 습도',  unit: '%',   yMin: 0,   yMax: 100 },
  xventtemp: { title: '환기 온도',  unit: '°C',  yMin: 0,   yMax: 50  },
  xheattemp: { title: '난방 온도',  unit: '°C',  yMin: 0,   yMax: 80  },
}
```

### 2.2 동적 KPI 생성 로직

```javascript
// CapabilitiesContext.jsx 내 buildDynamicCandidates()
// 정규식: /^([a-z]+)(\d+)$/

// 예시 필드: 'xintemp2' → prefix='xintemp', index='2'
// kpiCandidates.js에 'xintemp1'은 있지만 'xintemp2'는 없음
// → SENSOR_FAMILIES['xintemp'] 참조하여 동적 생성

for (const field of availableFields) {
  const match = field.match(/^([a-z]+)(\d+)$/)
  if (!match) continue
  const [, prefix, idx] = match
  if (!SENSOR_FAMILIES[prefix]) continue
  if (existsInKpiCandidates(field)) continue  // 이미 정적 정의 존재

  dynamicCandidates.push({
    id: field,
    title: `${SENSOR_FAMILIES[prefix].title} ${idx}`,  // '내부 온도 2'
    unit: SENSOR_FAMILIES[prefix].unit,
    yMin: SENSOR_FAMILIES[prefix].yMin,
    yMax: SENSOR_FAMILIES[prefix].yMax,
    category: 'dynamic',
  })
}
```

**결과:** `xintemp2`, `xintemp3`, `xinhum2`, `xventtemp2` 등이 자동으로 위젯 선택 목록에 추가됨.

---

## 3. FarmSettingsPage

**파일:** `src/pages/FarmSettingsPage.jsx` (300+줄)

### 3.1 구역 CRUD

```
┌──────────────────────────────────────────────────────┐
│  농장 설정                                            │
│                                                      │
│  [+ 구역 추가]                                       │
│                                                      │
│  Zone A (Z-1)                         [편집] [삭제] │
│  ┌────────────────────────────────────────────────┐  │
│  │ 제어기 URL: http://192.168.0.10/api/data       │  │
│  │ 양액기 URL: http://192.168.0.20/api/data       │  │
│  │ 연결 상태: ● 연결됨                             │  │
│  │ 발견 필드: [온도] [습도] [CO₂] [EC] +7         │  │
│  │                          [필드 재탐색]          │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Zone B (Z-2)                         [편집] [삭제] │
│  ...                                                │
└──────────────────────────────────────────────────────┘
```

### 3.2 구역 데이터 구조 (farmSchema.js 기반)

```javascript
// defaultApiConfig() → farmSchema.js
{
  controllerUrl: '',
  nutrientUrl: '',
  status: 'disconnected',      // 'connected' | 'error' | 'pending' | 'disconnected'
  lastConnected: null,         // ISO timestamp
  availableFields: [],         // 탐색된 필드 목록
  errorMessage: null,
}
```

### 3.3 구역 삭제 흐름

```
삭제 버튼 클릭
  → AdminPasswordModal 표시
  → 비밀번호 확인 (기본: '0852')
  → farmConfig.zones에서 제거
  → localStorage 'farm:config' 업데이트
  → CapabilitiesContext.refetch() 호출
```

---

## 4. ZoneApiModal

**파일:** `src/components/ZoneApiModal.jsx`

### 4.1 역할
구역 API URL 설정 및 연결 테스트

### 4.2 UI 흐름

```
[구역 추가] 또는 [편집] 클릭
  → ZoneApiModal 열림

  ┌────────────────────────────────────────┐
  │  구역 설정                              │
  │  구역 이름: [Zone A          ]          │
  │  제어기 URL: [http://...     ] [테스트] │
  │  양액기 URL: [http://...     ] [테스트] │
  │                                        │
  │  연결 테스트 결과:                       │
  │  ● 제어기: 성공 (필드 12개 발견)         │
  │  ✕ 양액기: 타임아웃                     │
  │                                        │
  │  [취소]           [저장]               │
  └────────────────────────────────────────┘
```

### 4.3 연결 테스트

```javascript
// POST /api/admin/zone/{tempId}/rediscover
// 임시 zone_id로 테스트 → 결과 표시 후 실제 저장은 [저장] 클릭 시
```

---

## 5. farmSchema.js

**파일:** `src/constants/farmSchema.js` (102줄)

### 5.1 DEFAULT_FARM_CONFIG

```javascript
export const DEFAULT_FARM_CONFIG = {
  farmName:      '그린스케이프 대동팜',
  hectares:      10,
  cropId:        'tomato-mature',
  subCropId:     'strawberry',
  adminPassword: '0852',   // TODO: 해시 처리 필요
  zones:         [],       // 사용자가 추가
}
```

### 5.2 CROP_SCHEMA

```javascript
export const CROP_SCHEMA = {
  'tomato-mature': {
    label: '완숙토마토',
    fields: [
      { id: 'chojang',     label: '초장(cm)',       unit: 'cm',  decimalOptions: null, unitOptions: null },
      { id: 'julggi',      label: '줄기직경(mm)',    unit: 'mm',  decimalOptions: [0, 1, 2], unitOptions: null },
      { id: 'num_leaves',  label: '잎수(개)',        unit: '개',  decimalOptions: null, unitOptions: null },
      { id: 'flower_cnt',  label: '화방수',          unit: '개',  ... },
      { id: 'fruit_weight', label: '과중(g)',        unit: 'g',   ... },
      // ... 추가 필드
    ]
  },
  'strawberry': {
    label: '딸기',
    fields: [
      { id: 'chojang',     label: '초장(cm)',        unit: 'cm',  ... },
      { id: 'elub_cnt',    label: '엽병수(개)',       unit: '개',  ... },
      // ...
    ]
  }
}
```

### 5.3 defaultZoneAlertConfig()

```javascript
export function defaultZoneAlertConfig() {
  return {
    temp:     { enabled: true,  delay_min: 1  },
    humidity: { enabled: true,  delay_min: 1  },
    co2:      { enabled: true,  delay_min: 10, deviation_pct: 10 },
  }
}
```

### 5.4 localStorage 키

```javascript
'farm:config'  // DEFAULT_FARM_CONFIG 구조 전체 저장
// 구역 추가/삭제/수정 시 즉시 업데이트
```

---

## 6. AdminPasswordModal

**파일:** `src/components/AdminPasswordModal.jsx`

**공유 컴포넌트 — 삭제 작업 전체에서 사용**

```javascript
// 사용 위치:
// - FarmSettingsPage: 구역 삭제
// - GrowthDataInputPage: 생육 기록 삭제

<AdminPasswordModal
  isOpen={showPasswordModal}
  onConfirm={handleDeleteConfirmed}
  onCancel={() => setShowPasswordModal(false)}
/>
```

**기본 비밀번호:** `'0852'` (farmConfig.adminPassword)

> **보안 주의:** 현재 localStorage에 평문 저장. 추후 서버 측 인증으로 교체 필요 (TODO).
