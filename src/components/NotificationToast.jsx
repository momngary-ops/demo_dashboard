import { useEffect } from 'react'
import { useNotification } from '../contexts/NotificationContext'
import './NotificationToast.css'

const ALERT_META = {
  OUT_OF_RANGE: { label: '임계치 이탈',    color: 'warn',  emoji: '⚠️' },
  STALE_CRIT:   { label: '데이터 수신 중단', color: 'crit', emoji: '🔴' },
  SENSOR_FAULT: { label: '센서 오류',       color: 'crit',  emoji: '🚨' },
  SENSOR_LOST:  { label: '센서 연결 끊김',   color: 'crit', emoji: '🔌' },
}

const TOAST_DURATION = 8_000

function fmt(value, unit) {
  if (value === null || value === undefined) return null
  const v = value >= 10000 ? value.toLocaleString() : Number.isInteger(value) ? String(value) : Number(value).toFixed(1)
  return `${v} ${unit ?? ''}`.trim()
}

function SingleToast({ toast, onDismiss }) {
  const meta = ALERT_META[toast.status] ?? { label: '알림', color: 'warn', emoji: '❕' }

  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), TOAST_DURATION)
    return () => clearTimeout(t)
  }, [toast.id, onDismiss])

  return (
    <div className={`n-toast n-toast--${meta.color}`}>
      <span className="n-toast__emoji">{meta.emoji}</span>
      <div className="n-toast__body">
        <span className="n-toast__label">{meta.label}</span>
        <span className="n-toast__kpi">{toast.icon ?? ''} {toast.title}</span>
        {fmt(toast.value, toast.unit) && (
          <span className="n-toast__value">{fmt(toast.value, toast.unit)}</span>
        )}
        {toast.status === 'OUT_OF_RANGE' && toast.yMin != null && toast.yMax != null && (
          <span className="n-toast__range">정상범위 {toast.yMin} ~ {toast.yMax} {toast.unit ?? ''}</span>
        )}
        {toast.zoneLabel && (
          <span className="n-toast__zone">{toast.zoneLabel}</span>
        )}
      </div>
      <button className="n-toast__close" onClick={() => onDismiss(toast.id)} aria-label="닫기">×</button>
    </div>
  )
}

export function ToastContainer() {
  const { toasts, dismissToast } = useNotification()
  if (!toasts.length) return null

  return (
    <div className="n-toast-container">
      {toasts.map(t => (
        <SingleToast key={t.id} toast={t} onDismiss={dismissToast} />
      ))}
    </div>
  )
}
