export const GAUGE_SET_GROUPS = [
  {
    id: 'window', title: '창 개도',
    items: [
      { id: 'xwinvol1_1', label: '창1 좌' }, { id: 'xwinvol1_2', label: '창1 우' },
      { id: 'xwinvol2_1', label: '창2 좌' }, { id: 'xwinvol2_2', label: '창2 우' },
      { id: 'xwinvol3_1', label: '창3 좌' }, { id: 'xwinvol3_2', label: '창3 우' },
      { id: 'xwinvol4_1', label: '창4 좌' }, { id: 'xwinvol4_2', label: '창4 우' },
      { id: 'xwinvol5_1', label: '창5 좌' }, { id: 'xwinvol5_2', label: '창5 우' },
      { id: 'xwinvol6_1', label: '창6 좌' }, { id: 'xwinvol6_2', label: '창6 우' },
    ],
  },
  {
    id: 'curtain', title: '커튼 개도',
    items: [
      { id: 'xcur1vol', label: '커튼1' }, { id: 'xcur2vol', label: '커튼2' },
      { id: 'xcur3vol', label: '커튼3' }, { id: 'xcur4vol', label: '커튼4' },
      { id: 'xcur5vol', label: '커튼5' },
    ],
  },
  {
    id: 'valve', title: '3Way 밸브',
    items: [
      { id: 'x3way1vol', label: '3Way 1' }, { id: 'x3way2vol', label: '3Way 2' },
    ],
  },
]

export const STATUS_PANEL_GROUPS = [
  {
    id: 'window', title: '창 자수동',
    items: [
      { id: 'xwin1auto',  label: '창1 좌', runId: null },
      { id: 'xwin1auto2', label: '창1 우', runId: null },
      { id: 'xwin2auto',  label: '창2 좌', runId: null },
      { id: 'xwin2auto2', label: '창2 우', runId: null },
      { id: 'xwin3auto',  label: '창3 좌', runId: null },
      { id: 'xwin3auto2', label: '창3 우', runId: null },
      { id: 'xwin4auto',  label: '창4 좌', runId: null },
      { id: 'xwin4auto2', label: '창4 우', runId: null },
      { id: 'xwin5auto',  label: '창5 좌', runId: null },
      { id: 'xwin5auto2', label: '창5 우', runId: null },
      { id: 'xwin6auto',  label: '창6 좌', runId: null },
      { id: 'xwin6auto2', label: '창6 우', runId: null },
    ],
  },
  {
    id: 'curtain', title: '커튼 자수동',
    items: [
      { id: 'xcur1auto', label: '커튼1', runId: null },
      { id: 'xcur2auto', label: '커튼2', runId: null },
      { id: 'xcur3auto', label: '커튼3', runId: null },
      { id: 'xcur4auto', label: '커튼4', runId: null },
      { id: 'xcur5auto', label: '커튼5', runId: null },
    ],
  },
  {
    id: 'device', title: '장치 작동',
    items: [
      { id: 'xco2auto',   label: 'CO₂',     runId: 'xco2run'   },
      { id: 'xlightauto', label: '보광등',   runId: 'xlightrun' },
      { id: 'xhunauto',   label: '훈증기',   runId: 'xhunrun'   },
      { id: 'xboauto',    label: '보일러',   runId: 'xborun'    },
      { id: 'xpumpauto',  label: '순환펌프1', runId: 'xpumprun1' },
      { id: 'xpumpauto',  label: '순환펌프2', runId: 'xpumprun2' },
    ],
  },
  {
    id: 'aux', title: '보조기기',
    items: [
      { id: 'xass1auto', label: '보조기기1', runId: 'xass1run' },
      { id: 'xass2auto', label: '보조기기2', runId: 'xass2run' },
      { id: 'xass3auto', label: '보조기기3', runId: 'xass3run' },
      { id: 'xass4auto', label: '보조기기4', runId: 'xass4run' },
      { id: 'xass5auto', label: '보조기기5', runId: 'xass5run' },
      { id: 'xass6auto', label: '보조기기6', runId: 'xass6run' },
    ],
  },
  {
    id: 'heatcool', title: '냉난방기',
    items: [
      { id: 'XheatandCool1Auto', label: '냉난방기1', runId: 'XheatandCool1Run' },
      { id: 'XheatandCool2Auto', label: '냉난방기2', runId: 'XheatandCool2Run' },
      { id: 'XheatandCool3Auto', label: '냉난방기3', runId: 'XheatandCool3Run' },
      { id: 'XheatandCool4Auto', label: '냉난방기4', runId: 'XheatandCool4Run' },
      { id: 'XheatandCool5Auto', label: '냉난방기5', runId: 'XheatandCool5Run' },
    ],
  },
]

/** 유틸: 모든 actuator field ID 수집 (폴링 설정용) */
export function getAllActuatorIds() {
  const ids = new Set()
  ;[...GAUGE_SET_GROUPS, ...STATUS_PANEL_GROUPS].forEach(g =>
    g.items.forEach(item => {
      ids.add(item.id.toLowerCase())
      if (item.runId) ids.add(item.runId.toLowerCase())
    })
  )
  return [...ids]
}
