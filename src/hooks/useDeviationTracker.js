/**
 * useDeviationTracker
 *
 * alertSlots 배열을 감시해 OUT_OF_RANGE 상태인 슬롯의:
 *   1. 현재 이탈 지속시간 (이탈 시작 시각 ~ 현재, 1초 갱신)
 *   2. 오늘 누적 이탈시간 (localStorage 영속, 자정 초기화)
 * 을 추적한다.
 *
 * localStorage 키: deviation:{slotId}:{YYYY-MM-DD}
 */

import { useEffect, useRef, useState } from 'react'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function loadAccum(slotId, date) {
  try {
    return parseInt(localStorage.getItem(`deviation:${slotId}:${date}`), 10) || 0
  } catch { return 0 }
}

function saveAccum(slotId, date, ms) {
  try { localStorage.setItem(`deviation:${slotId}:${date}`, String(ms)) } catch { /* quota */ }
}

/**
 * 경과 ms → 한국어 시간 문자열
 * @param {number} ms
 * @returns {string}  예: "12분 30초", "1시간 23분", "45초"
 */
export function formatDuration(ms) {
  if (!ms || ms < 60000) return '1분 미만'
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return `${h}시간 ${m}분`
  return `${m}분`
}

/**
 * @param {Array} slots - DashboardPage의 alertSlots 전체
 * @returns {Map<string, { currentElapsedMs: number, todayAccumulatedMs: number }>}
 */
export function useDeviationTracker(slots) {
  // { [slotId]: { startMs: number|null, accumMs: number, date: string } }
  const trackerRef  = useRef({})
  const prevRef     = useRef({})   // 이전 dataStatus 기록 (전환 감지용)
  const [, bump]    = useState(0)  // 1초 tick용

  useEffect(() => {
    const now   = Date.now()
    const today = todayStr()

    for (const slot of slots ?? []) {
      if (!slot?.id) continue
      const isOut  = slot.dataStatus === 'OUT_OF_RANGE'
      const wasOut = prevRef.current[slot.id] === 'OUT_OF_RANGE'
      prevRef.current[slot.id] = slot.dataStatus

      let tr = trackerRef.current[slot.id]
      if (!tr) {
        tr = { startMs: null, accumMs: loadAccum(slot.id, today), date: today }
        trackerRef.current[slot.id] = tr
      }

      // 자정 초기화 — 이탈 중에 날짜가 바뀐 경우도 처리
      if (tr.date !== today) {
        if (tr.startMs !== null) {
          saveAccum(slot.id, tr.date, tr.accumMs + (now - tr.startMs))
          tr.startMs = isOut ? now : null  // 오늘 기준 재시작
        }
        tr.accumMs = 0
        tr.date    = today
      }

      // 정상 → 이탈: 타이머 시작
      if (isOut && !wasOut) {
        tr.startMs = now
      }
      // 이탈 → 정상: 누적 합산 후 타이머 정지
      if (!isOut && wasOut && tr.startMs !== null) {
        tr.accumMs += now - tr.startMs
        saveAccum(slot.id, today, tr.accumMs)
        tr.startMs = null
      }
    }
  }, [slots])

  // 이탈 중인 슬롯이 있으면 1초마다 강제 리렌더
  useEffect(() => {
    const hasActive = slots?.some(s => s.dataStatus === 'OUT_OF_RANGE')
    if (!hasActive) return
    const id = setInterval(() => bump(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [slots])

  // 렌더 시점에 Map 계산
  const now   = Date.now()
  const today = todayStr()
  const result = new Map()

  for (const slot of slots ?? []) {
    if (!slot?.id) continue
    const tr = trackerRef.current[slot.id]
    if (!tr) continue

    const isOut  = slot.dataStatus === 'OUT_OF_RANGE'
    const accumMs = tr.date === today ? tr.accumMs : 0
    const currentElapsedMs = isOut && tr.startMs != null ? now - tr.startMs : 0
    const todayAccumulatedMs = isOut && tr.startMs != null
      ? accumMs + currentElapsedMs
      : accumMs

    result.set(slot.id, { currentElapsedMs, todayAccumulatedMs })
  }

  return result
}
