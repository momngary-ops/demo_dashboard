/**
 * useAlertNotifier
 *
 * KPI 슬롯 배열을 감시해 이상 상태로 전환될 때:
 *   1. 플랫폼 인앱 알림 (토스트 + 벨 패널) — 항상 발생
 *   2. Teams Incoming Webhook 알림 — alert:config.enabled + webhookUrl 설정 시
 *
 * - 동일 KPI + 동일 상태는 쿨다운 시간 내 재발송하지 않음 (localStorage 기록)
 * - 정상(OK)으로 회복된 후 다시 이상 상태가 되면 쿨다운 초기화되어 재발송
 *
 * localStorage 키:
 *   alert:config          → { enabled, webhookUrl, cooldownMin }
 *   alert:cd:{id}:{status} → 마지막 발송 timestamp(ms)
 */

import { useEffect, useRef } from 'react'
import { useNotification } from '../contexts/NotificationContext'
import { sendTeamsAlert } from '../utils/teamsNotifier'

/** 알림을 트리거하는 상태 집합 */
const ALERT_STATUSES = new Set(['OUT_OF_RANGE', 'STALE_CRIT', 'SENSOR_FAULT', 'SENSOR_LOST'])

export const ALERT_CONFIG_KEY = 'alert:config'

export function loadAlertConfig() {
  try {
    const raw = localStorage.getItem(ALERT_CONFIG_KEY)
    return raw
      ? { enabled: false, webhookUrl: '', cooldownMin: 30, ...JSON.parse(raw) }
      : { enabled: false, webhookUrl: '', cooldownMin: 30 }
  } catch { return { enabled: false, webhookUrl: '', cooldownMin: 30 } }
}

export function saveAlertConfig(cfg) {
  try { localStorage.setItem(ALERT_CONFIG_KEY, JSON.stringify(cfg)) } catch { /* quota */ }
}

function cdKey(id, status) { return `alert:cd:${id}:${status}` }

function isInCooldown(id, status, cooldownMin) {
  const raw = localStorage.getItem(cdKey(id, status))
  if (!raw) return false
  return Date.now() - parseInt(raw, 10) < cooldownMin * 60_000
}

function markCooldown(id, status) {
  try { localStorage.setItem(cdKey(id, status), String(Date.now())) } catch { /* quota */ }
}

function clearCooldown(id, status) {
  try { localStorage.removeItem(cdKey(id, status)) } catch { /* ignore */ }
}

/**
 * @param {Array} slots  useKpiPolling이 반환하는 슬롯 배열 (id, dataStatus, ...)
 */
export function useAlertNotifier(slots) {
  const prevRef = useRef({})
  const { addNotification } = useNotification()

  useEffect(() => {
    if (!slots?.length) return

    const cfg = loadAlertConfig()

    for (const slot of slots) {
      if (!slot?.id) continue
      const prev = prevRef.current[slot.id]
      const curr = slot.dataStatus

      // 정상 복귀 시 쿨다운 초기화
      if (prev && ALERT_STATUSES.has(prev) && !ALERT_STATUSES.has(curr)) {
        clearCooldown(slot.id, prev)
      }

      // 이상 상태로 전환 + 쿨다운 아닌 경우
      if (ALERT_STATUSES.has(curr) && curr !== prev) {
        if (!isInCooldown(slot.id, curr, cfg.cooldownMin ?? 30)) {
          markCooldown(slot.id, curr)

          // 1. 인앱 알림 (항상)
          addNotification({
            kpiId:     slot.id,
            status:    curr,
            title:     slot.title,
            icon:      slot.icon,
            value:     slot.value,
            unit:      slot.unit,
            yMin:      slot.yMin,
            yMax:      slot.yMax,
            zoneLabel: slot.zoneLabel ?? null,
          })

          // 2. Teams 알림 (설정된 경우만)
          if (cfg.enabled && cfg.webhookUrl) {
            sendTeamsAlert(cfg.webhookUrl, slot).catch(err =>
              console.warn('[Alert] Teams 알림 전송 실패:', err.message)
            )
          }
        }
      }

      prevRef.current[slot.id] = curr
    }
  }, [slots, addNotification])
}
