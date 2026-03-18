import { X } from 'lucide-react'
import './WidgetPicker.css'

const WIDGET_TYPES = [
  { type: 'stat',  label: '수치 카드',   desc: '단일 센서값 표시 (온도, 습도 등)' },
  { type: 'chart', label: '차트',        desc: '시계열 데이터 시각화' },
]

const DATA_KEYS = [
  { key: 'temperature', label: '온도' },
  { key: 'humidity',    label: '습도' },
  { key: 'co2',         label: 'CO2' },
  { key: 'light',       label: '광량' },
  { key: 'trend',       label: '환경 추이' },
  { key: 'farms',       label: '농가 현황' },
]

export default function WidgetPicker({ onAdd, onClose }) {
  const handleAdd = (type, dataKey) => {
    const label = DATA_KEYS.find(d => d.key === dataKey)?.label || dataKey
    onAdd({ type, title: label, dataKey })
  }

  return (
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker" onClick={e => e.stopPropagation()}>
        <div className="picker__header">
          <span className="picker__title">위젯 추가</span>
          <button className="picker__close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="picker__body">
          {WIDGET_TYPES.map(wt => (
            <div key={wt.type} className="picker__section">
              <div className="picker__section-title">{wt.label}</div>
              <p className="picker__section-desc">{wt.desc}</p>
              <div className="picker__grid">
                {DATA_KEYS.filter(d =>
                  wt.type === 'stat'
                    ? ['temperature','humidity','co2','light'].includes(d.key)
                    : ['trend','farms'].includes(d.key)
                ).map(d => (
                  <button
                    key={d.key}
                    className="picker__item"
                    onClick={() => handleAdd(wt.type, d.key)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
