const NOW        = new Date().toISOString()
const STALE_7MIN = new Date(Date.now() - 7 * 60_000).toISOString()  // STALE_WARN 데모

function spark(base, count = 20, noise = 0.3) {
  return Array.from({ length: count }, (_, i) =>
    +(base + (Math.random() - 0.5) * noise * 2 * base * 0.1).toFixed(1)
  )
}

/** API별 목 데이터 (스파크라인 포함) */
export const MOCK_API_DATA = {

  // ── 환경·제어 ─────────────────────────────────────────
  xintemp1: {
    value: 24.3,
    data: [23.1, 23.5, 24.0, 24.3, 24.1, 23.8, 24.2, 24.5, 24.3, 24.0, 23.7, 23.9, 24.2, 24.6, 24.4, 24.1, 23.8, 24.0, 24.3, 24.3],
    lastReceivedAt: NOW,
  },
  xinhum1: {
    value: 68,
    data: [67, 68, 69, 68, 67, 66, 67, 68, 69, 70, 69, 68, 67, 66, 67, 68, 68, 67, 68, 68],
    lastReceivedAt: STALE_7MIN,  // STALE_WARN 시연
  },
  xco2: {
    value: 412,
    data: [405, 410, 415, 412, 408, 411, 413, 415, 412, 409, 408, 411, 414, 412, 410, 411, 412, 413, 412, 412],
    lastReceivedAt: NOW,
  },
  xinsunvol: {
    value: 352,
    data: [0, 20, 85, 180, 260, 310, 348, 360, 355, 352, 348, 340, 320, 290, 250, 180, 100, 40, 10, 0],
    lastReceivedAt: NOW,
  },
  xinsunadd: {
    value: 4.2,
    data: [0.0, 0.3, 0.8, 1.4, 2.0, 2.5, 3.0, 3.4, 3.7, 3.9, 4.0, 4.1, 4.15, 4.18, 4.19, 4.2, 4.2, 4.2, 4.2, 4.2],
    lastReceivedAt: NOW,
  },
  xventtemp1: {
    value: 26.0,
    data: spark(26.0),
    lastReceivedAt: NOW,
  },
  xheattemp1: {
    value: 18.0,
    data: spark(18.0, 20, 0.1),
    lastReceivedAt: NOW,
  },
  xhumlack: {
    value: 8.2,
    data: spark(8.2),
    lastReceivedAt: NOW,
  },
  xabhum: {
    value: 21.4,
    data: [20.5, 20.8, 21.0, 21.2, 21.3, 21.4, 21.5, 21.4, 21.3, 21.4, 21.5, 21.4, 21.3, 21.4, 21.4, 21.4, 21.5, 21.4, 21.4, 21.4],
    lastReceivedAt: NOW,
  },
  xdhum: {
    value: 12.8,
    data: spark(12.8),
    lastReceivedAt: NOW,
  },
  xgndtemp: {
    value: 18.5,
    data: spark(18.5, 20, 0.05),
    lastReceivedAt: NOW,
  },
  xwindsp: {
    value: 2.2,
    data: [1.8, 2.0, 2.2, 2.5, 2.3, 2.1, 1.9, 2.2, 2.4, 2.6, 2.5, 2.3, 2.2, 2.0, 1.9, 2.1, 2.3, 2.4, 2.2, 2.2],
    lastReceivedAt: NOW,
  },
  xsunvol: {
    value: 480,
    data: [0, 30, 110, 220, 320, 390, 440, 470, 480, 478, 470, 455, 430, 390, 340, 260, 160, 70, 20, 0],
    lastReceivedAt: NOW,
  },
  xouttemp: {
    value: 18.5,
    data: [17.0, 17.5, 18.0, 18.5, 18.0, 17.8, 18.2, 18.5, 18.6, 18.5],
    lastReceivedAt: NOW,
  },

  // ── 양액·관수 ─────────────────────────────────────────
  now_ec: {
    value: 2.1,
    data: [2.0, 2.1, 2.2, 2.1, 2.0, 2.1, 2.2, 2.1, 2.0, 2.1, 2.1, 2.2, 2.1, 2.0, 2.1, 2.2, 2.1, 2.1, 2.1, 2.1],
    lastReceivedAt: NOW,
  },
  now_ph: {
    value: 6.2,
    data: [6.1, 6.2, 6.3, 6.2, 6.1, 6.2, 6.3, 6.2, 6.1, 6.2, 6.2, 6.3, 6.2, 6.1, 6.2, 6.2, 6.1, 6.2, 6.2, 6.2],
    lastReceivedAt: NOW,
  },
  water_con: {
    value: 65.2,
    data: [78, 76, 73, 70, 67, 64, 62, 64, 66, 68, 67, 65, 63, 62, 64, 66, 65, 65, 65, 65],
    lastReceivedAt: NOW,
  },
  medium_ec: {
    value: 3.0,
    data: spark(3.0, 20, 0.1),
    lastReceivedAt: NOW,
  },
  medium_temp: {
    value: 18.5,
    data: spark(18.5, 20, 0.05),
    lastReceivedAt: NOW,
  },

  // ── 생육·관찰 (수기 입력, 일 단위) ───────────────────
  chojang: {
    value: 293,
    data: [220, 224, 227, 231, 235, 239, 244, 248, 253, 257, 261, 265, 270, 274, 278, 282, 286, 289, 291, 293],
    lastReceivedAt: NOW,
  },
  julggi: {
    value: 12.1,
    data: [11.5, 11.5, 11.6, 11.6, 11.7, 11.7, 11.7, 11.8, 11.8, 11.8, 11.9, 11.9, 11.9, 12.0, 12.0, 12.0, 12.0, 12.1, 12.1, 12.1],
    lastReceivedAt: NOW,
  },
  num_leaves: {
    value: 14,
    data: [8, 8, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 12, 13, 13, 13, 13, 14, 14, 14],
    lastReceivedAt: NOW,
  },
  num_flower: {
    value: 8.33,
    data: [4, 4.33, 5, 5.33, 6, 6.33, 6.66, 7, 7.33, 7.66, 8, 8, 8.33, 8.33, 8.33, 8.33, 8.33, 8.33, 8.33, 8.33],
    lastReceivedAt: NOW,
  },
  fruit_loaded: {
    value: 4.33,
    data: [1, 1.33, 1.66, 2, 2.33, 2.66, 3, 3.33, 3.66, 3.99, 4, 4.33, 4.33, 4.33, 4.33, 4.33, 4.33, 4.33, 4.33, 4.33],
    lastReceivedAt: NOW,
  },
  num_fruit: {
    value: 24,
    data: [18, 18, 19, 19, 20, 20, 20, 21, 21, 21, 22, 22, 22, 23, 23, 23, 23, 24, 24, 24],
    lastReceivedAt: NOW,
  },
  'harvest_': {
    value: 3,
    data: [0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
    lastReceivedAt: NOW,
  },
  'coloring_': {
    value: 2,
    data: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    lastReceivedAt: NOW,
  },

  // ── 생산·경영 (일/월 집계) ───────────────────────────
  daily_shipment_kg: {
    value: 340,
    data: [280, 290, 300, 310, 320, 328, 333, 338, 340, 340, 338, 342, 345, 340, 338, 341, 344, 340, 340, 340],
    lastReceivedAt: NOW,
  },
  avg_daily_yield: {
    value: 322,
    data: [295, 300, 305, 308, 311, 314, 316, 318, 319, 320, 321, 321, 322, 322, 322, 322, 322, 322, 322, 322],
    lastReceivedAt: NOW,
  },
  market_price_kg: {
    value: 3200,
    data: [3100, 3150, 3200, 3180, 3220, 3200, 3210, 3195, 3205, 3200, 3180, 3190, 3200, 3210, 3200, 3200, 3200, 3200, 3200, 3200],
    lastReceivedAt: NOW,
  },
  choolha: {
    value: 108,
    data: [85, 88, 92, 96, 100, 103, 105, 106, 107, 108, 107, 108, 108, 108, 108, 108, 108, 108, 108, 108],
    lastReceivedAt: NOW,
  },
  monthly_sales_total: {
    value: 2340,
    data: [0, 120, 250, 390, 520, 660, 810, 960, 1090, 1220, 1360, 1490, 1620, 1740, 1870, 1990, 2100, 2200, 2280, 2340],
    lastReceivedAt: NOW,
  },
  fulfillment_rate: {
    value: 72.5,
    data: [0, 10, 20, 30, 38, 46, 52, 57, 62, 66, 68, 70, 71, 72, 72.5, 72.5, 72.5, 72.5, 72.5, 72.5],
    lastReceivedAt: NOW,
  },
  projected_yield: {
    value: 3.2,
    data: [3.8, 3.7, 3.6, 3.6, 3.5, 3.4, 3.4, 3.3, 3.3, 3.3, 3.2, 3.2, 3.2, 3.2, 3.2, 3.2, 3.2, 3.2, 3.2, 3.2],
    lastReceivedAt: NOW,
  },
  cost_electricity: {
    value: 48,
    data: [35, 37, 39, 41, 42, 43, 44, 45, 46, 47, 47, 47.5, 47.8, 48, 48, 48, 48, 48, 48, 48],
    lastReceivedAt: NOW,
  },
}

/** 외부 온도 고정 카드 목 데이터 */
export const MOCK_EXTERNAL_TEMP = {
  value: 18.5,
  dataStatus: 'OK',
  lastReceivedAt: NOW,
}
