import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { KPI_CANDIDATES } from '../constants/kpiCandidates'
import { SENSOR_FAMILIES } from '../constants/sensorFamilies'

const CapabilitiesContext = createContext({
  capabilities:      null,
  loading:           true,
  lastFetched:       null,
  dynamicCandidates: [],
  refetch:           () => {},
})

/** capabilities 필드 목록 → KPI_CANDIDATES에 없는 번호 인덱스 필드를 동적 KPI 항목으로 변환 */
function buildDynamicCandidates(capabilities) {
  const fields    = capabilities?.available?.['Z-1'] ?? []
  const staticIds = new Set(KPI_CANDIDATES.map(c => c.id))
  return fields
    .filter(f => !staticIds.has(f))
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
  const [capabilities, setCapabilities] = useState(null)
  const [loading, setLoading]           = useState(true)
  const [lastFetched, setLastFetched]   = useState(null)

  const fetchCapabilities = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/capabilities')
      const data = await res.json()
      setCapabilities(data)
      setLastFetched(new Date())
    } catch (e) {
      console.error('[CapabilitiesContext] /api/capabilities 호출 실패:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  // 앱 최초 로드 시 1회 호출
  useEffect(() => { fetchCapabilities() }, [fetchCapabilities])

  const dynamicCandidates = useMemo(() => buildDynamicCandidates(capabilities), [capabilities])

  return (
    <CapabilitiesContext.Provider value={{ capabilities, loading, lastFetched, dynamicCandidates, refetch: fetchCapabilities }}>
      {children}
    </CapabilitiesContext.Provider>
  )
}

export function useCapabilities() {
  return useContext(CapabilitiesContext)
}
