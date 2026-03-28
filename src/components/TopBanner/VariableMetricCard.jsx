import Sparkline from './Sparkline'

const STATUS_MSGS = {
  NULL_DATA:    '유효 데이터가 없습니다',
  SENSOR_FAULT: '센서 오류',
  API_TIMEOUT:  '연결 재시도 중...',
  NO_API:       '준비 중',
  SENSOR_LOST:  '센서 연결 끊김',
}

const ERROR_STATUSES = new Set(['NULL_DATA', 'SENSOR_FAULT', 'API_TIMEOUT', 'NO_API', 'SENSOR_LOST'])

function fmt(value) {
  if (value === null || value === undefined) return '--'
  if (value >= 10000) return value.toLocaleString()
  if (Number.isInteger(value)) return String(value)
  return Number(value).toFixed(1)
}

function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function VariableMetricCard({ slot }) {
  const { title, unit, icon, bgColor, value, data, dataStatus, lastReceivedAt, yMin, yMax } = slot

  const isError    = ERROR_STATUSES.has(dataStatus)
  const isLoading  = dataStatus === 'LOADING'
  const isStale    = dataStatus === 'STALE_WARN' || dataStatus === 'STALE_CRIT'
  const isCrit     = dataStatus === 'STALE_CRIT'
  const isOOR      = dataStatus === 'OUT_OF_RANGE'

  const cardStyle = {
    background: isError ? 'rgba(71,85,105,0.55)' : bgColor,
    opacity:    isCrit ? 0.6 : 1,
    outline:    isOOR ? '2px solid #ef4444' : 'none',
    outlineOffset: isOOR ? '-2px' : '0',
  }

  if (isLoading) {
    return (
      <div className="var-card" style={{ background: bgColor }}>
        <div className="skeleton sk-sm" />
        <div className="skeleton sk-lg" />
        <div className="skeleton sk-spark" />
      </div>
    )
  }

  return (
    <div className="var-card" style={cardStyle}>
      <div className="var-card__header">
        <span className="var-card__title">{icon} {title}</span>
      </div>

      {isError ? (
        <div className="var-card__msg">
          {dataStatus === 'NO_API'       && <span className="var-card__icon-lg">🔒</span>}
          {dataStatus === 'SENSOR_FAULT' && <span className="var-card__icon-lg">⚠️</span>}
          {dataStatus === 'SENSOR_LOST'  && <span className="var-card__icon-lg">⚠️</span>}
          {dataStatus === 'API_TIMEOUT'  && <span className="var-card__spinner" />}
          <span>{STATUS_MSGS[dataStatus]}</span>
        </div>
      ) : (
        <>
          <div className="var-card__value">
            <span style={{ color: isOOR ? '#fca5a5' : '#fff' }}>{fmt(value)}</span>
            <span className="var-card__unit">{unit}</span>
          </div>
          <div className="var-card__spark">
            <Sparkline data={data} yMin={yMin} yMax={yMax} stale={isCrit} />
          </div>
          {isStale && (
            <div
              className="var-card__timestamp"
              style={{ color: isCrit ? '#f87171' : '#fb923c' }}
            >
              {isCrit && '🔴 '}마지막 {fmtTime(lastReceivedAt)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
