export const POLLING = {
  KPI_INTERVAL_MS:     30_000,
  WEATHER_INTERVAL_MS: 300_000,
  REQUEST_TIMEOUT_MS:  3_000,
  RETRY_COUNT:         2,
  RETRY_DELAY_MS:      1_500,
  STALE_WARN_MS:       5 * 60_000,   // 5분 초과 → 주황색 경고
  STALE_CRIT_MS:       10 * 60_000,  // 10분 초과 → 빨간색 + 흐림
}

// 각 KPI가 어떤 API 엔드포인트에서 제공되는지 정의
// 실제 API 연동 시 useKpiPolling.js의 fetch URL 구성에 사용
export const API_SOURCE = {
  CLIMATE:       ['xintemp1', 'xouttemp', 'xinhum1', 'xco2', 'now_ec', 'now_ph', 'xsunadd'],
  FARM_MANAGING: ['daily_shipment_kg', 'allocated_volume_kg', 'projected_yield_ton',
                  'market_price_kg', 'cost_electricity'],
  GROWTH:        ['chojang', 'julggi', 'num_fruit', 'harvest_grp'],
  LABOR:         ['task_rate'],
}

// TODO: 실제 API 엔드포인트 (예시)
// CLIMATE       → GET /api/climate/latest?zone={zoneId}&fields={id}
// FARM_MANAGING → GET /api/farm-managing/latest?fields={id}
// GROWTH        → GET /api/growth/latest?fields={id}
// LABOR         → GET /api/labor/task-rate?date={today}
