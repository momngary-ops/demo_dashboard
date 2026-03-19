import { useState, useEffect } from 'react'
import { MOCK_API_DATA } from '../mocks/kpiMockData'
import { resolveKpiStatus } from '../utils/kpiStatusResolver'
// import { API_SOURCE, POLLING } from '../constants/pollingConfig'  // 실제 연동 시 활성화

/**
 * KPI 폴링 훅 (현재 Mock 모드)
 * slotConfigs: KPI_CANDIDATES 항목 배열 (5개)
 *
 * TODO: 실제 API 연동 시 아래 스켈레톤으로 교체
 *
 * async function fetchKpi(cfg, zoneId) {
 *   // API_SOURCE를 순회해 cfg.id 가 속한 소스 결정
 *   const source = Object.entries(API_SOURCE).find(([, ids]) => ids.includes(cfg.id))?.[0]
 *   const urlMap = {
 *     CLIMATE:       `/api/climate/latest?zone=${zoneId}&fields=${cfg.id}`,
 *     FARM_MANAGING: `/api/farm-managing/latest?fields=${cfg.id}`,
 *     GROWTH:        `/api/growth/latest?fields=${cfg.id}`,
 *     LABOR:         `/api/labor/task-rate?date=${today}`,
 *   }
 *   const res = await fetch(urlMap[source], { signal: AbortSignal.timeout(POLLING.REQUEST_TIMEOUT_MS) })
 *   return res.json()  // { value, data, lastReceivedAt }
 * }
 *
 * useEffect(() => {
 *   const load = () => Promise.all(slotConfigs.map(cfg => fetchKpi(cfg, zoneId)))
 *     .then(results => setSlots(results.map((r, i) => buildSlot(slotConfigs[i], r))))
 *   load()
 *   const timer = setInterval(load, POLLING.KPI_INTERVAL_MS)
 *   return () => clearInterval(timer)
 * }, [configKey, zoneId])
 */
export function useKpiPolling(slotConfigs) {
  const buildSlots = (configs, loading = false) =>
    configs.map(cfg => {
      if (!cfg.id) {
        return { ...cfg, value: null, data: [], dataStatus: 'NO_API', lastReceivedAt: undefined }
      }
      if (loading) {
        return { ...cfg, value: null, data: [], dataStatus: 'LOADING', lastReceivedAt: undefined }
      }
      const mock = MOCK_API_DATA[cfg.id] ?? null
      const lastReceivedAt = mock?.lastReceivedAt
      const value = mock?.value ?? null
      const data  = mock?.data  ?? []
      const dataStatus = resolveKpiStatus(cfg.id, value, lastReceivedAt, cfg.yMin, cfg.yMax)
      return { ...cfg, value, data, dataStatus, lastReceivedAt }
    })

  const [slots, setSlots] = useState(() => buildSlots(slotConfigs, true))

  // slotConfigs가 바뀌면 LOADING → 데이터 재로드 (800ms 딜레이로 로딩 시연)
  const configKey = slotConfigs.map(c => c.id ?? 'null').join(',')
  useEffect(() => {
    setSlots(buildSlots(slotConfigs, true))
    const t = setTimeout(() => setSlots(buildSlots(slotConfigs)), 800)
    return () => clearTimeout(t)
  }, [configKey]) // eslint-disable-line

  return slots
}
