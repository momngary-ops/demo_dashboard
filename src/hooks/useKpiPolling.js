import { useState, useEffect } from 'react'
import { resolveKpiStatus } from '../utils/kpiStatusResolver'
import { API_SOURCE, POLLING } from '../constants/pollingConfig'
import { useCapabilities } from '../contexts/CapabilitiesContext'

// ── 구역 데이터 모듈 레벨 캐시 ───────────────────────────────────────────────
// 같은 폴링 사이클 내 여러 KPI가 동일 구역 데이터를 공유 → 중복 fetch 방지
// CLIMATE N개 KPI → /api/zone/{id}/controller 1회만 호출
const _zoneCache   = {}  // { [zoneId]: { fields: {}, ts: number, lastReceivedAt: string } }
const _zonePending = {}  // { [zoneId]: Promise }
const CACHE_TTL    = 28_000  // 28초 (폴링 30초보다 약간 짧게)

/** 실제 API 응답 { "fields": [{ ...모든 필드 }] } → 정규화된 필드 맵 */
function normalizeZoneFields(json) {
  const raw = json?.fields?.[0] ?? {}
  const fields = {}
  for (const [k, v] of Object.entries(raw)) {
    const key = k.trim().toLowerCase()
    // 타임스탬프 객체 및 빈값 제외
    if (key === 'save_dt' || key === 'xdatetime' || key === 'xdatetime') continue
    if (v === null || v === undefined || v === '') continue
    if (typeof v === 'object') continue  // { date, timezone_type, ... } 등 중첩 객체
    const num = typeof v === 'string' ? parseFloat(v) : v
    fields[key] = (typeof num === 'number' && !isNaN(num)) ? num : v
  }
  return fields
}

/** 구역 전체 데이터 fetch (제어기 + 양액기 머지, 캐시 적용) */
async function fetchZoneData(zoneId) {
  const now = Date.now()
  if (_zoneCache[zoneId] && now - _zoneCache[zoneId].ts < CACHE_TTL) {
    return _zoneCache[zoneId]
  }
  if (_zonePending[zoneId]) return _zonePending[zoneId]

  _zonePending[zoneId] = (async () => {
    try {
      const [ctrlRes, nutRes] = await Promise.allSettled([
        fetch(`/api/zone/${zoneId}/controller`, { signal: AbortSignal.timeout(10_000) }).then(r => r.json()),
        fetch(`/api/zone/${zoneId}/nutrient`,   { signal: AbortSignal.timeout(10_000) }).then(r => r.json()),
      ])
      // 제어기 필드 + 양액기 필드 머지 (양액기가 우선 — EC/pH 등)
      const fields = {
        ...(ctrlRes.status === 'fulfilled' ? normalizeZoneFields(ctrlRes.value) : {}),
        ...(nutRes.status  === 'fulfilled' ? normalizeZoneFields(nutRes.value)  : {}),
      }
      _zoneCache[zoneId] = { fields, ts: now, lastReceivedAt: new Date().toISOString() }
      return _zoneCache[zoneId]
    } finally {
      delete _zonePending[zoneId]
    }
  })()

  return _zonePending[zoneId]
}

/** KPI 1개 fetch
 *  - CLIMATE  → 구역 전체 데이터에서 필드 추출 (캐시 공유)
 *  - 경영/생육/노동 → 기존 mock 엔드포인트 유지 (실제 API 미제공)
 */
async function fetchKpi(cfg, zoneId) {
  const source = Object.entries(API_SOURCE)
    .find(([, ids]) => ids.includes(cfg.id))?.[0]
  if (!source) return null

  if (source === 'CLIMATE') {
    const zoneData = await fetchZoneData(zoneId)
    const value    = zoneData?.fields?.[cfg.id?.toLowerCase()] ?? null
    return { value, data: [], lastReceivedAt: zoneData?.lastReceivedAt }
  }

  // 경영·생육·노동 — mock 엔드포인트
  const today = new Date().toISOString().slice(0, 10)
  const urlMap = {
    FARM_MANAGING: `/api/farm-managing/latest?fields=${cfg.id}`,
    GROWTH:        `/api/growth/latest?fields=${cfg.id}`,
    LABOR:         `/api/labor/task-rate?date=${today}`,
  }
  const res = await fetch(urlMap[source], { signal: AbortSignal.timeout(POLLING.REQUEST_TIMEOUT_MS) })
  return res.json()
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
 * @param {string} [zoneId]     — 대상 구역 ID. 생략 시 첫 번째 연결 구역 자동 선택.
 */
export function useKpiPolling(slotConfigs, zoneId = null) {
  const { capabilities, zoneCapabilities } = useCapabilities()

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
    setSlots(buildSlots(slotConfigs))
    const load = () =>
      Promise.all(slotConfigs.map(cfg => fetchKpi(cfg, effectiveZoneId).catch(() => null)))
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
  }, [configKey, effectiveZoneId, zoneAvailable]) // eslint-disable-line

  return slots
}
