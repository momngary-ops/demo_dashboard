import { useState } from 'react'
import { KPI_CANDIDATES } from '../../constants/kpiCandidates'
import { MOCK_API_DATA } from '../../mocks/kpiMockData'
import './KpiSelectorModal.css'

function fmt(v) {
  if (v === null || v === undefined) return '--'
  if (v >= 10000) return v.toLocaleString()
  return Number.isInteger(v) ? String(v) : Number(v).toFixed(1)
}

/** 한 후보 카드 */
function CandidateCard({ candidate, isActive, onAdd, onRemove, liveSlot }) {
  const noApi = !candidate.id
  const value = liveSlot?.value ?? (candidate.id ? (MOCK_API_DATA[candidate.id]?.value ?? null) : null)

  return (
    <div
      className={`kpi-modal__cand ${isActive ? 'kpi-modal__cand--active' : ''} ${noApi ? 'kpi-modal__cand--noapi' : ''}`}
      onClick={() => isActive ? onRemove() : onAdd()}
    >
      <div className="kpi-modal__cand-top">
        <span className="kpi-modal__cand-icon">{candidate.icon}</span>
        <span className="kpi-modal__cand-title">{candidate.title}</span>
        {noApi && <span className="kpi-modal__badge kpi-modal__badge--lock">🔒 API 준비 중</span>}
        {isActive && <span className="kpi-modal__badge kpi-modal__badge--active">✓ 선택됨</span>}
      </div>
      <div className="kpi-modal__cand-val">
        {noApi
          ? <span className="kpi-modal__noapi-txt">준비 중</span>
          : <><span style={{ color: '#fff', fontWeight: 700 }}>{fmt(value)}</span> <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{candidate.unit}</span></>
        }
      </div>
    </div>
  )
}

/** KPI 선택 모달
 * slots: 현재 활성 슬롯 configs (5개)
 * kpiSlots: 실시간 폴링 데이터 (value 미리보기용)
 * onSlotsChange: 새 슬롯 배열 콜백
 */
export default function KpiSelectorModal({ slots, kpiSlots = [], onSlotsChange, onClose }) {
  const [localSlots, setLocalSlots] = useState(slots)

  const activeIds = localSlots.map(s => s.id)

  const handleAdd = (candidate) => {
    const emptyIdx = localSlots.findIndex(s => s.id === null && candidate.id !== null)
    if (localSlots.length < 5) {
      setLocalSlots(prev => [...prev, candidate])
    } else if (emptyIdx >= 0) {
      const next = [...localSlots]
      next[emptyIdx] = candidate
      setLocalSlots(next)
    } else {
      // 5개 다 차있으면 첫 번째 교체
      const next = [...localSlots]
      next[0] = candidate
      setLocalSlots(next)
    }
  }

  const handleRemove = (candidate) => {
    setLocalSlots(prev => prev.filter(s => !(s.id === candidate.id && s.title === candidate.title)))
  }

  const handleApply = () => {
    onSlotsChange(localSlots)
    onClose()
  }

  const categories = [...new Set(KPI_CANDIDATES.map(c => c.category))]

  return (
    <div className="kpi-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="kpi-modal">
        <div className="kpi-modal__header">
          <span className="kpi-modal__title">KPI 항목 선택</span>
          <span className="kpi-modal__sub">최대 5개 선택 가능 (현재 {localSlots.length}개)</span>
          <button className="kpi-modal__close" onClick={onClose}>✕</button>
        </div>

        {/* 현재 선택된 슬롯 미리보기 */}
        <div className="kpi-modal__active-row">
          {localSlots.map((s, i) => (
            <div key={i} className="kpi-modal__active-chip" style={{ background: s.bgColor ?? 'rgba(71,85,105,0.5)' }}>
              <span>{s.icon} {s.title}</span>
              <button
                className="kpi-modal__chip-remove"
                onClick={() => handleRemove(s)}
              >✕</button>
            </div>
          ))}
          {Array.from({ length: 5 - localSlots.length }, (_, i) => (
            <div key={`empty-${i}`} className="kpi-modal__active-chip kpi-modal__active-chip--empty">
              빈 슬롯
            </div>
          ))}
        </div>

        {/* 후보 풀 */}
        <div className="kpi-modal__body">
          {categories.map(cat => (
            <div key={cat} className="kpi-modal__group">
              <div className="kpi-modal__group-label">{cat}</div>
              <div className="kpi-modal__grid">
                {KPI_CANDIDATES.filter(c => c.category === cat).map((c, i) => {
                  const isActive = activeIds.some(
                    (id, idx) => id === c.id && localSlots[idx].title === c.title
                  )
                  const liveSlot = kpiSlots.find(s => s.id === c.id)
                  return (
                    <CandidateCard
                      key={`${cat}-${i}`}
                      candidate={c}
                      isActive={isActive}
                      onAdd={() => handleAdd(c)}
                      onRemove={() => handleRemove(c)}
                      liveSlot={liveSlot}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="kpi-modal__footer">
          <button className="kpi-modal__btn kpi-modal__btn--cancel" onClick={onClose}>취소</button>
          <button className="kpi-modal__btn kpi-modal__btn--apply" onClick={handleApply}>적용</button>
        </div>
      </div>
    </div>
  )
}
