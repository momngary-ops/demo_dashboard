/**
 * KPI 카드 후보 풀
 *
 * 데이터 스키마 출처: 01. DATA SCHEME/
 *   - 환경·양액 (001~067): CLIMATE COMPUTER INPUT.pdf
 *   - 생육 (068~):        GROWTH INPUT.pdf
 *   - 경영 (100~):        FARM MANAGING INPUT.pdf
 *
 * mock 여부: mock CSV 데이터 존재 = true, 미연동 = false (NO_API 표시)
 */

// ─────────────────────────────────────────────
// 환경·제어  (복합환경제어기 + 기상 데이터, 1분 간격)
// ─────────────────────────────────────────────
const ENV = [
  {
    id: 'xintemp1',   title: '내부 온도',    unit: '°C',
    icon: '🌡️', bgColor: 'rgba(16,185,129,0.55)',
    yMin: 10,  yMax: 40,   category: '환경·제어',
    data_no: '020', mock: true,
  },
  {
    id: 'xinhum1',    title: '내부 습도',    unit: '%',
    icon: '💧', bgColor: 'rgba(59,130,246,0.55)',
    yMin: 0,   yMax: 100,  category: '환경·제어',
    data_no: '021', mock: true,
  },
  {
    id: 'xco2',       title: 'CO₂ 농도',    unit: 'ppm',
    icon: '💨', bgColor: 'rgba(16,185,129,0.5)',
    yMin: 300, yMax: 1500, category: '환경·제어',
    data_no: '022', mock: true,
  },
  {
    id: 'xinsunvol',  title: '내부 일사량',  unit: 'W/m²',
    icon: '🌤️', bgColor: 'rgba(245,158,11,0.55)',
    yMin: 0,   yMax: 600,  category: '환경·제어',
    data_no: '008', mock: true,
  },
  {
    id: 'xinsunadd',  title: '누적 일사량',  unit: 'J/cm²',
    icon: '🌞', bgColor: 'rgba(245,158,11,0.5)',
    yMin: 0,   yMax: null, category: '환경·제어',
    data_no: '009', mock: true,
  },
  {
    id: 'xventtemp1', title: '환기 온도',    unit: '°C',
    icon: '🌬️', bgColor: 'rgba(99,102,241,0.5)',
    yMin: 10,  yMax: 40,   category: '환경·제어',
    data_no: '040', mock: true,
  },
  {
    id: 'xheattemp1', title: '난방 온도',    unit: '°C',
    icon: '🔥', bgColor: 'rgba(239,68,68,0.45)',
    yMin: 10,  yMax: 30,   category: '환경·제어',
    data_no: '041', mock: true,
  },
  {
    id: 'xhumlack',   title: '수분 부족분',  unit: 'g/m³',
    icon: '📉', bgColor: 'rgba(59,130,246,0.45)',
    yMin: 0,   yMax: 20,   category: '환경·제어',
    data_no: '014', mock: true,
  },
  {
    id: 'xabhum',     title: '절대 습도',    unit: 'g/m³',
    icon: '🌫️', bgColor: 'rgba(59,130,246,0.5)',
    yMin: 0,   yMax: 35,   category: '환경·제어',
    data_no: '016', mock: true,
  },
  {
    id: 'xdhum',      title: '이슬점',       unit: '°C',
    icon: '💦', bgColor: 'rgba(99,102,241,0.45)',
    yMin: -5,  yMax: 25,   category: '환경·제어',
    data_no: '017', mock: true,
  },
  {
    id: 'xgndtemp',   title: '지온',         unit: '°C',
    icon: '🌱', bgColor: 'rgba(16,185,129,0.45)',
    yMin: 5,   yMax: 30,   category: '환경·제어',
    data_no: '010', mock: true,
  },
  {
    id: 'xwindsp',    title: '풍속',         unit: 'm/s',
    icon: '💨', bgColor: 'rgba(99,102,241,0.5)',
    yMin: 0,   yMax: 15,   category: '환경·제어',
    data_no: '005', mock: true,
  },
  {
    id: 'xsunvol',    title: '외부 일사량',  unit: 'W/m²',
    icon: '☀️', bgColor: 'rgba(245,158,11,0.5)',
    yMin: 0,   yMax: 1000, category: '환경·제어',
    data_no: '006', mock: true,
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
    data_no: '051', mock: true,
  },
  {
    id: 'now_ph',     title: '급액 pH',      unit: 'pH',
    icon: '🧪', bgColor: 'rgba(99,102,241,0.55)',
    yMin: 4,   yMax: 8,    category: '양액·관수',
    data_no: '053', mock: true,
  },
  {
    id: 'water_con',  title: '함수율',        unit: '%',
    icon: '💧', bgColor: 'rgba(59,130,246,0.5)',
    yMin: 40,  yMax: 100,  category: '양액·관수',
    data_no: '058', mock: true,
  },
  {
    id: 'medium_ec',  title: '배지 EC',      unit: 'dS/m',
    icon: '⚗️', bgColor: 'rgba(16,185,129,0.5)',
    yMin: 0,   yMax: 6,    category: '양액·관수',
    data_no: '059', mock: true,
  },
  {
    id: 'medium_temp', title: '배지 온도',   unit: '°C',
    icon: '🌡️', bgColor: 'rgba(16,185,129,0.45)',
    yMin: 10,  yMax: 30,   category: '양액·관수',
    data_no: '060', mock: true,
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
    data_no: '068', mock: false,
  },
  {
    id: 'julggi',     title: '줄기굵기',     unit: 'mm',
    icon: '🌿', bgColor: 'rgba(16,185,129,0.5)',
    yMin: 5,   yMax: 25,   category: '생육·관찰',
    data_no: '069', mock: false,
  },
  {
    id: 'num_leaves', title: '엽수',         unit: '장',
    icon: '🍃', bgColor: 'rgba(16,185,129,0.45)',
    yMin: 0,   yMax: 20,   category: '생육·관찰',
    data_no: '070', mock: false,
  },
  {
    id: 'num_flower', title: '화방수',       unit: '개',
    icon: '🌸', bgColor: 'rgba(245,158,11,0.5)',
    yMin: 0,   yMax: 15,   category: '생육·관찰',
    data_no: '072', mock: false,
  },
  {
    id: 'fruit_loaded', title: '착과군',     unit: '군',
    icon: '🍅', bgColor: 'rgba(239,68,68,0.45)',
    yMin: 0,   yMax: 10,   category: '생육·관찰',
    data_no: '074', mock: false,
  },
  {
    id: 'num_fruit',  title: '착과수',       unit: '개',
    icon: '🍅', bgColor: 'rgba(245,158,11,0.45)',
    yMin: 0,   yMax: 60,   category: '생육·관찰',
    data_no: '075', mock: false,
  },
  {
    id: 'harvest_',   title: '수확군',       unit: '군',
    icon: '🌾', bgColor: 'rgba(16,185,129,0.6)',
    yMin: 0,   yMax: null, category: '생육·관찰',
    data_no: '077', mock: false,
  },
  {
    id: 'coloring_',  title: '착색군',       unit: '군',
    icon: '🔴', bgColor: 'rgba(239,68,68,0.5)',
    yMin: 0,   yMax: 35,   category: '생육·관찰',
    data_no: '078', mock: false,
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
    data_no: '107', mock: false,
  },
  {
    id: 'avg_daily_yield',      title: '평균 생산량',   unit: 'kg/일',
    icon: '📊', bgColor: 'rgba(16,185,129,0.5)',
    yMin: 0,   yMax: null,  category: '생산·경영',
    data_no: '108', mock: false,
  },
  {
    id: 'market_price_kg',      title: '도매 시장가',   unit: '원/kg',
    icon: '📈', bgColor: 'rgba(59,130,246,0.55)',
    yMin: null, yMax: null, category: '생산·경영',
    data_no: '123', mock: false,
  },
  {
    id: 'choolha',              title: '일일 출하액',   unit: '만원',
    icon: '💵', bgColor: 'rgba(59,130,246,0.5)',
    yMin: 0,   yMax: null,  category: '생산·경영',
    data_no: '101', mock: false,
  },
  {
    id: 'monthly_sales_total',  title: '당월 누적 매출', unit: '만원',
    icon: '💰', bgColor: 'rgba(59,130,246,0.45)',
    yMin: 0,   yMax: null,  category: '생산·경영',
    data_no: '102', mock: false,
  },
  {
    id: 'fulfillment_rate',     title: '계약 달성률',   unit: '%',
    icon: '✅', bgColor: 'rgba(16,185,129,0.5)',
    yMin: 0,   yMax: 100,   category: '생산·경영',
    data_no: '118', mock: false,
  },
  {
    id: 'projected_yield',      title: '예상 생산량',   unit: 'ton',
    icon: '📉', bgColor: 'rgba(99,102,241,0.5)',
    yMin: 0,   yMax: null,  category: '생산·경영',
    data_no: '119', mock: false,
  },
  {
    id: 'cost_electricity',     title: '전력 요금',     unit: '만원',
    icon: '⚡', bgColor: 'rgba(239,68,68,0.45)',
    yMin: 0,   yMax: null,  category: '생산·경영',
    data_no: '105', mock: false,
  },
]

// ─────────────────────────────────────────────
// 전체 풀 (34개) — 순서 = KPI 선택 모달 표시 순서
// ─────────────────────────────────────────────
export const KPI_CANDIDATES = [...ENV, ...NUTRIENT, ...GROWTH, ...BUSINESS]

/**
 * 기본 활성 슬롯 5개
 * mock: true 항목 우선 선택 (즉시 데이터 확인 가능)
 */
export const DEFAULT_SLOT_CONFIGS = [
  ENV.find(c => c.id === 'xintemp1'),    // 내부온도
  ENV.find(c => c.id === 'xinhum1'),     // 내부습도
  ENV.find(c => c.id === 'xco2'),        // CO2
  NUTRIENT.find(c => c.id === 'now_ec'), // 급액 EC
  NUTRIENT.find(c => c.id === 'water_con'), // 함수율
]
