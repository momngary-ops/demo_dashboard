import { GripHorizontal, X } from 'lucide-react'
import './Widget.css'

const ERROR_STATUSES = new Set(['NULL_DATA', 'SENSOR_FAULT', 'API_TIMEOUT', 'NO_API'])

function fmt(v) {
  if (v === null || v === undefined) return '--'
  if (v >= 10000) return v.toLocaleString()
  if (Number.isInteger(v)) return String(v)
  return Number(v).toFixed(1)
}

function StatWidget({ config, kpiSlot }) {
  const value  = kpiSlot?.value ?? null
  const unit   = kpiSlot?.unit ?? config.unit ?? ''
  const status = kpiSlot?.dataStatus ?? 'LOADING'

  const isLoading = status === 'LOADING'
  const isError   = ERROR_STATUSES.has(status)
  const isCrit    = status === 'STALE_CRIT'
  const isWarn    = status === 'STALE_WARN'

  if (isLoading) {
    return (
      <div className="widget__stat">
        <div className="widget__stat-value" style={{ color: 'var(--text-muted)' }}>--</div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="widget__stat">
        <div className="widget__stat-value" style={{ color: 'var(--text-muted)' }}>--</div>
        <div className="widget__stat-delta" style={{ color: 'var(--text-muted)' }}>
          {status === 'API_TIMEOUT' ? '연결 재시도 중...' : status === 'NO_API' ? '준비 중' : '센서 오류'}
        </div>
      </div>
    )
  }

  return (
    <div className="widget__stat">
      <div className="widget__stat-value" style={{ opacity: isCrit ? 0.6 : 1 }}>
        <span style={{ color: isCrit ? '#f87171' : isWarn ? '#fb923c' : '#fff' }}>
          {fmt(value)}
        </span>
        <span className="widget__stat-unit">{unit}</span>
      </div>
      {(isWarn || isCrit) && (
        <div className="widget__stat-delta" style={{ color: isCrit ? '#f87171' : '#fb923c' }}>
          {isCrit ? '🔴 데이터 지연' : '⚠ 데이터 지연'}
        </div>
      )}
    </div>
  )
}

function ChartWidget({ config }) {
  return (
    <div className="widget__chart">
      <div className="widget__chart-placeholder">
        <span>[ {config.title} 차트 ]</span>
        <span className="widget__chart-hint">API 연동 후 표시</span>
      </div>
    </div>
  )
}

// C: 크기 배지
function SizeBadge({ w, h }) {
  return (
    <span className="widget__size-badge" title="현재 그리드 크기">
      {w} × {h}
    </span>
  )
}

export default function Widget({ id, config, kpiSlot, editMode, onRemove, gridSize }) {
  if (!config) return null

  return (
    <div className={`widget ${editMode ? 'widget--edit' : ''}`}>
      <div className="widget__header">
        {editMode && (
          <span className="widget__drag-handle" title="드래그하여 이동">
            <GripHorizontal size={14} />
          </span>
        )}
        <span className="widget__title">{config.title}</span>

        {/* C: 편집모드에서 현재 크기 표시 */}
        {editMode && gridSize && <SizeBadge w={gridSize.w} h={gridSize.h} />}

        {editMode && (
          <button className="widget__remove" onClick={onRemove} title="위젯 제거">
            <X size={14} />
          </button>
        )}
      </div>
      <div className="widget__body">
        {config.type === 'stat'  && <StatWidget config={config} kpiSlot={kpiSlot} />}
        {config.type === 'chart' && <ChartWidget config={config} />}
      </div>
    </div>
  )
}
