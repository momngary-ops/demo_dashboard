import { POLLING } from '../constants/pollingConfig'

const SENSOR_FAULT_BOUNDS = { min: -999, max: 9999 }

/**
 * KPI 데이터 상태 판정
 * @returns {'OK'|'LOADING'|'NULL_DATA'|'SENSOR_FAULT'|'STALE_WARN'|'STALE_CRIT'|'API_TIMEOUT'|'NO_API'|'OUT_OF_RANGE'}
 */
export function resolveKpiStatus(apiId, value, lastReceivedAt, yMin, yMax) {
  if (!apiId) return 'NO_API'
  if (lastReceivedAt === undefined) return 'LOADING'

  const ageMs = Date.now() - new Date(lastReceivedAt).getTime()
  if (ageMs > POLLING.STALE_CRIT_MS) return 'STALE_CRIT'
  if (ageMs > POLLING.STALE_WARN_MS) return 'STALE_WARN'

  if (value === null || value === undefined) return 'NULL_DATA'
  if (value < SENSOR_FAULT_BOUNDS.min || value > SENSOR_FAULT_BOUNDS.max) return 'SENSOR_FAULT'

  if (yMin !== null && yMin !== undefined && yMax !== null && yMax !== undefined) {
    if (value < yMin || value > yMax) return 'OUT_OF_RANGE'
  }

  return 'OK'
}
