import { X } from 'lucide-react'
import { KPI_CANDIDATES } from '../constants/kpiCandidates'
import { useCapabilities } from '../contexts/CapabilitiesContext'
import './WidgetPicker.css'

const WIDGET_TYPES = [
  { type: 'stat',  label: '수치 카드',   desc: '단일 센서값 표시 (온도, 습도 등)' },
  { type: 'chart', label: '차트',        desc: '시계열 데이터 시각화' },
]

export default function WidgetPicker({ onAdd, onClose }) {
  const { dynamicCandidates, zoneCapabilities } = useCapabilities()
  const allCandidates = [...KPI_CANDIDATES, ...dynamicCandidates]
  const categories = [...new Set(allCandidates.map(c => c.category))]

  const allAvailableIds = new Set(
    Object.values(zoneCapabilities).flatMap(z => z.available ?? [])
  )
  const isAvailable = (id) => allAvailableIds.size > 0 && allAvailableIds.has(id)

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
              {wt.type === 'stat' ? (
                categories.map(cat => (
                  <div key={cat}>
                    <div className="picker__cat-label">{cat}</div>
                    <div className="picker__grid">
                      {allCandidates.filter(c => c.category === cat).map(c => (
                        <button
                          key={c.id}
                          className={`picker__item ${!isAvailable(c.id) ? 'picker__item--noapi' : ''}`}
                          onClick={() => isAvailable(c.id) && onAdd({ type: wt.type, title: c.title, kpiId: c.id, unit: c.unit })}
                          title={!isAvailable(c.id) ? '미연결' : undefined}
                        >
                          {c.icon} {c.title}
                          {!isAvailable(c.id) && <span className="picker__item-badge">미연결</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="picker__grid">
                  <button className="picker__item picker__item--noapi" disabled>
                    차트 (준비 중)
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
