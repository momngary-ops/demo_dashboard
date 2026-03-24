// ─── 작물 스키마 ──────────────────────────────────────────────────────────────
// 새 작물 추가 시 이 맵에만 항목을 추가하면 됩니다.
// field 옵션:
//   decimalOptions: null → 정수만 / [0, 0.33, ...] → 소수부 버튼
//   unitOptions: null    → unit 고정 표시 / ['cm','inch','π'] → 단위 선택 드롭다운
export const CROP_SCHEMA = {
  'tomato-mature': {
    label: '완숙토마토',
    fields: [
      { id: 'chojang',      label: '초장(cm)',      unit: 'cm', decimalOptions: null,               unitOptions: null },
      { id: 'julggi',       label: '줄기직경(mm)',  unit: 'mm', decimalOptions: null,               unitOptions: null },
      { id: 'iphyeob',      label: '잎(엽폭,cm)',   unit: 'cm', decimalOptions: null,               unitOptions: null },
      { id: 'hwabang_n',    label: '화방수',        unit: '개', decimalOptions: [0, 0.33, 0.66, 0.99], unitOptions: null },
      { id: 'hwabang_h',    label: '화방높이(cm)',  unit: 'cm', decimalOptions: [0, 0.5],           unitOptions: null },
      { id: 'chakgwa',      label: '착과수(개)',    unit: '개', decimalOptions: [0, 0.33, 0.66, 0.99], unitOptions: null },
      { id: 'chakgwa_grp',  label: '착과군(개)',    unit: '개', decimalOptions: [0, 0.33, 0.66, 0.99], unitOptions: null },
      { id: 'sunguk',       label: '성숙과(개)',    unit: '개', decimalOptions: null,               unitOptions: null },
      { id: 'saengjangjum', label: '생장점(mm)',    unit: 'mm', decimalOptions: null,               unitOptions: null },
      { id: 'coloring_grp', label: '착색군(개)',    unit: '개', decimalOptions: [0, 0.33, 0.66, 0.99], unitOptions: null },
    ],
  },

  'strawberry': {
    label: '딸기',
    fields: [
      { id: 'yeobsu',    label: '엽수',     unit: '장',  decimalOptions: null, unitOptions: null },
      { id: 'yeobpok',   label: '엽폭',     unit: 'cm',  decimalOptions: null, unitOptions: null },
      { id: 'yeobjang',  label: '엽장',     unit: 'cm',  decimalOptions: null, unitOptions: null },
      { id: 'gwanbu',    label: '관부직경',  unit: null,  decimalOptions: null, unitOptions: ['cm', 'inch', 'π'] },
      { id: 'hwabang_n', label: '화방수',   unit: '개',  decimalOptions: null, unitOptions: null },
      { id: 'gaehwa',    label: '개화수',   unit: '개',  decimalOptions: null, unitOptions: null },
      { id: 'chakgwa',   label: '착과수',   unit: '개',  decimalOptions: null, unitOptions: null },
    ],
  },
}

// ─── 농장 설정 ────────────────────────────────────────────────────────────────
export const FARM_CONFIG_KEY = 'farm:config'

// ─── 구역 apiConfig 기본값 ────────────────────────────────────────────────────
export function defaultApiConfig() {
  return {
    controllerUrl:   '',      // 제어기 URL (예: http://api.gcsmagma.com/.../1)
    nutrientUrl:     '',      // 양액기 URL (선택, 빈 문자열 = 미사용)
    status:          'disconnected', // 'connected' | 'disconnected' | 'error'
    lastConnected:   null,    // ISO timestamp
    availableFields: [],      // 연결 테스트에서 확인된 필드 목록
    errorMessage:    null,
  }
}

// 구버전 { id, label } → 신버전 { id, label, apiConfig } 으로 자동 마이그레이션
function migrateZone(z) {
  if (z.apiConfig) return z
  return { ...z, apiConfig: defaultApiConfig() }
}

export const DEFAULT_FARM_CONFIG = {
  farmName:      '그린스케이프 대동팜',
  hectares:      10,
  cropId:        'tomato-mature',
  subCropId:     'strawberry',
  // TODO: 농장 관리자 비밀번호 설정/변경 — 현재는 평문 localStorage 저장.
  //       추후 해시 처리 및 서버 인증으로 교체 필요.
  adminPassword: '0852',
  zones: [],  // 기본값: 구역 없음. 관리자가 직접 등록.
}

export function loadFarmConfig() {
  try {
    const raw = localStorage.getItem(FARM_CONFIG_KEY)
    if (!raw) return DEFAULT_FARM_CONFIG
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_FARM_CONFIG,
      ...parsed,
      zones: (parsed.zones ?? []).map(migrateZone),
    }
  } catch {
    return DEFAULT_FARM_CONFIG
  }
}

export function saveFarmConfig(config) {
  try {
    localStorage.setItem(FARM_CONFIG_KEY, JSON.stringify(config))
  } catch { /* quota 초과 무시 */ }
}
