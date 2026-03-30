# 06. 생육데이터 입력 & 내보내기

> 버전: v2.2.3 | 작성일: 2026-03-30

---

## 1. GrowthDataInputPage 기능 흐름

**파일:** `src/pages/GrowthDataInputPage.jsx`

```
페이지 진입
  │
  ├─▶ farmConfig 로드 (localStorage 'farm:config')
  │     작물 목록: cropId + subCropId
  │     구역 목록: farmConfig.zones (하드코딩 없음)
  │
  ├─▶ 기존 기록 로드
  │     localStorage 'growth-input:records'
  │
  └─▶ UI 렌더링
        - 작물/구역 선택
        - 입력 필드 (CROP_SCHEMA 기준)
        - 기록 테이블 + 필터
        - CSV 내보내기
```

---

## 2. localStorage 키

```javascript
'growth-input:records'
// 형식: GrowthRecord[]

type GrowthRecord = {
  id: string,            // crypto.randomUUID()
  date: string,          // 'YYYY-MM-DD'
  cropId: string,        // 'tomato-mature' | 'strawberry'
  zoneId: string,        // 'Z-1' | 'Z-2' | ...
  author: string,        // '신연준 총괄' (현재 하드코딩)
  fields: {
    [fieldId: string]: number | null   // CROP_SCHEMA 필드 값
  },
  createdAt: string,     // ISO timestamp
}
```

---

## 3. 작물/구역 선택

```javascript
// 작물 선택 목록 — farmConfig 참조
const cropOptions = [
  farmConfig.cropId,     // 대표 작물 (예: 'tomato-mature')
  farmConfig.subCropId,  // Sub 작물 (예: 'strawberry')
].filter(Boolean).map(id => ({
  value: id,
  label: CROP_SCHEMA[id]?.label ?? id
}))

// 구역 선택 목록 — farmConfig.zones 참조
const zoneOptions = farmConfig.zones.map(z => ({
  value: z.id,
  label: z.label,
}))
```

> 하드코딩 없음 — 농장 설정 변경 시 자동 반영.

---

## 4. 입력 필드 구성

### 4.1 정수+소수부 피커

숫자 입력에 정수부와 소수부를 별도 스크롤로 분리:

```
초장(cm)
  [  12  ].[  5  ]  cm
   ↑↓          ↑↓
  정수부      소수부

→ 입력값: 12.5
```

### 4.2 unitOptions 단위 선택

```javascript
// CROP_SCHEMA 필드에 unitOptions 있는 경우
{ id: 'julggi', label: '줄기직경', unit: 'mm', unitOptions: null }
// → 단위 고정 (mm)

{ id: 'kwan_jik', label: '관부직경', unit: 'mm', unitOptions: ['mm', 'cm'] }
// → 단위 드롭다운 표시
```

---

## 5. 기간·구역 필터

```
┌──────────────────────────────────────────────────────┐
│ 기간: [2026-01-01] ~ [2026-03-30]                   │
│ 구역: [전체 ▼]                                       │
│ 작물: [전체 ▼]                                       │
│                                              [필터 적용] │
└──────────────────────────────────────────────────────┘
```

필터 상태는 컴포넌트 state로만 관리 (localStorage 미저장).

---

## 6. CSV 내보내기 (UTF-8 BOM)

```javascript
// 한글 파일명 + 엑셀 호환 UTF-8 BOM 처리

function exportToCsv(records) {
  const BOM = '\uFEFF'
  const header = ['날짜', '구역', '작물', '입력자', ...fieldLabels].join(',')
  const rows = records.map(r =>
    [r.date, r.zoneId, r.cropId, r.author, ...fieldValues(r)].join(',')
  )
  const csv = BOM + [header, ...rows].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `생육데이터_${today}.csv`
  a.click()
}
```

> `\uFEFF` BOM 없이 저장 시 엑셀에서 한글 깨짐 발생.

---

## 7. 삭제 시 AdminPasswordModal 연동

```javascript
// 기록 삭제 버튼 클릭
const handleDeleteClick = (recordId) => {
  setPendingDeleteId(recordId)
  setShowPasswordModal(true)
}

// AdminPasswordModal 비밀번호 확인 성공
const handleDeleteConfirmed = () => {
  const updated = records.filter(r => r.id !== pendingDeleteId)
  setRecords(updated)
  localStorage.setItem('growth-input:records', JSON.stringify(updated))
  setShowPasswordModal(false)
  setPendingDeleteId(null)
}
```

---

## 8. 현재 제한사항 & TODO

| 항목 | 현재 상태 | TODO |
|------|----------|------|
| 입력자 | `'신연준 총괄'` 하드코딩 | AuthContext 연동 후 교체 |
| 데이터 저장소 | localStorage만 사용 | 백엔드 API 연동 (`POST /api/growth`) |
| 동기화 | 없음 (단일 브라우저) | 서버 저장 → 다중 기기 지원 |
| 내보내기 형식 | CSV만 지원 | Excel(.xlsx) 추가 고려 |
