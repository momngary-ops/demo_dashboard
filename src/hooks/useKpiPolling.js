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

/** 구역 데이터 사전 로드 — 구역 탭 hover 시 호출해 캐시 워밍 */
export function prefetchZoneData(zoneId) {
  if (!zoneId) return
  fetchZoneData(zoneId).catch(() => {})
}

/** 구역 캐시 강제 무효화 — 구역 설정 변경 후 즉시 재조회 필요할 때 호출 */
export function clearZoneCache(zoneId) {
  if (zoneId) {
    delete _zoneCache[zoneId]
    delete _zonePending[zoneId]
  } else {
    Object.keys(_zoneCache).forEach(k => delete _zoneCache[k])
    Object.keys(_zonePending).forEach(k => delete _zonePending[k])
  }
}

// ── 스파크라인 이력 ────────────────────────────────────────────────────────────
// 폴링마다 수신한 값을 누적 → 3시간치 보관 → 20포인트 다운샘플링 후 스파크라인 전달
const _kpiHistory  = {}            // { [kpiId]: Array<{ value: number, ts: number }> }
const HISTORY_MS   = 24 * 60 * 60_000 // 24시간
const SPARK_POINTS = 80

function _addHistory(id, value) {
  if (value === null || value === undefined) return
  if (!_kpiHistory[id]) _kpiHistory[id] = []
  const now = Date.now()
  _kpiHistory[id].push({ value, ts: now })
  // 3시간 초과분 제거
  const cutoff = now - HISTORY_MS
  _kpiHistory[id] = _kpiHistory[id].filter(p => p.ts >= cutoff)
}

function _getSparkline(id) {
  const hist = _kpiHistory[id]
  if (!hist || hist.length < 2) return []
  if (hist.length <= SPARK_POINTS) return hist.map(p => p.value)
  // 균등 간격으로 SPARK_POINTS개 추출
  const step = (hist.length - 1) / (SPARK_POINTS - 1)
  return Array.from({ length: SPARK_POINTS }, (_, i) =>
    hist[Math.round(i * step)].value
  )
}

/** _kpiHistory에 rows 병합 (중복 ts 제외, 오래된 항목 제거) */
function _mergeHistory(fieldId, rows) {
  if (!rows.length) return
  if (!_kpiHistory[fieldId]) _kpiHistory[fieldId] = []
  const existingTs = new Set(_kpiHistory[fieldId].map(p => p.ts))
  for (const row of rows) {
    const ts    = new Date(row.ts).getTime()
    const value = row.value ?? row.fields?.[fieldId]
    if (!existingTs.has(ts) && value !== null && value !== undefined) {
      _kpiHistory[fieldId].push({ value: Number(value), ts })
      existingTs.add(ts)
    }
  }
  _kpiHistory[fieldId].sort((a, b) => a.ts - b.ts)
  const cutoff = Date.now() - HISTORY_MS
  _kpiHistory[fieldId] = _kpiHistory[fieldId].filter(p => p.ts >= cutoff)
}

/** 인메모리 버퍼(빠름) + SQLite 로그(느림) 병렬 로드 → _kpiHistory 선채우기 */
async function _loadHistoryFromDB(slotConfigs, zoneId) {
  if (!zoneId) return
  const fields = slotConfigs.filter(c => c.id).map(c => c.id.toLowerCase())
  await Promise.allSettled(fields.map(async (fieldId) => {
    try {
      // 1단계: 인메모리 버퍼 (즉시 응답 — 최근 30분 1분 해상도)
      const bufRes = await fetch(
        `/api/zone/${encodeURIComponent(zoneId)}/recent?field=${encodeURIComponent(fieldId)}`,
        { signal: AbortSignal.timeout(2_000) }
      )
      if (bufRes.ok) {
        const bufRows = await bufRes.json()
        _mergeHistory(fieldId, bufRows)
      }
    } catch { /* 버퍼 실패는 비치명적 */ }

    try {
      // 2단계: SQLite 이력 (5분 간격, 최대 12시간) — 병렬로 실행
      const res = await fetch(
        `/api/logs?zone_id=${encodeURIComponent(zoneId)}&field=${encodeURIComponent(fieldId)}&limit=288`,
        { signal: AbortSignal.timeout(5_000) }
      )
      if (!res.ok) return
      const rows = await res.json()
      _mergeHistory(fieldId, [...rows].reverse())
    } catch {
      // 이력 로드 실패는 비치명적 — 실시간 폴링으로 대체
    }
  }))
}

/** minutesAgo 분 전 값 — delta 계산용 */
function _getPrevValue(id, minutesAgo) {
  const hist = _kpiHistory[id]
  if (!hist || hist.length < 2) return null
  const targetTs = Date.now() - minutesAgo * 60_000
  let closest = null, minDiff = Infinity
  for (const p of hist) {
    const diff = Math.abs(p.ts - targetTs)
    if (diff < minDiff) { minDiff = diff; closest = p }
  }
  return closest?.value ?? null
}

/** 실제 API 응답 → 정규화된 필드 맵
 *  지원 구조:
 *    { fields: [{ ... }] }   — 표준 (제어기/양액기 공통)
 *    { data:   [{ ... }] }   — 일부 양액기 응답
 *    { ... }                 — 플랫 객체
 */
function normalizeZoneFields(json) {
  let raw = {}
  if (Array.isArray(json?.fields) && typeof json.fields[0] === 'object' && json.fields[0] !== null) {
    raw = json.fields[0]
  } else if (Array.isArray(json?.data) && typeof json.data[0] === 'object' && json.data[0] !== null) {
    raw = json.data[0]
  } else if (json && typeof json === 'object' && !Array.isArray(json)) {
    raw = json
  }
  const fields = {}
  for (const [k, v] of Object.entries(raw)) {
    const key = k.trim().toLowerCase()
    if (key === 'save_dt' || key === 'xdatetime') continue
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
      const safeFetch = (url) =>
        fetch(url, { signal: AbortSignal.timeout(5_000) })
          .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`)
            return r.json()
          })
      const [ctrlRes, nutRes] = await Promise.allSettled([
        safeFetch(`/api/zone/${zoneId}/controller`),
        safeFetch(`/api/zone/${zoneId}/nutrient`),
      ])
      if (ctrlRes.status === 'rejected') console.warn(`[KPI] 제어기 API 실패 (zone=${zoneId}):`, ctrlRes.reason)
      if (nutRes.status  === 'rejected') console.warn(`[KPI] 양액기 API 실패 (zone=${zoneId}):`, nutRes.reason)
      // 제어기 필드 + 양액기 필드 머지 (양액기가 우선 — EC/pH 등)
      const ctrlFields = ctrlRes.status === 'fulfilled' ? normalizeZoneFields(ctrlRes.value) : {}
      const nutFields  = nutRes.status  === 'fulfilled' ? normalizeZoneFields(nutRes.value)  : {}
      console.debug(`[KPI] zone=${zoneId} 제어기 keys:`, Object.keys(ctrlFields))
      console.debug(`[KPI] zone=${zoneId} 양액기 keys:`, Object.keys(nutFields))
      if (nutRes.status === 'fulfilled' && Object.keys(nutFields).length === 0) {
        console.warn(`[KPI] 양액기 응답 파싱 실패 — 원본:`, nutRes.value)
      }
      const fields = { ...ctrlFields, ...nutFields }
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
 *  - 경영/생육/노동 → 실제 API 미제공, null 반환 (NO_API 표시, 오류 없음)
 */
async function fetchKpi(cfg, zoneId) {
  const source = Object.entries(API_SOURCE)
    .find(([, ids]) => ids.includes(cfg.id))?.[0]

  // API_SOURCE에 없는 동적 필드(xintemp2 등)는 CLIMATE 캐시에서 fallback 조회
  const effectiveSource = source ?? (zoneId ? 'CLIMATE' : null)
  if (!effectiveSource) return null

  if (effectiveSource === 'CLIMATE') {
    const zoneData = await fetchZoneData(zoneId)
    const value    = zoneData?.fields?.[cfg.id?.toLowerCase()] ?? null
    _addHistory(cfg.id, value)
    return { value, data: _getSparkline(cfg.id), lastReceivedAt: zoneData?.lastReceivedAt }
  }

  // 경영·생육·노동 — 실제 API 미연동, 데이터 없음으로 처리
  return null
}

function buildSlot(cfg, raw, zoneAvailable = null) {
  const value          = raw?.value ?? null
  const data           = raw?.data  ?? []
  const lastReceivedAt = raw?.lastReceivedAt
  const isAvailable    = !zoneAvailable || zoneAvailable.includes(cfg.id)
  const dataStatus     = resolveKpiStatus(cfg.id, value, lastReceivedAt, cfg.yMin, cfg.yMax, isAvailable)
  const prev30         = _getPrevValue(cfg.id, 30)
  const prev60         = _getPrevValue(cfg.id, 60)
  return { ...cfg, value, data, dataStatus, lastReceivedAt, prev30, prev60 }
}

/**
 * useKpiPolling
 *
 * @param {Array}  slotConfigs  — KPI 슬롯 설정 배열 [{ id, title, ... }]
 * @param {string} [zoneId]     — 대상 구역 ID. 생략 시 첫 번째 연결 구역 자동 선택.
 * @param {number} [refreshKey] — 수동 새로고침 트리거. 값이 바뀌면 캐시 무시 즉시 재조회.
 */
export function useKpiPolling(slotConfigs, zoneId = null, refreshKey = 0) {
  const { capabilities, zoneCapabilities } = useCapabilities()

  const effectiveZoneId = zoneId
    ?? Object.keys(zoneCapabilities)[0]
    ?? (capabilities?.zones?.[0] ?? 'Z-1')
  const _rawAvailable = zoneCapabilities[effectiveZoneId]?.available
    ?? capabilities?.available?.[effectiveZoneId]
    ?? null
  // 빈 배열([])은 "아직 탐색 안 됨"으로 간주 → null 처리 (전체 허용)
  const zoneAvailable = (_rawAvailable?.length > 0) ? _rawAvailable : null

  const buildSlots = (configs) =>
    configs.map(cfg => ({
      ...cfg,
      value: null,
      data: [],
      dataStatus: cfg.id ? 'LOADING' : 'NO_API',
      lastReceivedAt: undefined,
    }))

  const [slots, setSlots] = useState(() => buildSlots(slotConfigs))

  const configKey = slotConfigs.map(c => c.id ?? 'null').join(',') + '|' + refreshKey

  // 슬롯 구성 변경 시에만 LOADING 초기화 (구역 전환 시엔 이전 값 유지)
  useEffect(() => {
    setSlots(buildSlots(slotConfigs))
  }, [configKey]) // eslint-disable-line

  // 구역/구성 변경 시 즉시 fetch + 폴링
  useEffect(() => {
    const load = () =>
      Promise.all(slotConfigs.map(cfg => fetchKpi(cfg, effectiveZoneId).catch(() => null)))
        .then(results => setSlots(
          slotConfigs.map((cfg, i) =>
            results[i]
              ? buildSlot(cfg, results[i], zoneAvailable)
              : { ...cfg, value: null, data: [], dataStatus: cfg.id ? 'API_TIMEOUT' : 'NO_API', lastReceivedAt: undefined }
          )
        ))

    // 이력 로드 + 현재값 조회 병렬 실행 → 첫 화면 대기시간 단축
    _loadHistoryFromDB(slotConfigs, effectiveZoneId)
    load()
    const timer = setInterval(load, POLLING.KPI_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [configKey, effectiveZoneId, zoneAvailable]) // eslint-disable-line

  return slots
}
