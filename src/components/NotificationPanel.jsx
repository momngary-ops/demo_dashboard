import { useEffect, useRef } from 'react'
import { useNotification } from '../contexts/NotificationContext'
import './NotificationPanel.css'

const ALERT_META = {
  OUT_OF_RANGE: { label: '임계치 이탈',     emoji: '⚠️', color: 'warn' },
  FLAPPING:     { label: '반복 이탈',       emoji: '🔁', color: 'warn' },
  STALE_CRIT:   { label: '데이터 수신 중단', emoji: '🔴', color: 'crit' },
  SENSOR_FAULT: { label: '센서 오류',        emoji: '🚨', color: 'crit' },
  SENSOR_LOST:  { label: '센서 연결 끊김',   emoji: '🔌', color: 'crit' },
  RECOVERED:    { label: '정상 복귀',        emoji: '✅', color: 'good' },
}

const PREV_LABEL = {
  OUT_OF_RANGE: '임계치 이탈',
  STALE_CRIT:   '데이터 수신 중단',
  SENSOR_FAULT: '센서 오류',
  SENSOR_LOST:  '센서 연결 끊김',
  FLAPPING:     '반복 이탈',
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffMin = Math.floor((now - d) / 60_000)
  if (diffMin < 1)  return '방금'
  if (diffMin < 60) return `${diffMin}분 전`
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}시간 전`
  return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
}

function fmtValue(value, unit) {
  if (value === null || value === undefined) return null
  const v = value >= 10000 ? value.toLocaleString() : Number.isInteger(value) ? String(value) : Number(value).toFixed(1)
  return `${v} ${unit ?? ''}`.trim()
}

export default function NotificationPanel({ onClose }) {
  const { notifications, clearAll } = useNotification()
  const ref = useRef(null)

  // 패널 외부 클릭 시 닫기
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.closest('.header__bell-wrap')?.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <div className="n-panel" ref={ref}>
      <div className="n-panel__header">
        <span className="n-panel__title">알림</span>
        {notifications.length > 0 && (
          <button className="n-panel__clear" onClick={clearAll}>전체 삭제</button>
        )}
      </div>

      <div className="n-panel__list">
        {notifications.length === 0 ? (
          <div className="n-panel__empty">알림이 없습니다</div>
        ) : (
          notifications.map(n => {
            const meta = ALERT_META[n.status] ?? { label: '알림', emoji: '❕', color: 'warn' }
            return (
              <div key={n.id} className={`n-panel__item n-panel__item--${meta.color} ${n.read ? 'n-panel__item--read' : ''}`}>
                <span className="n-panel__item-emoji">{meta.emoji}</span>
                <div className="n-panel__item-body">
                  <div className="n-panel__item-top">
                    <span className="n-panel__item-label">{meta.label}</span>
                    <span className="n-panel__item-time">{fmtTime(n.timestamp)}</span>
                  </div>
                  <span className="n-panel__item-kpi">{n.icon ?? ''} {n.title}</span>
                  {fmtValue(n.value, n.unit) && (
                    <span className="n-panel__item-value">{fmtValue(n.value, n.unit)}</span>
                  )}
                  {n.status === 'OUT_OF_RANGE' && n.yMin != null && n.yMax != null && (
                    <span className="n-panel__item-range">정상범위 {n.yMin} ~ {n.yMax} {n.unit ?? ''}</span>
                  )}
                  {n.status === 'FLAPPING' && n.flapCount != null && (
                    <span className="n-panel__item-range">딜레이 내 {n.flapCount}회 반복 이탈</span>
                  )}
                  {n.status === 'RECOVERED' && n.prevStatus && (
                    <span className="n-panel__item-range">이전 상태: {PREV_LABEL[n.prevStatus] ?? n.prevStatus}</span>
                  )}
                  {n.zoneLabel && (
                    <span className="n-panel__item-zone">{n.zoneLabel}</span>
                  )}
                </div>
                {!n.read && <span className="n-panel__item-dot" />}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
