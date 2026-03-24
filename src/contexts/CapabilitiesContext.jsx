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
      const res  = await fetch('/api/capabilities')
      const data = await res.json()
      // zone_config에 저장된 zoneId 기준으로 필드 추출
      // (서버가 zone_config.json을 읽어 구역별 available을 반환)
      const available = data.available?.[zoneId] ?? []
      setZoneCapabilities(prev => ({
        ...prev,
        [zoneId]: { available, loading: false, lastFetched: new Date(), error: null },
      }))
      setCapabilities(data)
      return { success: true, fields: available }
    } catch (e) {
      const msg = e.message ?? '알 수 없는 오류'
      setZoneCapabilities(prev => ({
        ...prev,
        [zoneId]: { available: [], loading: false, lastFetched: null, error: msg },
      }))
      return { success: false, error: msg }
    }
  }, [])

  // 앱 최초 로드 시 1회 호출
  useEffect(() => { fetchCapabilities() }, [fetchCapabilities])

  const dynamicCandidates = useMemo(() => buildDynamicCandidates(capabilities), [capabilities])

  return (
    <CapabilitiesContext.Provider value={{
      capabilities,
      zoneCapabilities,
      loading,
      lastFetched,
      dynamicCandidates,
      refetch:     fetchCapabilities,
      refetchZone,
    }}>
      {children}
    </CapabilitiesContext.Provider>
  )
}

export function useCapabilities() {
  return useContext(CapabilitiesContext)
}
