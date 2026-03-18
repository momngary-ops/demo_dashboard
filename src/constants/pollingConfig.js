export const POLLING = {
  KPI_INTERVAL_MS:     30_000,
  WEATHER_INTERVAL_MS: 300_000,
  REQUEST_TIMEOUT_MS:  3_000,
  RETRY_COUNT:         2,
  RETRY_DELAY_MS:      1_500,
  STALE_WARN_MS:       5 * 60_000,   // 5분 초과 → 주황색 경고
  STALE_CRIT_MS:       10 * 60_000,  // 10분 초과 → 빨간색 + 흐림
}
