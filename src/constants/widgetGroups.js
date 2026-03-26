/**
 * 위젯 그룹 정의 — WidgetPicker 분류 체계
 *
 * 각 그룹은 사용자에게 의미 있는 업무 단위로 묶인 위젯 집합.
 * widgets 배열의 각 항목은 onAdd()에 전달될 위젯 config 객체.
 */

export const WIDGET_GROUPS = [
  {
    id:    'outdoor-env',
    title: '외부 기상 환경 및 제어 부하',
    items: [
      {
        id: 'xouttemp',
        type: 'chart-main', title: '외부 온도',
        kpiId: 'xouttemp', unit: '°C',
        requiredIds: ['xouttemp'],
      },
      {
        id: 'xwindsp',
        type: 'chart-main', title: '외부 풍속',
        kpiId: 'xwindsp', unit: 'm/s',
        requiredIds: ['xwindsp'],
      },
      {
        id: 'xwinddirec',
        type: 'chart-main', title: '외부 풍향',
        kpiId: 'xwinddirec', unit: '°',
        requiredIds: ['xwinddirec'],
      },
      {
        id: 'xsunvol',
        type: 'chart-main', title: '외부 일사량',
        kpiId: 'xsunvol', unit: 'W/m²',
        requiredIds: ['xsunvol'],
      },
      {
        id: 'heat_load',
        type: 'computed', title: '난방부하도',
        kpiId: 'xheattemp1', kpiId2: 'xouttemp',
        formula: 'subtract', unit: '°C',
        description: '난방설정온도 − 외부온도',
        requiredIds: ['xheattemp1', 'xouttemp'],
      },
    ],
  },
  {
    id:    'indoor-microclimate',
    title: '실내 미기상 및 생리 환경',
    items: [
      { id: 'xintemp1',          type: 'chart-main', title: '내부 온도',      kpiId: 'xintemp1',      unit: '°C',         requiredIds: ['xintemp1'] },
      { id: 'xinhum1',           type: 'chart-main', title: '내부 습도',      kpiId: 'xinhum1',       unit: '%',          requiredIds: ['xinhum1'] },
      { id: 'xabhum',            type: 'chart-main', title: '절대 습도',      kpiId: 'xabhum',        unit: 'g/m³',       requiredIds: ['xabhum'] },
      { id: 'xdhum',             type: 'chart-main', title: '이슬점',         kpiId: 'xdhum',         unit: '°C',         requiredIds: ['xdhum'] },
      { id: 'xhumlack',          type: 'chart-main', title: '수분부족분',     kpiId: 'xhumlack',      unit: 'g/m³',       requiredIds: ['xhumlack'] },
      { id: 'xco2',              type: 'chart-main', title: 'CO₂ 농도',      kpiId: 'xco2',          unit: 'ppm',        requiredIds: ['xco2'] },
      {
        id: 'vpd_kpa', type: 'computed', title: 'VPD (kPa)',
        description: '공기포화차 — 온도·습도 열역학 계산',
        kpiId: 'xintemp1', kpiId2: 'xinhum1', formula: 'vpd', unit: 'kPa',
        requiredIds: ['xintemp1', 'xinhum1'],
      },
      {
        id: 'condensation_risk', type: 'computed', title: '결로 위험 지수',
        description: '내부온도 − 이슬점',
        kpiId: 'xintemp1', kpiId2: 'xdhum', formula: 'subtract', unit: '°C',
        requiredIds: ['xintemp1', 'xdhum'],
      },
      {
        id: 'par', type: 'computed', title: 'PAR',
        description: '광합성 유효광량 (내부일사량 × 2.1)',
        kpiId: 'xinsunvol', formula: 'multiply_const', constant: 2.1, unit: 'μmol/m²/s',
        requiredIds: ['xinsunvol'],
      },
    ],
  },
  {
    id:    'heating-energy',
    title: '난방 및 에너지 관리',
    items: [
      { id: 'Xsupplytemp1', type: 'chart-main', title: '난방 공급온도', kpiId: 'Xsupplytemp1', unit: '°C', requiredIds: ['Xsupplytemp1'] },
      { id: 'Xreturntemp1', type: 'chart-main', title: '난방 회수온도', kpiId: 'Xreturntemp1', unit: '°C', requiredIds: ['Xreturntemp1'] },
      {
        id: 'pipe_heat_loss', type: 'computed', title: '배관열 방출률',
        description: '공급온도 − 회수온도',
        kpiId: 'Xsupplytemp1', kpiId2: 'Xreturntemp1', formula: 'subtract', unit: '°C',
        requiredIds: ['Xsupplytemp1', 'Xreturntemp1'],
      },
      {
        id: 'heat_load', type: 'computed', title: '난방부하도',
        description: '난방설정온도 − 외부온도',
        kpiId: 'xheattemp1', kpiId2: 'xouttemp', formula: 'subtract', unit: '°C',
        requiredIds: ['xheattemp1', 'xouttemp'],
      },
    ],
  },
  {
    id:    'nutrient-irrigation',
    title: '양액·관수',
    items: [
      { id: 'now_ec',      type: 'chart-main', title: '급액 EC',   kpiId: 'now_ec',      unit: 'dS/m', requiredIds: ['now_ec'] },
      { id: 'now_ph',      type: 'chart-main', title: '급액 pH',   kpiId: 'now_ph',      unit: 'pH',   requiredIds: ['now_ph'] },
      { id: 'water_con',   type: 'chart-main', title: '함수율',     kpiId: 'water_con',   unit: '%',    requiredIds: ['water_con'] },
      { id: 'medium_ec',   type: 'chart-main', title: '배지 EC',   kpiId: 'medium_ec',   unit: 'dS/m', requiredIds: ['medium_ec'] },
      { id: 'medium_temp', type: 'chart-main', title: '배지 온도', kpiId: 'medium_temp', unit: '°C',   requiredIds: ['medium_temp'] },
      { id: 'pi_ec',       type: 'chart-main', title: '배액 EC',   kpiId: 'pi_ec',       unit: 'dS/m', requiredIds: ['pi_ec'] },
    ],
  },
  // 추가 그룹은 여기에 계속 등록
]
