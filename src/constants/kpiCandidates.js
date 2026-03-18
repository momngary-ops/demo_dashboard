/** 15개 KPI 후보 풀 */
export const KPI_CANDIDATES = [
  // 환경·제어 (6)
  { id: 'xintemp1',          title: '내부 온도',    unit: '°C',    icon: '🌡️', bgColor: '#10b981', yMin: 10,   yMax: 40,   category: '환경·제어' },
  { id: 'xouttemp',          title: '외부 온도',    unit: '°C',    icon: '☀️', bgColor: '#f59e0b', yMin: -15,  yMax: 40,   category: '환경·제어' },
  { id: 'xinhum1',           title: '내부 습도',    unit: '%',     icon: '💧', bgColor: '#f59e0b', yMin: 0,    yMax: 100,  category: '환경·제어' },
  { id: 'xco2',              title: 'CO2 농도',    unit: 'ppm',   icon: '💨', bgColor: '#10b981', yMin: 300,  yMax: 1500, category: '환경·제어' },
  { id: 'now_ec',            title: '급액 EC',     unit: 'dS/m',  icon: '⚗️', bgColor: '#3b82f6', yMin: 0,    yMax: 5,    category: '환경·제어' },
  { id: 'now_ph',            title: '급액 pH',     unit: 'pH',    icon: '🧪', bgColor: '#3b82f6', yMin: 4,    yMax: 8,    category: '환경·제어' },
  // 생산·작업 (5)
  { id: 'xsunadd',           title: '누적일사량',   unit: 'MJ/m²', icon: '🌞', bgColor: '#f59e0b', yMin: 0,    yMax: null, category: '생산·작업' },
  { id: 'daily_shipment_kg', title: '수확량',      unit: 'kg',    icon: '🌿', bgColor: '#10b981', yMin: 0,    yMax: null, category: '생산·작업' },
  { id: 'allocated_volume',  title: '출하량',      unit: 'kg',    icon: '📦', bgColor: '#3b82f6', yMin: 0,    yMax: null, category: '생산·작업' },
  { id: 'task_rate',         title: '작업 완수율',  unit: '%',     icon: '✅', bgColor: '#10b981', yMin: 0,    yMax: 100,  category: '생산·작업' },
  { id: 'projected_yield',   title: '수확량 예측',  unit: 'kg',    icon: '📈', bgColor: '#3b82f6', yMin: 0,    yMax: null, category: '생산·작업' },
  // 재무·시장 (4)
  { id: 'market_price_kg',   title: '도매시장가격', unit: '원/kg', icon: '📊', bgColor: '#3b82f6', yMin: null, yMax: null, category: '재무·시장' },
  { id: null,                title: '원가(단가)',   unit: '원',    icon: '💰', bgColor: '#ef4444', yMin: null, yMax: null, category: '재무·시장' },
  { id: 'cost_electricity',  title: '에너지비용',   unit: '원',    icon: '⚡', bgColor: '#ef4444', yMin: 0,    yMax: null, category: '재무·시장' },
  { id: null,                title: '인건비',      unit: '원',    icon: '👷', bgColor: '#ef4444', yMin: 0,    yMax: null, category: '재무·시장' },
]

/** 기본 활성 슬롯 5개 */
export const DEFAULT_SLOT_CONFIGS = [
  KPI_CANDIDATES[0],  // 내부 온도
  KPI_CANDIDATES[2],  // 내부 습도
  KPI_CANDIDATES[3],  // CO2
  KPI_CANDIDATES[8],  // 출하량
  KPI_CANDIDATES[14], // 인건비 (NO_API 데모용)
]
