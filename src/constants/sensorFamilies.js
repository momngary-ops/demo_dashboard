/**
 * 다중 인스턴스 센서 패밀리 템플릿
 *
 * capabilities에서 xintemp2, xintemp3 등 KPI_CANDIDATES에 없는 번호 인덱스 필드가
 * 발견되면 이 템플릿을 기반으로 동적 KPI 항목을 자동 생성한다.
 *
 * 패턴: ^([a-z]+)(\d+)$  →  base + num
 * 예시: xintemp2  →  base='xintemp'  →  { ...SENSOR_FAMILIES.xintemp, id:'xintemp2', title:'내부 온도 (센서 2)' }
 *
 * KPI_CANDIDATES에 이미 등록된 ID(xintemp1 등)는 스킵 — 중복 생성 안 함.
 */
export const SENSOR_FAMILIES = {
  xintemp:   { title: '내부 온도',  unit: '°C',   icon: '🌡️', bgColor: 'rgba(16,185,129,0.55)', yMin: 10, yMax: 40,  category: '환경·제어' },
  xinhum:    { title: '내부 습도',  unit: '%',    icon: '💧', bgColor: 'rgba(59,130,246,0.55)', yMin: 0,  yMax: 100, category: '환경·제어' },
  xventtemp: { title: '환기 온도',  unit: '°C',   icon: '🌬️', bgColor: 'rgba(99,102,241,0.5)',  yMin: 10, yMax: 40,  category: '환경·제어' },
  xheattemp: { title: '난방 온도',  unit: '°C',   icon: '🔥', bgColor: 'rgba(239,68,68,0.45)', yMin: 10, yMax: 30,  category: '환경·제어' },
}
