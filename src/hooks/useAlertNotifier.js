/**
 * useAlertNotifier
 *
 * KPI 슬롯 배열을 감시해 이상 상태로 전환될 때:
 *   1. 플랫폼 인앱 알림 (토스트 + 벨 패널) — 항상 발생
 *   2. Teams Incoming Webhook 알림 — alert:config.enabled + webhookUrl 설정 시
 *
 * 알림 타입:
 *   OUT_OF_RANGE  — 딜레이 경과 + 쿨다운 아님
 *   FLAPPING      — 딜레이 내 복귀 3회+
 *   STALE_CRIT / SENSOR_FAULT / SENSOR_LOST — 동일 정책
 *   RECOVERED     — 쿨다운 내 정상 복귀 (경고 발송 이력 있는 경우만)
 *
 * localStorage 키:
 *   alert:config            → { enabled, webhookUrl, cooldownMin }
 *   alert:cd:{id}:{status}  → 마지막 발송 timestamp(ms)
 */

import { useEffect, useRef } from 'react'
import { useNotification } from '../contexts/NotificationContext'
import { sendTeamsAlert, sendTeamsRecovery } from '../utils/teamsNotifier'

/** 알림을 트리거하는 상태 집합 */
const ALERT_STATUSES = new Set(['OUT_OF_RANGE', 'STALE_CRIT', 'SENSOR_FAULT', 'SENSOR_LOST'])
const FLAP_THRESHOLD = 3

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

function wasSent(id, status) {
  return localStorage.getItem(cdKey(id, status)) !== null
}

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
  const prevRef      = useRef({})
  const outSinceRef  = useRef({})   // { [slotId]: timestamp(ms) } — 이탈 최초 감지 시각
  const flapCountRef = useRef({})   // { [slotId]: number } — 딜레이 내 복귀 횟수
  const { addNotification } = useNotification()

  useEffect(() => {
    if (!slots?.length) return

    const cfg = loadAlertConfig()
    const now = Date.now()

    for (const slot of slots) {
      if (!slot?.id) continue
      const prev = prevRef.current[slot.id]
      const curr = slot.dataStatus
      const cooldownMin = slot.alertDelayMin ?? cfg.cooldownMin ?? 30

      // ── 정상 복귀 ─────────────────────────────────────────────────────────
      if (prev && ALERT_STATUSES.has(prev) && !ALERT_STATUSES.has(curr)) {
        const wasInDelay = outSinceRef.current[slot.id] != null

        // 딜레이 내 복귀 → FLAPPING 카운트
        if (wasInDelay) {
          const count = (flapCountRef.current[slot.id] ?? 0) + 1
          flapCountRef.current[slot.id] = count
          delete outSinceRef.current[slot.id]

          if (count >= FLAP_THRESHOLD) {
            flapCountRef.current[slot.id] = 0

            addNotification({
              kpiId:      slot.id,
              status:     'FLAPPING',
              title:      slot.title,
              icon:       slot.icon,
              value:      slot.value,
              unit:       slot.unit,
              yMin:       slot.yMin,
              yMax:       slot.yMax,
              zoneLabel:  slot.zoneLabel ?? null,
              flapCount:  count,
            })

            if (cfg.enabled && cfg.webhookUrl) {
              sendTeamsAlert(cfg.webhookUrl, { ...slot, dataStatus: 'FLAPPING', flapCount: count })
                .catch(err => console.warn('[Alert] Teams FLAPPING 알림 실패:', err.message))
            }
          }
        }

        // RECOVERED — 경고 발송 이력 있음 + 쿨다운 내 복귀
        if (wasSent(slot.id, prev) && isInCooldown(slot.id, prev, cooldownMin)) {
          addNotification({
            kpiId:      slot.id,
            status:     'RECOVERED',
            title:      slot.title,
            icon:       slot.icon,
            value:      slot.value,
            unit:       slot.unit,
            zoneLabel:  slot.zoneLabel ?? null,
            prevStatus: prev,
          })

          if (cfg.enabled && cfg.webhookUrl) {
            sendTeamsRecovery(cfg.webhookUrl, { ...slot, prevStatus: prev })
              .catch(err => console.warn('[Alert] Teams RECOVERED 알림 실패:', err.message))
          }
        }

        clearCooldown(slot.id, prev)
      }

      // ── 이상 상태 ──────────────────────────────────────────────────────────
      if (ALERT_STATUSES.has(curr)) {
        // 새로운 이탈 상태 전환 시 딜레이 타이머 시작
        if (curr !== prev) {
          outSinceRef.current[slot.id] = now
        }

        const outSince = outSinceRef.current[slot.id]
        const delayMs  = (slot.alertDelayMin ?? 0) * 60_000
        const delayOk  = outSince != null && (now - outSince >= delayMs)

        if (delayOk && !isInCooldown(slot.id, curr, cooldownMin)) {
          markCooldown(slot.id, curr)
          delete outSinceRef.current[slot.id]
          flapCountRef.current[slot.id] = 0  // 경고 발송 시 flapCount 리셋

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

          if (cfg.enabled && cfg.webhookUrl) {
            sendTeamsAlert(cfg.webhookUrl, slot).catch(err =>
              console.warn('[Alert] Teams 알림 전송 실패:', err.message)
            )
          }
        }
      } else {
        delete outSinceRef.current[slot.id]
      }

      prevRef.current[slot.id] = curr
    }
  }, [slots, addNotification])
}
