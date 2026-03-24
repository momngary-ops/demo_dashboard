import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const CapabilitiesContext = createContext({
  capabilities: null,
  loading: true,
  lastFetched: null,
  refetch: () => {},
})

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

  return (
    <CapabilitiesContext.Provider value={{ capabilities, loading, lastFetched, refetch: fetchCapabilities }}>
      {children}
    </CapabilitiesContext.Provider>
  )
}

export function useCapabilities() {
  return useContext(CapabilitiesContext)
}
