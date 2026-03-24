import { useState, useEffect } from 'react'
import { resolveKpiStatus } from '../utils/kpiStatusResolver'
import { API_SOURCE, POLLING } from '../constants/pollingConfig'
import { useCapabilities } from '../contexts/CapabilitiesContext'

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

function buildSlot(cfg, raw, zoneAvailable = null) {
  const value          = raw?.value ?? null
  const data           = raw?.data  ?? []
  const lastReceivedAt = raw?.lastReceivedAt
  const isAvailable    = !zoneAvailable || zoneAvailable.includes(cfg.id)
  const dataStatus     = resolveKpiStatus(cfg.id, value, lastReceivedAt, cfg.yMin, cfg.yMax, isAvailable)
  return { ...cfg, value, data, dataStatus, lastReceivedAt }
}

/**
 * useKpiPolling
 *
 * @param {Array}  slotConfigs  — KPI 슬롯 설정 배열 [{ id, title, ... }]
 * @param {string} [zoneId]     — 대상 구역 ID (예: 'Z-1'). 생략 시 첫 번째 연결 구역 자동 선택.
 */
export function useKpiPolling(slotConfigs, zoneId = null) {
  const { capabilities, zoneCapabilities } = useCapabilities()

  // zoneId 없으면 capabilities에서 첫 번째 구역 자동 선택 (하위 호환)
  const effectiveZoneId = zoneId
    ?? Object.keys(zoneCapabilities)[0]
    ?? (capabilities?.zones?.[0] ?? 'Z-1')
  const zoneAvailable = zoneCapabilities[effectiveZoneId]?.available
    ?? capabilities?.available?.[effectiveZoneId]
    ?? null

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
              ? buildSlot(cfg, results[i], zoneAvailable)
              : { ...cfg, value: null, data: [], dataStatus: cfg.id ? 'API_TIMEOUT' : 'NO_API', lastReceivedAt: undefined }
          )
        ))
    load()
    const timer = setInterval(load, POLLING.KPI_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [configKey, zoneAvailable]) // eslint-disable-line

  return slots
}
