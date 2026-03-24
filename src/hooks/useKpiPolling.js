import { useState, useEffect } from 'react'
import { resolveKpiStatus } from '../utils/kpiStatusResolver'
import { API_SOURCE, POLLING } from '../constants/pollingConfig'

async function fetchKpi(cfg) {
  const source = Object.entries(API_SOURCE)
    .find(([, ids]) => ids.includes(cfg.id))?.[0]
  if (!source) return null
  const today = new Date().toISOString().slice(0, 10)
  const urlMap = {
    CLIMATE:       `/api/climate/latest?fields=${cfg.id}`,
    FARM_MANAGING: `/api/farm-managing/latest?fields=${cfg.id}`,
    GROWTH:        `/api/growth/latest?fields=${cfg.id}`,
    LABOR:         `/api/labor/task-rate?date=${today}`,
  }
  const res = await fetch(urlMap[source],
    { signal: AbortSignal.timeout(POLLING.REQUEST_TIMEOUT_MS) })
  return res.json()  // { value, data, lastReceivedAt }
}

function buildSlot(cfg, raw) {
  const value = raw?.value ?? null
  const data  = raw?.data  ?? []
  const lastReceivedAt = raw?.lastReceivedAt
  const dataStatus = resolveKpiStatus(cfg.id, value, lastReceivedAt, cfg.yMin, cfg.yMax)
  return { ...cfg, value, data, dataStatus, lastReceivedAt }
}

export function useKpiPolling(slotConfigs) {
  const buildSlots = (configs) =>
    configs.map(cfg => ({
      ...cfg,
      value: null,
      data: [],
      dataStatus: cfg.id ? 'LOADING' : 'NO_API',
      lastReceivedAt: undefined,
    }))

  const [slots, setSlots] = useState(() => buildSlots(slotConfigs))

  const configKey = slotConfigs.map(c => c.id ?? 'null').join(',')
  useEffect(() => {
    setSlots(buildSlots(slotConfigs))  // LOADING 표시
    const load = () =>
      Promise.all(slotConfigs.map(cfg => fetchKpi(cfg).catch(() => null)))
        .then(results => setSlots(
          slotConfigs.map((cfg, i) =>
            results[i]
              ? buildSlot(cfg, results[i])
              : { ...cfg, value: null, data: [], dataStatus: cfg.id ? 'API_TIMEOUT' : 'NO_API', lastReceivedAt: undefined }
          )
        ))
    load()
    const timer = setInterval(load, POLLING.KPI_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [configKey]) // eslint-disable-line

  return slots
}
