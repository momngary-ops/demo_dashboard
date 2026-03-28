import { useState, useEffect } from 'react'
import { POLLING } from '../constants/pollingConfig'

// TODO: 날씨 API URL — 연동 시 아래 상수 및 useEffect 주석 해제
// const WEATHER_API_URL = '/api/weather/current'

/**
 * 날씨 폴링 훅
 * 반환 shape: { condition: string|null, temperature: number|null, updatedAt: string|null }
 */
export function useWeatherPolling() {
  const [weather, setWeather] = useState({ condition: null, temperature: null, updatedAt: null })

  // useEffect(() => {
  //   const load = () =>
  //     fetch(WEATHER_API_URL, { signal: AbortSignal.timeout(POLLING.REQUEST_TIMEOUT_MS) })
  //       .then(r => r.json())
  //       .then(data => setWeather(data))
  //       .catch(() => {})
  //   load()
  //   const timer = setInterval(load, POLLING.WEATHER_INTERVAL_MS)
  //   return () => clearInterval(timer)
  // }, [])

  return weather
}
