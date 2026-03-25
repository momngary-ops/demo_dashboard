/**
 * 서버 설정 저장/불러오기 API
 * GET  /api/settings  — 전체 설정 반환
 * POST /api/settings  — 설정 저장 (부분 병합)
 */

const BASE = '/api'

/** 서버에서 전체 설정 로드. 실패 시 null 반환 */
export async function fetchSettings() {
  try {
    const res = await fetch(`${BASE}/settings`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/** 설정 일부를 서버에 저장 (기존 키와 병합). 실패 시 조용히 무시 */
export async function saveSettings(patch) {
  try {
    await fetch(`${BASE}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
      signal: AbortSignal.timeout(5000),
    })
  } catch { /* 무시 — localStorage는 이미 저장됨 */ }
}
