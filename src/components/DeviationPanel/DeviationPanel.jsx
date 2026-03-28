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
 * 닫기 정책:
 *   개별 ✕ 또는 "모두 닫기" → onDismiss(id) 호출 → DashboardPage에서 dismissedIds 관리
 *   센서 복귀 시 DashboardPage가 dismissedIds 자동 정리 → 카드 재등장
 *
 * TODO: 팝업 화면 추가 필요 — 카드 클릭 시 상세 이탈 이력/차트 팝업
 */

import { useState, useEffect } from 'react'
import { formatDuration } from '../../hooks/useDeviationTracker'
import './DeviationPanel.css'

function deviationLabel(value, yMin, yMax, unit) {
  if (yMin == null || yMax == null) return null
  if (value > yMax) return { text: `+${(value - yMax).toFixed(1)}${unit}`, dir: '초과중', bound: `상한 ${yMax}${unit}` }
  if (value < yMin) return { text: `-${(yMin - value).toFixed(1)}${unit}`, dir: '미달중', bound: `하한 ${yMin}${unit}` }
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

// 접혔을 때 한 줄 요약 칩
function SummaryChip({ slot, stats, isRed }) {
  const { todayAccumulatedMs = 0 } = stats ?? {}
  const dev = deviationLabel(slot.value, slot.yMin, slot.yMax, slot.unit ?? '')

  return (
    <span className={`dev-summary__chip ${isRed ? 'dev-summary__chip--red' : 'dev-summary__chip--orange'}`}>
      {slot.zoneLabel && <span className="dev-summary__chip-zone">{slot.zoneLabel}</span>}
      <span className="dev-summary__chip-title">{slot.title}</span>
      {dev && (
        <span className="dev-summary__chip-dev">{dev.text} {dev.dir}</span>
      )}
      {todayAccumulatedMs >= 60000 && (
        <span className="dev-summary__chip-accum">누적 {formatDuration(todayAccumulatedMs)}</span>
      )}
    </span>
  )
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
        <button
          className="dev-card__close"
          onClick={(e) => { e.stopPropagation(); onClose() }}
          title="카드 닫기"
          aria-label="카드 닫기"
        >✕</button>
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
 * @param {object[]} slots         OUT_OF_RANGE 슬롯 배열 (DashboardPage에서 dismissedIds 제외 후 전달)
 * @param {Map}      deviationStats 슬롯별 이탈 통계
 * @param {number}   expandTrigger  이 값이 바뀌면 패널을 자동으로 펼친다
 * @param {function} onDismiss      (id: string) => void — 개별 카드 닫기 시 DashboardPage로 위임
 */
export default function DeviationPanel({ slots, deviationStats, expandTrigger, onDismiss }) {
  const [collapsed, setCollapsed] = useState(false)

  // 신규 이탈 신호 → 패널 자동 펼치기
  useEffect(() => {
    setCollapsed(false)
  }, [expandTrigger])

  function handleClose(id) {
    onDismiss?.(id)
  }

  function handleDismissAll() {
    slots?.forEach(s => onDismiss?.(s.id))
  }

  if (!slots?.length) return null

  // 접힌 상태에서 보여줄 칩: 최대 3개, 이후 "외 N건"
  const MAX_CHIPS    = 3
  const summarySlots = slots.slice(0, MAX_CHIPS)
  const extraCount   = Math.max(0, slots.length - MAX_CHIPS)

  return (
    <div className={`dev-panel ${collapsed ? 'dev-panel--collapsed' : ''}`}>
      <div className="dev-panel__header">
        {/* 접힌 상태: 한 줄 요약 칩 */}
        {collapsed ? (
          <div className="dev-panel__summary">
            <span className="dev-panel__icon-warn">⚠</span>
            <div className="dev-panel__summary-chips">
              {summarySlots.map(slot => (
                <SummaryChip
                  key={slot.id}
                  slot={slot}
                  stats={deviationStats?.get(slot.id)}
                  isRed={isRedCondition(slot, deviationStats?.get(slot.id))}
                />
              ))}
              {extraCount > 0 && (
                <span className="dev-summary__more">외 {extraCount}건</span>
              )}
            </div>
          </div>
        ) : (
          <span className="dev-panel__title">
            <span className="dev-panel__icon-warn">⚠</span>
            임계치 이탈 센서
            <span className="dev-panel__count">{slots.length}건</span>
          </span>
        )}

        <div className="dev-panel__header-actions">
          {!collapsed && slots.length > 0 && (
            <button className="dev-panel__dismiss" onClick={handleDismissAll}>
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
          {slots.map(slot => (
            <DeviationCard
              key={slot.id}
              slot={slot}
              stats={deviationStats?.get(slot.id)}
              onClose={() => handleClose(slot.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
