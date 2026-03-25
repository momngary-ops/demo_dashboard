import { useState, useMemo } from 'react'
import { X, ChevronDown, ChevronRight } from 'lucide-react'
import { KPI_CANDIDATES } from '../constants/kpiCandidates'
import { GAUGE_SET_GROUPS, STATUS_PANEL_GROUPS } from '../constants/actuatorCandidates'
import { WIDGET_GROUPS } from '../constants/widgetGroups'
import { useCapabilities } from '../contexts/CapabilitiesContext'
import { useKpiPolling } from '../hooks/useKpiPolling'
import './WidgetPicker.css'

function fmtVal(value, unit) {
  if (value === null || value === undefined) return null
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return null
  const str = num >= 10000 ? num.toLocaleString() : Number.isInteger(num) ? String(num) : num.toFixed(1)
  return unit ? `${str} ${unit}` : str
}

function KpiItem({ c, avail, liveMap, onAdd }) {
  const live = liveMap[c.id]
  const val = (avail && live?.value != null) ? fmtVal(live.value, c.unit) : null
  return (
    <button
      className={`picker__item ${!avail ? 'picker__item--noapi' : ''}`}
      onClick={() => avail && onAdd({ type: 'stat', title: c.title, kpiId: c.id, unit: c.unit })}
      title={!avail ? '미연결' : c.title}
    >
      {c.icon} {c.title}
      {val !== null
        ? <span className="picker__item-val">{val}</span>
        : !avail && <span className="picker__item-badge">미연결</span>
      }
    </button>
  )
}

export default function WidgetPicker({ onAdd, onClose }) {
  const { dynamicCandidates, zoneCapabilities } = useCapabilities()
  const [expandDynamic, setExpandDynamic] = useState(false)

  const allAvailableIds = useMemo(() => new Set(
    Object.values(zoneCapabilities).flatMap(z => z.available ?? [])
  ), [zoneCapabilities])

  const isAvailable = (id) => allAvailableIds.size > 0 && allAvailableIds.has(id)

  // 연결된 항목만 폴링 (라이브 값 미리보기)
  const availableCandidates = useMemo(() =>
    [...KPI_CANDIDATES, ...dynamicCandidates].filter(c => allAvailableIds.has(c.id)),
    [allAvailableIds, dynamicCandidates]
  )
  const liveSlots = useKpiPolling(availableCandidates)
  const liveMap = useMemo(() =>
    Object.fromEntries(liveSlots.map(s => [s.id, s])),
    [liveSlots]
  )

  return (
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker" onClick={e => e.stopPropagation()}>
        <div className="picker__header">
          <span className="picker__title">위젯 추가</span>
          <button className="picker__close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="picker__body">

          {/* ── 카테고리 그룹 (widgetGroups.js에서 정의) ── */}
          {WIDGET_GROUPS.map(group => (
            <div key={group.id} className="picker__section">
              <div className="picker__section-title">{group.title}</div>
              <div className="picker__grid">
                {group.items.map(item => {
                  const avail = item.requiredIds.every(id => isAvailable(id))
                  const liveVal = item.type !== 'computed'
                    ? liveMap[item.kpiId]
                    : null
                  const val = (avail && liveVal?.value != null)
                    ? (liveVal.value >= 10000
                        ? liveVal.value.toLocaleString()
                        : Number.isInteger(liveVal.value)
                          ? String(liveVal.value)
                          : liveVal.value.toFixed(1))
                    : null
                  // eslint-disable-next-line no-unused-vars
                  const { requiredIds, description, id: _id, ...widgetConfig } = item
                  return (
                    <button
                      key={item.id}
                      className={`picker__item ${!avail ? 'picker__item--noapi' : ''}`}
                      onClick={() => avail && onAdd(widgetConfig)}
                      title={!avail ? '미연결' : (description ?? item.title)}
                    >
                      {item.title}
                      {val !== null
                        ? <span className="picker__item-val">{val} {item.unit}</span>
                        : description
                          ? <span className="picker__item-val">{description}</span>
                          : !avail && <span className="picker__item-badge">미연결</span>
                      }
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {/* 확장 센서 (동적) */}
          {dynamicCandidates.length > 0 && (
            <div className="picker__section">
              <div className="picker__section-title">확장 센서</div>
              <div className="picker__expand-wrap">
                <button
                  className="picker__expand-toggle"
                  onClick={() => setExpandDynamic(v => !v)}
                >
                  {expandDynamic ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  {dynamicCandidates.length}개 항목
                  {dynamicCandidates.filter(c => isAvailable(c.id)).length > 0 && (
                    <span className="picker__expand-count">
                      {dynamicCandidates.filter(c => isAvailable(c.id)).length}개 연결됨
                    </span>
                  )}
                </button>
                {expandDynamic && (
                  <div className="picker__grid picker__grid--expand">
                    {dynamicCandidates.map(c => (
                      <KpiItem key={c.id} c={c} avail={isAvailable(c.id)} liveMap={liveMap} onAdd={onAdd} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 구동기 개도 */}
          <div className="picker__section">
            <div className="picker__section-title">구동기 개도</div>
            <p className="picker__section-desc">창·커튼·밸브 개도 수평 바 목록</p>
            <div className="picker__grid">
              {GAUGE_SET_GROUPS.map(g => {
                const hasAny = g.items.some(item => allAvailableIds.has(item.id))
                return (
                  <button
                    key={g.id}
                    className={`picker__item ${!hasAny ? 'picker__item--noapi' : ''}`}
                    onClick={() => hasAny && onAdd({ type: 'gauge-set', title: g.title, groupId: g.id })}
                    title={!hasAny ? '미연결' : g.title}
                  >
                    {g.title}
                    {!hasAny && <span className="picker__item-badge">미연결</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 작동 상태 */}
          <div className="picker__section">
            <div className="picker__section-title">작동 상태</div>
            <p className="picker__section-desc">자수동 + ON/OFF 상태 패널</p>
            <div className="picker__grid">
              {STATUS_PANEL_GROUPS.map(g => {
                const hasAny = g.items.some(item => allAvailableIds.has(item.id))
                return (
                  <button
                    key={g.id}
                    className={`picker__item ${!hasAny ? 'picker__item--noapi' : ''}`}
                    onClick={() => hasAny && onAdd({ type: 'status-panel', title: g.title, groupId: g.id })}
                    title={!hasAny ? '미연결' : g.title}
                  >
                    {g.title}
                    {!hasAny && <span className="picker__item-badge">미연결</span>}
                  </button>
                )
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
