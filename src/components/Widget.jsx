import { GripHorizontal, X } from 'lucide-react'
import './Widget.css'

const MOCK = {
  temperature: { value: '24.3', unit: '°C', delta: '+0.5', up: true },
  humidity:    { value: '68',   unit: '%',  delta: '-2.1', up: false },
  co2:         { value: '412',  unit: 'ppm',delta: '+8',   up: true },
  light:       { value: '3,200',unit: 'lx', delta: '+120', up: true },
}

function StatWidget({ config }) {
  const d = MOCK[config.dataKey] || { value: '--', unit: '', delta: '', up: true }
  return (
    <div className="widget__stat">
      <div className="widget__stat-value">
        {d.value}<span className="widget__stat-unit">{d.unit}</span>
      </div>
      <div className={`widget__stat-delta ${d.up ? 'up' : 'down'}`}>
        {d.up ? '▲' : '▼'} {d.delta}
      </div>
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

export default function Widget({ id, config, editMode, onRemove, gridSize }) {
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
        {config.type === 'stat'  && <StatWidget config={config} />}
        {config.type === 'chart' && <ChartWidget config={config} />}
      </div>
    </div>
  )
}
