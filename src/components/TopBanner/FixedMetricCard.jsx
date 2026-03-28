/** 외부 온도 고정 카드 — 날씨 배경에 융화되는 반투명 스타일 */
export default function FixedMetricCard({ value, dataStatus }) {
  const showValue = ['OK', 'STALE_WARN', 'STALE_CRIT', 'OUT_OF_RANGE'].includes(dataStatus)
  const display = showValue && value !== null ? Number(value).toFixed(1) : '--'

  return (
    <div className="fixed-card">
      <div className="fixed-card__icon">☀️</div>
      <div className="fixed-card__label">외부 온도</div>
      <div className="fixed-card__value">
        {display}
        <span className="fixed-card__unit">°C</span>
      </div>
    </div>
  )
}
