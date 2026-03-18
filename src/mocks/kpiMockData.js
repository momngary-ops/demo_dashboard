const NOW        = new Date().toISOString()
const STALE_7MIN = new Date(Date.now() - 7 * 60_000).toISOString()  // STALE_WARN 데모

/** API별 목 데이터 (스파크라인 포함) */
export const MOCK_API_DATA = {
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
  allocated_volume: {
    value: 1250,
    data: [980, 1050, 1100, 1150, 1080, 1090, 1110, 1150, 1180, 1200, 1210, 1220, 1230, 1235, 1240, 1242, 1245, 1248, 1249, 1250],
    lastReceivedAt: NOW,
  },
  xouttemp: {
    value: 18.5,
    data: [17.0, 17.5, 18.0, 18.5, 18.0, 17.8, 18.2, 18.5, 18.6, 18.5],
    lastReceivedAt: NOW,
  },
  now_ec: {
    value: 2.1,
    data: [2.0, 2.1, 2.2, 2.1, 2.0, 2.1, 2.2, 2.1, 2.0, 2.1],
    lastReceivedAt: NOW,
  },
  now_ph: {
    value: 6.2,
    data: [6.1, 6.2, 6.3, 6.2, 6.1, 6.2, 6.3, 6.2, 6.1, 6.2],
    lastReceivedAt: NOW,
  },
  xsunadd: {
    value: 8.4,
    data: [0, 0.8, 2.1, 3.5, 4.9, 6.0, 7.1, 7.8, 8.2, 8.4],
    lastReceivedAt: NOW,
  },
  daily_shipment_kg: {
    value: 340,
    data: [280, 290, 300, 310, 320, 328, 333, 338, 340, 340],
    lastReceivedAt: NOW,
  },
  task_rate: {
    value: 78,
    data: [50, 55, 60, 65, 70, 72, 75, 76, 77, 78],
    lastReceivedAt: NOW,
  },
  projected_yield: {
    value: 420,
    data: [380, 390, 400, 408, 413, 416, 418, 419, 420, 420],
    lastReceivedAt: NOW,
  },
  market_price_kg: {
    value: 3200,
    data: [3100, 3150, 3200, 3180, 3220, 3200, 3210, 3195, 3205, 3200],
    lastReceivedAt: NOW,
  },
  cost_electricity: {
    value: 48000,
    data: [40000, 42000, 44000, 45000, 46000, 47000, 47500, 48000, 48000, 48000],
    lastReceivedAt: NOW,
  },
}

/** 외부 온도 고정 카드 목 데이터 */
export const MOCK_EXTERNAL_TEMP = {
  value: 18.5,
  dataStatus: 'OK',
  lastReceivedAt: NOW,
}
