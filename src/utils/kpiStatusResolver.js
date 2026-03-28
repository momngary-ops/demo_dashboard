import { POLLING } from '../constants/pollingConfig'

const SENSOR_FAULT_BOUNDS = { min: -999, max: 9999 }

/**
 * KPI 데이터 상태 판정
 * @param {boolean} isAvailable capabilities 목록에 존재 여부 (false → SENSOR_LOST)
 * @returns {'OK'|'LOADING'|'NULL_DATA'|'SENSOR_FAULT'|'STALE_WARN'|'STALE_CRIT'|'API_TIMEOUT'|'NO_API'|'OUT_OF_RANGE'|'SENSOR_LOST'}
 */
export function resolveKpiStatus(apiId, value, lastReceivedAt, yMin, yMax, isAvailable = true) {
  if (!apiId) return 'NO_API'
  if (!isAvailable) return 'SENSOR_LOST'
  if (lastReceivedAt === undefined) return 'LOADING'

  const ageMs = Date.now() - new Date(lastReceivedAt).getTime()
  if (ageMs > POLLING.STALE_CRIT_MS) return 'STALE_CRIT'
  if (ageMs > POLLING.STALE_WARN_MS) return 'STALE_WARN'

  if (value === null || value === undefined) return 'NULL_DATA'
  // yMax가 null(상한 없음)인 센서는 상한 SENSOR_FAULT 체크 스킵 (누적값 등)
  const faultUpper = yMax !== null && yMax !== undefined ? SENSOR_FAULT_BOUNDS.max : Infinity
  if (value < SENSOR_FAULT_BOUNDS.min || value > faultUpper) return 'SENSOR_FAULT'

  if (yMin !== null && yMin !== undefined && yMax !== null && yMax !== undefined) {
    if (value < yMin || value > yMax) return 'OUT_OF_RANGE'
  }

  return 'OK'
}
