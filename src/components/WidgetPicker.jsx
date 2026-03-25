import { useState, useMemo } from 'react'
import { X, ChevronDown, ChevronRight } from 'lucide-react'
import { KPI_CANDIDATES, CHART_MAIN_CANDIDATES } from '../constants/kpiCandidates'
import { GAUGE_SET_GROUPS, STATUS_PANEL_GROUPS } from '../constants/actuatorCandidates'
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

  const staticCategories = [...new Set(KPI_CANDIDATES.map(c => c.category))]

  return (
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker" onClick={e => e.stopPropagation()}>
        <div className="picker__header">
          <span className="picker__title">위젯 추가</span>
          <button className="picker__close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="picker__body">

          {/* 메인 카드 (chart-main) */}
          <div className="picker__section">
            <div className="picker__section-title">메인 카드</div>
            <p className="picker__section-desc">스파크라인 + 현재값 + 보조 지표 (기본 4×3)</p>
            <div className="picker__grid">
              {CHART_MAIN_CANDIDATES.map(c => (
                <KpiItem
                  key={c.id}
                  c={c}
                  avail={isAvailable(c.id)}
                  liveMap={liveMap}
                  onAdd={def => onAdd({ ...def, type: 'chart-main' })}
                />
              ))}
            </div>
          </div>

          {/* 수치 카드 */}
          <div className="picker__section">
            <div className="picker__section-title">수치 카드</div>
            <p className="picker__section-desc">단일 센서값 표시 (온도, 습도 등)</p>

            {staticCategories.map(cat => (
              <div key={cat}>
                <div className="picker__cat-label">{cat}</div>
                <div className="picker__grid">
                  {KPI_CANDIDATES.filter(c => c.category === cat).map(c => (
                    <KpiItem key={c.id} c={c} avail={isAvailable(c.id)} liveMap={liveMap} onAdd={onAdd} />
                  ))}
                </div>
              </div>
            ))}

            {/* 확장 센서 — 접기/펼치기 */}
            {dynamicCandidates.length > 0 && (
              <div className="picker__expand-wrap">
                <button
                  className="picker__expand-toggle"
                  onClick={() => setExpandDynamic(v => !v)}
                >
                  {expandDynamic ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  확장 센서 {dynamicCandidates.length}개
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
            )}
          </div>

          {/* 차트 (멀티라인) */}
          <div className="picker__section">
            <div className="picker__section-title">차트</div>
            <p className="picker__section-desc">시계열 멀티라인 차트 (주 KPI + 오버레이)</p>
            <div className="picker__grid">
              {[...KPI_CANDIDATES, ...dynamicCandidates].map(c => {
                const avail = isAvailable(c.id)
                return (
                  <button
                    key={c.id}
                    className={`picker__item ${!avail ? 'picker__item--noapi' : ''}`}
                    onClick={() => avail && onAdd({ type: 'chart', title: c.title, kpiId: c.id, unit: c.unit, overlayIds: [] })}
                    title={!avail ? '미연결' : c.title}
                  >
                    {c.icon} {c.title}
                    {!avail && <span className="picker__item-badge">미연결</span>}
                  </button>
                )
              })}
            </div>
          </div>

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
