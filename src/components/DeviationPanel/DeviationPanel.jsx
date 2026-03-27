/**
 * DeviationPanel
 *
 * OUT_OF_RANGE 슬롯들을 4열 그리드로 최상단에 표시.
 * - 현재값 + 이탈범위
 * - 이탈 지속시간 / 오늘 누적 이탈시간
 *
 * 카드 색상 정책:
 *   기본(주황): --accent (#E5401A)
 *   위험(빨강): --danger (#e05c5c)
 *     조건: 오늘 누적 ≥ 10분  OR  이탈량 / (yMax-yMin) ≥ 10%
 *
 * TODO: 팝업 화면 추가 필요 — 카드 클릭 시 상세 이탈 이력/차트 팝업
 */

import { useState, useEffect, useRef } from 'react'
import { formatDuration } from '../../hooks/useDeviationTracker'
import './DeviationPanel.css'

function deviationLabel(value, yMin, yMax, unit) {
  if (yMin == null || yMax == null) return null
  if (value > yMax) return { text: `+${(value - yMax).toFixed(1)}${unit}`, bound: `상한 ${yMax}${unit}` }
  if (value < yMin) return { text: `-${(yMin - value).toFixed(1)}${unit}`, bound: `하한 ${yMin}${unit}` }
  return null
}

function isRedCondition(slot, stats) {
  const { todayAccumulatedMs = 0 } = stats ?? {}
  if (todayAccumulatedMs >= 10 * 60 * 1000) return true
  if (slot.value != null && slot.yMin != null && slot.yMax != null) {
    const range = slot.yMax - slot.yMin
    if (range > 0) {
      if (slot.value > slot.yMax && (slot.value - slot.yMax) / range >= 0.1) return true
      if (slot.value < slot.yMin && (slot.yMin - slot.value) / range >= 0.1) return true
    }
  }
  return false
}

function DeviationCard({ slot, stats, onClose }) {
  const { currentElapsedMs = 0, todayAccumulatedMs = 0 } = stats ?? {}
  const dev   = deviationLabel(slot.value, slot.yMin, slot.yMax, slot.unit ?? '')
  const isRed = isRedCondition(slot, stats)

  return (
    <div className={`dev-card ${isRed ? 'dev-card--red' : 'dev-card--orange'}`}>
      <div className="dev-card__header">
        <span className="dev-card__icon">{slot.icon}</span>
        <span className="dev-card__title">{slot.title}</span>
        {slot.zoneLabel && <span className="dev-card__zone">{slot.zoneLabel}</span>}
        <button className="dev-card__close" onClick={onClose} title="카드 닫기">✕</button>
      </div>

      <div className="dev-card__body">
        <div className="dev-card__metric">
          <span className="dev-card__metric-label">현재값</span>
          <span className="dev-card__metric-value">
            {slot.value != null ? `${slot.value}${slot.unit ?? ''}` : '–'}
          </span>
        </div>
        <div className="dev-card__metric">
          <span className="dev-card__metric-label">이탈 범위</span>
          {dev ? (
            <>
              <span className="dev-card__metric-value">{dev.text}</span>
              <span className="dev-card__metric-sub">{dev.bound}</span>
            </>
          ) : (
            <span className="dev-card__metric-value dev-card__metric-value--muted">기준 미설정</span>
          )}
        </div>
        <div className="dev-card__metric">
          <span className="dev-card__metric-label">이탈 지속</span>
          <span className="dev-card__metric-value">{formatDuration(currentElapsedMs)}</span>
        </div>
        <div className="dev-card__metric">
          <span className="dev-card__metric-label">오늘 누적</span>
          <span className="dev-card__metric-value">{formatDuration(todayAccumulatedMs)}</span>
        </div>
      </div>
    </div>
  )
}

/**
 * @param {object[]} slots         OUT_OF_RANGE 슬롯 배열
 * @param {Map}      deviationStats 슬롯별 이탈 통계
 * @param {number}   expandTrigger  이 값이 바뀌면 패널을 자동으로 펼친다
 *                                  (DashboardPage에서 신규 이탈 감지 시 증가)
 */
export default function DeviationPanel({ slots, deviationStats, expandTrigger }) {
  const [collapsed, setCollapsed] = useState(false)
  const [hiddenIds, setHiddenIds] = useState(new Set())
  const prevIdsRef = useRef(new Set())

  // 신규 이탈 신호 → 패널 자동 펼치기
  useEffect(() => {
    setCollapsed(false)
  }, [expandTrigger])

  // slots에서 사라진 ID(센서 복귀 등)는 hiddenIds에서도 제거
  useEffect(() => {
    const currentIds = new Set(slots?.map(s => s.id) ?? [])
    // 이전에 없던 ID가 생기면 hiddenIds에서 제거 (재이탈 → 카드 재등장)
    const newIds = slots?.filter(s => !prevIdsRef.current.has(s.id)).map(s => s.id) ?? []
    prevIdsRef.current = currentIds

    setHiddenIds(prev => {
      // 더 이상 이탈 중이 아닌 ID + 재이탈로 복귀한 ID 제거
      const toRemove = new Set([
        ...[...prev].filter(id => !currentIds.has(id)),
        ...newIds,
      ])
      if (toRemove.size === 0) return prev
      const next = new Set([...prev].filter(id => !toRemove.has(id)))
      return next
    })
  }, [slots])

  const visibleSlots = slots?.filter(s => !hiddenIds.has(s.id)) ?? []

  function hideCard(id) {
    setHiddenIds(prev => new Set([...prev, id]))
  }

  function hideAll() {
    setHiddenIds(new Set(slots?.map(s => s.id) ?? []))
  }

  if (!slots?.length) return null

  return (
    <div className="dev-panel">
      <div className="dev-panel__header">
        <span className="dev-panel__title">
          <span className="dev-panel__icon-warn">⚠</span>
          임계치 이탈 센서
          <span className="dev-panel__count">{slots.length}건</span>
        </span>
        <div className="dev-panel__header-actions">
          {!collapsed && visibleSlots.length > 0 && (
            <button className="dev-panel__dismiss" onClick={hideAll}>
              모두 닫기
            </button>
          )}
          <button
            className="dev-panel__collapse"
            onClick={() => setCollapsed(v => !v)}
            title={collapsed ? '펼치기' : '접기'}
          >
            {collapsed ? '▼' : '▲'}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="dev-panel__grid">
          {visibleSlots.map(slot => (
            <DeviationCard
              key={slot.id}
              slot={slot}
              stats={deviationStats?.get(slot.id)}
              onClose={() => hideCard(slot.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
