import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { KPI_CANDIDATES } from '../constants/kpiCandidates'
import { SENSOR_FAMILIES } from '../constants/sensorFamilies'

/**
 * CapabilitiesContext
 *
 * 구역별 연결 필드 목록을 관리한다.
 * - GET /api/capabilities → { available: { 'Z-1': [...], 'Z-2': [...] }, zones: [...] }
 * - zoneCapabilities[zoneId] = { available: string[], loading, lastFetched, error }
 * - refetchZone(zone) : 특정 구역만 재탐색 (FarmSettings "재연결" 버튼)
 * - refetch()         : 전체 재탐색 (앱 로드 시 자동 1회)
 */

const CapabilitiesContext = createContext({
  capabilities:      null,       // 원본 /api/capabilities 응답
  zoneCapabilities:  {},         // { [zoneId]: { available, loading, lastFetched, error } }
  loading:           true,
  lastFetched:       null,
  dynamicCandidates: [],
  refetch:           () => {},
  refetchZone:       () => {},
})

/** capabilities 필드 목록 → KPI_CANDIDATES에 없는 번호 인덱스 필드를 동적 KPI 항목으로 변환 */
function buildDynamicCandidates(capabilities) {
  // 모든 구역 필드를 합쳐서 동적 후보 생성
  const allFields = Object.values(capabilities?.available ?? {}).flat()
  const staticIds = new Set(KPI_CANDIDATES.map(c => c.id))
  const seen = new Set()
  return allFields
    .filter(f => !staticIds.has(f) && !seen.has(f) && seen.add(f))
    .map(f => {
      const match = f.match(/^([a-z]+)(\d+)$/)
      if (!match) return null
      const [, base, num] = match
      const family = SENSOR_FAMILIES[base]
      if (!family) return null
      return { ...family, id: f, title: `${family.title} (센서 ${num})`, mock: true }
    })
    .filter(Boolean)
}

export function CapabilitiesProvider({ children }) {
  const [capabilities,     setCapabilities]     = useState(null)
  const [zoneCapabilities, setZoneCapabilities] = useState({})
  const [loading,          setLoading]          = useState(true)
  const [lastFetched,      setLastFetched]       = useState(null)

  const fetchCapabilities = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/capabilities')
      const data = await res.json()
      setCapabilities(data)
      setLastFetched(new Date())
      // 구역별 zoneCapabilities 동기화
      const zoneCaps = {}
      for (const [zoneId, fields] of Object.entries(data.available ?? {})) {
        zoneCaps[zoneId] = { available: fields, loading: false, lastFetched: new Date(), error: null }
      }
      setZoneCapabilities(zoneCaps)

      // needsRediscover가 true인 구역: 백그라운드에서 실제 API 재호출하여 복구
      for (const [zoneId, needed] of Object.entries(data.needsRediscover ?? {})) {
        if (!needed) continue
        fetch(`/api/admin/zone/${zoneId}/rediscover`, { method: 'POST' })
          .then(r => r.json())
          .then(result => {
            if (!result.success) return
            // zoneCapabilities 갱신 (WidgetPicker, useKpiPolling이 즉시 반영)
            setZoneCapabilities(prev => ({
              ...prev,
              [zoneId]: { available: result.fields, loading: false, lastFetched: new Date(), error: null },
            }))
            // capabilities.available 동기화 (dynamicCandidates 재계산용)
            setCapabilities(prev => ({
              ...prev,
              available: { ...(prev?.available ?? {}), [zoneId]: result.fields },
            }))
          })
          .catch(() => {})  // 실패 시 기존 상태 유지 (degraded mode)
      }
    } catch (e) {
      console.error('[CapabilitiesContext] /api/capabilities 호출 실패:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * 특정 구역만 재연결 테스트.
   * zone: farmSchema의 zone 객체 { id, label, apiConfig }
   * 연결 성공 시 zoneCapabilities[zone.id] 업데이트.
   * 반환: { success, fields, error }
   */
  const refetchZone = useCallback(async (zone) => {
    const zoneId = zone.id
    setZoneCapabilities(prev => ({
      ...prev,
      [zoneId]: { ...(prev[zoneId] ?? {}), loading: true, error: null },
    }))
    try {
      const res  = await fetch(`/api/admin/zone/${zoneId}/rediscover`, { method: 'POST' })
      const data = await res.json()
      if (!data.success) throw new Error('필드 탐색 결과 없음')

      const available = data.fields
      setZoneCapabilities(prev => ({
        ...prev,
        [zoneId]: { available, loading: false, lastFetched: new Date(), error: null },
      }))
      setCapabilities(prev => ({
        ...prev,
        available: { ...(prev?.available ?? {}), [zoneId]: available },
      }))
      return { success: true, fields: available }
    } catch (e) {
      const msg = e.message ?? '알 수 없는 오류'
      setZoneCapabilities(prev => ({
        ...prev,
        [zoneId]: { ...(prev[zoneId] ?? {}), loading: false, error: msg },
      }))
      return { success: false, error: msg }
    }
  }, [])

  // 앱 최초 로드 시 1회 호출
  useEffect(() => { fetchCapabilities() }, [fetchCapabilities])

  const dynamicCandidates = useMemo(() => buildDynamicCandidates(capabilities), [capabilities])

  /** 구역 저장 후 즉시 zoneCapabilities 반영 (서버 재요청 없이) */
  const updateZoneAvailable = useCallback((zoneId, fields) => {
    setZoneCapabilities(prev => ({
      ...prev,
      [zoneId]: { ...(prev[zoneId] ?? {}), available: fields, loading: false, lastFetched: new Date(), error: null },
    }))
  }, [])

  return (
    <CapabilitiesContext.Provider value={{
      capabilities,
      zoneCapabilities,
      loading,
      lastFetched,
      dynamicCandidates,
      refetch:             fetchCapabilities,
      refetchZone,
      updateZoneAvailable,
    }}>
      {children}
    </CapabilitiesContext.Provider>
  )
}

export function useCapabilities() {
  return useContext(CapabilitiesContext)
}
