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
  // 추가 그룹은 여기에 계속 등록
]
