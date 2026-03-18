import { useState } from 'react'
import { MOCK_WEATHER } from '../mocks/weatherMockData'

/**
 * 날씨 폴링 훅 (현재 Mock 모드)
 * TODO: 기상청 API 또는 OpenWeatherMap으로 교체
 *       setInterval(fetchWeather, POLLING.WEATHER_INTERVAL_MS)
 */
export function useWeatherPolling() {
  const [weather] = useState(MOCK_WEATHER)
  return weather
}
