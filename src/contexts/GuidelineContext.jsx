import { createContext, useContext, useEffect, useState } from 'react'

export const GuidelineContext = createContext(null)

export function GuidelineProvider({ children }) {
  const [guidelines, setGuidelines]   = useState(null)   // { "1": [...24], ..., "12": [...] }
  const [alertConfig, setAlertConfig] = useState(null)
  const [loading, setLoading]         = useState(true)

  async function fetchGuidelines() {
    try {
      const res = await fetch('/api/guidelines', { signal: AbortSignal.timeout(8_000) })
      if (!res.ok) return
      const d = await res.json()
      setGuidelines(d.data   ?? null)
      setAlertConfig(d.alert_config ?? null)
    } catch {
      // 네트워크 오류는 무시 — guidelines가 null이면 밴드 미표시
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchGuidelines() }, [])

  /** 현재 시각 기준 가이드라인 행 반환 */
  function getCurrent() {
    if (!guidelines) return null
    const now   = new Date()
    const month = String(now.getMonth() + 1)
    const hour  = now.getHours()
    const rows  = guidelines[month]
    if (!rows) return null
    return rows.find(r => r.hour === hour) ?? null
  }

  return (
    <GuidelineContext.Provider value={{ guidelines, alertConfig, loading, getCurrent, fetchGuidelines }}>
      {children}
    </GuidelineContext.Provider>
  )
}

export const useGuideline = () => useContext(GuidelineContext)
