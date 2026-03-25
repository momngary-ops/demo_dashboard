/**
 * KPI 카드 후보 풀
 *
 * 데이터 스키마 출처: 01. DATA SCHEME/
 *   - 환경·양액 (001~067): CLIMATE COMPUTER INPUT.pdf
 *   - 생육 (068~):        GROWTH INPUT.pdf
 *   - 경영 (100~):        FARM MANAGING INPUT.pdf
 *
 * 가용 여부: 구역 등록 + 연결 테스트 후 CapabilitiesContext의 availableFields 기준으로 결정
 */

// ─────────────────────────────────────────────
// 환경·제어  (복합환경제어기 + 기상 데이터, 1분 간격)
// ─────────────────────────────────────────────
const ENV = [
  {
    id: 'xintemp1',   title: '내부 온도',    unit: '°C',
    icon: '🌡️', bgColor: 'rgba(16,185,129,0.55)',
    yMin: 10,  yMax: 40,   category: '환경·제어',
    data_no: '020',
    cardType: 'chart-main',
    subRows: [
      { label: '현재값', showTrend: true, showDelta: true, deltaWindowMin: 30 },
      { label: '환기설정 / 난방설정', kpiId: 'xventtemp1', kpiId2: 'xheattemp1', unit: '°C' },
    ],
  },
  {
    id: 'xinhum1',    title: '내부 습도',    unit: '%',
    icon: '💧', bgColor: 'rgba(59,130,246,0.55)',
    yMin: 0,   yMax: 100,  category: '환경·제어',
    data_no: '021',
    cardType: 'chart-main',
    subRows: [
      { label: '현재값', showTrend: true, showDelta: true, deltaWindowMin: 30 },
      { label: '이슬점', kpiId: 'xdhum', unit: '°C' },
    ],
  },
  {
    id: 'xco2',       title: 'CO₂ 농도',    unit: 'ppm',
    icon: '💨', bgColor: 'rgba(16,185,129,0.5)',
    yMin: 0, yMax: 1500, category: '환경·제어',
    data_no: '022',
    cardType: 'chart-main',
    subRows: [
      { label: '현재 농도', showTrend: true, showDelta: true, deltaWindowMin: 30 },
      { label: '설정값', kpiId: 'xco2set', unit: 'ppm' },
    ],
  },
  {
    id: 'xinsunvol',  title: '내부 일사량',  unit: 'W/m²',
    icon: '🌤️', bgColor: 'rgba(245,158,11,0.55)',
    yMin: 0,   yMax: 2000, category: '환경·제어',
    data_no: '008',
    cardType: 'chart-main',
    subRows: [
      { label: '실시간', showTrend: true, showDelta: true, deltaWindowMin: 30 },
      { label: '누적 일사량', kpiId: 'xinsunadd', unit: 'J/cm²' },
    ],
  },
  {
    id: 'xinsunadd',  title: '누적 일사량',  unit: 'J/cm²',
    icon: '🌞', bgColor: 'rgba(245,158,11,0.5)',
    yMin: 0,   yMax: null, category: '환경·제어',
    data_no: '009',
  },
  {
    id: 'xventtemp1', title: '환기 온도',    unit: '°C',
    icon: '🌬️', bgColor: 'rgba(99,102,241,0.5)',
    yMin: 10,  yMax: 40,   category: '환경·제어',
    data_no: '040',
  },
  {
    id: 'xheattemp1', title: '난방 온도',    unit: '°C',
    icon: '🔥', bgColor: 'rgba(239,68,68,0.45)',
    yMin: 10,  yMax: 30,   category: '환경·제어',
    data_no: '041',
  },
  {
    id: 'xhumlack',   title: 'VPD',          unit: 'g/m³',
    icon: '📉', bgColor: 'rgba(59,130,246,0.45)',
    yMin: 0,   yMax: 20,   category: '환경·제어',
    data_no: '014',
    cardType: 'chart-main',
    subRows: [
      { label: '현재값', showTrend: true, showDelta: true, deltaWindowMin: 60 },
      { label: '12h 최고 / 최저', type: 'sparkline-range' },
    ],
  },
  {
    id: 'xabhum',     title: '절대 습도',    unit: 'g/m³',
    icon: '🌫️', bgColor: 'rgba(59,130,246,0.5)',
    yMin: 0,   yMax: 35,   category: '환경·제어',
    data_no: '016',
    cardType: 'chart-main',
    subRows: [
      { label: '현재값', showTrend: true, showDelta: true, deltaWindowMin: 30 },
    ],
  },
  {
    id: 'xdhum',      title: '이슬점',       unit: '°C',
    icon: '💦', bgColor: 'rgba(99,102,241,0.45)',
    yMin: -5,  yMax: 25,   category: '환경·제어',
    data_no: '017',
    cardType: 'chart-main',
    subRows: [
      { label: '현재값', showTrend: false, showDelta: false },
    ],
  },
  {
    id: 'xgndtemp',   title: '지온',         unit: '°C',
    icon: '🌱', bgColor: 'rgba(16,185,129,0.45)',
    yMin: 5,   yMax: 30,   category: '환경·제어',
    data_no: '010',
  },
  {
    id: 'xwinddirec', title: '외부 풍향',    unit: '°',
    icon: '🧭', bgColor: 'rgba(99,102,241,0.45)',
    yMin: 0,   yMax: 360,  category: '환경·제어',
    data_no: '004',
    cardType: 'chart-main',
    displayType: 'compass8',
    subRows: [
      { label: '현재 풍향', showTrend: false, showDelta: false },
    ],
  },
  {
    id: 'xwindsp',    title: '외부 풍속',    unit: 'm/s',
    icon: '💨', bgColor: 'rgba(99,102,241,0.5)',
    yMin: 0,   yMax: 15,   category: '환경·제어',
    data_no: '005',
    cardType: 'chart-main',
    subRows: [
      { label: '현재 풍속', showTrend: true, showDelta: true, deltaWindowMin: 30 },
      { label: '최고 / 최저', type: 'sparkline-range' },
    ],
  },
  {
    id: 'xsunvol',    title: '외부 일사량',  unit: 'W/m²',
    icon: '☀️', bgColor: 'rgba(245,158,11,0.5)',
    yMin: 0,   yMax: 1000, category: '환경·제어',
    data_no: '006',
    cardType: 'chart-main',
    subRows: [
      { label: '실시간', showTrend: true, showDelta: true, deltaWindowMin: 30 },
      { label: '누적 일사량', kpiId: 'xsunadd', unit: 'J/cm²' },
    ],
  },
  {
    id: 'xouttemp',   title: '외부 온도',    unit: '°C',
    icon: '🌡️', bgColor: 'rgba(239,68,68,0.4)',
    yMin: -10, yMax: 40,   category: '환경·제어',
    data_no: '003',
    cardType: 'chart-main',
    subRows: [
      { label: '현재 온도', showTrend: true, showDelta: true, deltaWindowMin: 60 },
      { label: '최고 / 최저', type: 'sparkline-range' },
    ],
  },
  {
    id: 'Xsupplytemp1', title: '난방 공급온도', unit: '°C',
    icon: '🔥', bgColor: 'rgba(239,68,68,0.45)',
    yMin: 20, yMax: 90, category: '환경·제어',
    data_no: '018',
    cardType: 'chart-main',
    subRows: [
      { label: '현재값', showTrend: true, showDelta: true, deltaWindowMin: 30 },
    ],
  },
  {
    id: 'Xreturntemp1', title: '난방 회수온도', unit: '°C',
    icon: '🌡️', bgColor: 'rgba(239,68,68,0.4)',
    yMin: 20, yMax: 80, category: '환경·제어',
    data_no: '019',
    cardType: 'chart-main',
    subRows: [
      { label: '현재값', showTrend: true, showDelta: true, deltaWindowMin: 30 },
    ],
  },
]

// xco2set — subrow 전용 (chart-main에서 CO₂ 설정값 표시용, 독립 위젯 아님)
const ENV_SECONDARY = [
  {
    id: 'xco2set', title: 'CO₂ 설정값', unit: 'ppm',
    icon: null, bgColor: null,
    category: '환경·제어', data_no: '023',
  },
]

// ─────────────────────────────────────────────
// 양액·관수  (양액기 데이터, 1분 간격)
// ─────────────────────────────────────────────
const NUTRIENT = [
  {
    id: 'now_ec',     title: '급액 EC',      unit: 'dS/m',
    icon: '⚗️', bgColor: 'rgba(59,130,246,0.55)',
    yMin: 0,   yMax: 5,    category: '양액·관수',
    data_no: '051',
  },
  {
    id: 'now_ph',     title: '급액 pH',      unit: 'pH',
    icon: '🧪', bgColor: 'rgba(99,102,241,0.55)',
    yMin: 4,   yMax: 8,    category: '양액·관수',
    data_no: '053',
  },
  {
    id: 'water_con',  title: '함수율',        unit: '%',
    icon: '💧', bgColor: 'rgba(59,130,246,0.5)',
    yMin: 0,   yMax: 100,  category: '양액·관수',
    data_no: '058',
  },
  {
    id: 'medium_ec',  title: '배지 EC',      unit: 'dS/m',
    icon: '⚗️', bgColor: 'rgba(16,185,129,0.5)',
    yMin: 0,   yMax: 6,    category: '양액·관수',
    data_no: '059',
  },
  {
    id: 'medium_temp', title: '배지 온도',   unit: '°C',
    icon: '🌡️', bgColor: 'rgba(16,185,129,0.45)',
    yMin: 0,   yMax: 30,   category: '양액·관수',
    data_no: '060',
  },
]

// ─────────────────────────────────────────────
// 생육·관찰  (토마토 기준, 수기 또는 로봇 입력)
// ─────────────────────────────────────────────
const GROWTH = [
  {
    id: 'chojang',    title: '초장',         unit: 'cm',
    icon: '📏', bgColor: 'rgba(16,185,129,0.55)',
    yMin: 0,   yMax: 350,  category: '생육·관찰',
    data_no: '068',
  },
  {
    id: 'julggi',     title: '줄기굵기',     unit: 'mm',
    icon: '🌿', bgColor: 'rgba(16,185,129,0.5)',
    yMin: 5,   yMax: 25,   category: '생육·관찰',
    data_no: '069',
  },
  {
    id: 'num_leaves', title: '엽수',         unit: '장',
    icon: '🍃', bgColor: 'rgba(16,185,129,0.45)',
    yMin: 0,   yMax: 20,   category: '생육·관찰',
    data_no: '070',
  },
  {
    id: 'num_flower', title: '화방수',       unit: '개',
    icon: '🌸', bgColor: 'rgba(245,158,11,0.5)',
    yMin: 0,   yMax: 15,   category: '생육·관찰',
    data_no: '072',
  },
  {
    id: 'fruit_loaded', title: '착과군',     unit: '군',
    icon: '🍅', bgColor: 'rgba(239,68,68,0.45)',
    yMin: 0,   yMax: 10,   category: '생육·관찰',
    data_no: '074',
  },
  {
    id: 'num_fruit',  title: '착과수',       unit: '개',
    icon: '🍅', bgColor: 'rgba(245,158,11,0.45)',
    yMin: 0,   yMax: 60,   category: '생육·관찰',
    data_no: '075',
  },
  {
    id: 'harvest_grp',   title: '수확군',       unit: '군',
    icon: '🌾', bgColor: 'rgba(16,185,129,0.6)',
    yMin: 0,   yMax: null, category: '생육·관찰',
    data_no: '077',
  },
  {
    id: 'coloring_grp',  title: '착색군',       unit: '군',
    icon: '🔴', bgColor: 'rgba(239,68,68,0.5)',
    yMin: 0,   yMax: 35,   category: '생육·관찰',
    data_no: '078',
  },
]

// ─────────────────────────────────────────────
// 생산·경영  (일 단위 집계 / 경영 입력)
// ─────────────────────────────────────────────
const BUSINESS = [
  {
    id: 'daily_shipment_kg',    title: '일일 생산량',   unit: 'kg',
    icon: '🌿', bgColor: 'rgba(16,185,129,0.55)',
    yMin: 0,   yMax: null,  category: '생산·경영',
    data_no: '107',
  },
  {
    id: 'avg_daily_yield',      title: '평균 생산량',   unit: 'kg/일',
    icon: '📊', bgColor: 'rgba(16,185,129,0.5)',
    yMin: 0,   yMax: null,  category: '생산·경영',
    data_no: '108',
  },
  {
    id: 'market_price_kg',      title: '도매 시장가',   unit: '원/kg',
    icon: '📈', bgColor: 'rgba(59,130,246,0.55)',
    yMin: null, yMax: null, category: '생산·경영',
    data_no: '123',
  },
  {
    id: 'choolha',              title: '일일 출하액',   unit: '만원',
    icon: '💵', bgColor: 'rgba(59,130,246,0.5)',
    yMin: 0,   yMax: null,  category: '생산·경영',
    data_no: '101',
  },
  {
    id: 'monthly_sales_total',  title: '당월 누적 매출', unit: '만원',
    icon: '💰', bgColor: 'rgba(59,130,246,0.45)',
    yMin: 0,   yMax: null,  category: '생산·경영',
    data_no: '102',
  },
  {
    id: 'fulfillment_rate',     title: '계약 달성률',   unit: '%',
    icon: '✅', bgColor: 'rgba(16,185,129,0.5)',
    yMin: 0,   yMax: 100,   category: '생산·경영',
    data_no: '118',
  },
  {
    id: 'projected_yield_ton',  title: '예상 생산량',   unit: 'ton',
    icon: '📉', bgColor: 'rgba(99,102,241,0.5)',
    yMin: 0,   yMax: null,  category: '생산·경영',
    data_no: '119',
  },
  {
    id: 'cost_electricity',     title: '전력 요금',     unit: '만원',
    icon: '⚡', bgColor: 'rgba(239,68,68,0.45)',
    yMin: 0,   yMax: null,  category: '생산·경영',
    data_no: '105',
  },
]

// ─────────────────────────────────────────────
// 전체 풀 (34개) — 순서 = KPI 선택 모달 표시 순서
// ─────────────────────────────────────────────
export const KPI_CANDIDATES = [...ENV, ...ENV_SECONDARY, ...NUTRIENT, ...GROWTH, ...BUSINESS]

/** chart-main 타입 KPI만 — WidgetPicker 카드메인 섹션용 */
export const CHART_MAIN_CANDIDATES = KPI_CANDIDATES.filter(c => c.cardType === 'chart-main')

// ─────────────────────────────────────────────
// 계산 위젯 정의 — 두 KPI 값의 연산 결과
// ─────────────────────────────────────────────
export const COMPUTED_WIDGETS = [
  {
    id:          'heat_load',
    title:       '난방부하도',
    description: '난방설정온도 − 외부온도',
    icon:        '🔥',
    unit:        '°C',
    kpiId:       'xheattemp1',
    kpiId2:      'xouttemp',
    formula:     'subtract',
    yMin:        -10,
    yMax:        25,
    category:    '계산값',
  },
  {
    id:          'condensation_risk',
    title:       '결로 위험 지수',
    description: '내부온도 − 이슬점',
    icon:        '💦',
    unit:        '°C',
    kpiId:       'xintemp1',
    kpiId2:      'xdhum',
    formula:     'subtract',
    yMin:        0,
    yMax:        10,
    category:    '계산값',
  },
  {
    id:          'pipe_heat_loss',
    title:       '배관열 방출률',
    description: '공급온도 − 회수온도',
    icon:        '🌡️',
    unit:        '°C',
    kpiId:       'Xsupplytemp1',
    kpiId2:      'Xreturntemp1',
    formula:     'subtract',
    yMin:        0,
    yMax:        25,
    category:    '계산값',
  },
  {
    id:          'vpd_kpa',
    title:       'VPD (kPa)',
    description: '공기포화차 — 온도·습도 열역학 계산',
    icon:        '🌬️',
    unit:        'kPa',
    kpiId:       'xintemp1',
    kpiId2:      'xinhum1',
    formula:     'vpd',
    yMin:        0,
    yMax:        3,
    category:    '계산값',
  },
  {
    id:          'par',
    title:       'PAR',
    description: '광합성 유효광량 (내부일사량 × 2.1)',
    icon:        '🌿',
    unit:        'μmol/m²/s',
    kpiId:       'xinsunvol',
    kpiId2:      null,
    formula:     'multiply_const',
    constant:    2.1,
    yMin:        0,
    yMax:        1200,
    category:    '계산값',
  },
]

/**
 * 기본 활성 슬롯 5개
 */
export const DEFAULT_SLOT_CONFIGS = [
  ENV.find(c => c.id === 'xintemp1'),       // 내부온도
  ENV.find(c => c.id === 'xinhum1'),        // 내부습도
  ENV.find(c => c.id === 'xco2'),           // CO₂ 농도
  ENV.find(c => c.id === 'xinsunadd'),      // 내부 누적일사량
  ENV.find(c => c.id === 'xhumlack'),       // VPD
]
