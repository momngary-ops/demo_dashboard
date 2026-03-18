import { useState, useEffect } from 'react'
import { MOCK_API_DATA } from '../mocks/kpiMockData'
import { resolveKpiStatus } from '../utils/kpiStatusResolver'

/**
 * KPI 폴링 훅 (현재 Mock 모드)
 * slotConfigs: KPI_CANDIDATES 항목 배열 (5개)
 * TODO: 실제 API로 교체 → setInterval + Promise.all(slotConfigs.map(fetchKpi))
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
