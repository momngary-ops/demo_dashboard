export const POLLING = {
  KPI_INTERVAL_MS:     60_000,
  WEATHER_INTERVAL_MS: 300_000,
  REQUEST_TIMEOUT_MS:  3_000,
  RETRY_COUNT:         2,
  RETRY_DELAY_MS:      1_500,
  STALE_WARN_MS:       5 * 60_000,   // 5분 초과 → 주황색 경고
  STALE_CRIT_MS:       10 * 60_000,  // 10분 초과 → 빨간색 + 흐림
}

// 각 KPI가 어떤 API 엔드포인트에서 제공되는지 정의
// mock_data_server.py의 _CLIMATE_FIELDS / _FM_FIELDS / _GROWTH_*_FIELDS / _LABOR_FIELDS 와 일치
export const API_SOURCE = {
  CLIMATE: [
    'xouttemp', 'xwindsp', 'xsunvol', 'xsunadd', 'sunvol', 'sunadd',
    'xgndtemp', 'xgndhum', 'xintemp1', 'in_temp', 'xinhum1', 'in_hum',
    'xco2', 'xinsunvol', 'xinsunadd', 'xsthum', 'xabhum', 'xhumlack',
    'xdhum', 'xventtemp1', 'xheattemp1', 'now_ec', 'now_ph', 'set_ec',
    'set_ph', 'medium_ec', 'medium_temp', 'pi_ec', 'water_con',
  ],
  FARM_MANAGING: [
    'daily_shipment_kg', 'market_price_kg', 'cost_electricity', 'choolha',
    'monthly_sales_total', 'fulfillment_rate', 'projected_yield_ton',
    'allocated_volume_kg', 'target_revenue', 'target_production', 'avg_daily_yield',
  ],
  GROWTH: [
    'chojang', 'julggi', 'num_leaves', 'num_flower',
    'fruit_loaded', 'num_fruit', 'speed_flower', 'speed_fruit',
    'harvest_grp', 'coloring_grp',
  ],
  LABOR: ['task_rate'],
}

// CLIMATE       → GET /api/climate/latest?fields={id}
// FARM_MANAGING → GET /api/farm-managing/latest?fields={id}
// GROWTH        → GET /api/growth/latest?fields={id}
// LABOR         → GET /api/labor/task-rate?date={today}
