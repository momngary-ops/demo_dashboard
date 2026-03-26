/**
 * Teams Incoming Webhook 알림 유틸
 *
 * 브라우저에서 직접 Teams URL로 POST하면 CORS 오류가 발생하므로
 * 백엔드 프록시 엔드포인트(/api/admin/notify/teams)를 통해 전송한다.
 */

const ALERT_META = {
  OUT_OF_RANGE:  { title: '⚠️ 임계치 이탈',       themeColor: 'FF8800', emoji: '⚠️' },
  STALE_CRIT:    { title: '🔴 데이터 수신 중단',    themeColor: 'FF0000', emoji: '🔴' },
  SENSOR_FAULT:  { title: '🚨 센서 오류',           themeColor: 'FF0000', emoji: '🚨' },
  SENSOR_LOST:   { title: '🔌 센서 연결 끊김',      themeColor: 'CC0000', emoji: '🔌' },
  NULL_DATA:     { title: '❓ 데이터 없음',          themeColor: 'FFCC00', emoji: '❓' },
}

function getFarmName() {
  try {
    const cfg = localStorage.getItem('farm:config')
    return cfg ? JSON.parse(cfg).farmName ?? '스마트팜' : '스마트팜'
  } catch { return '스마트팜' }
}

function formatValue(slot) {
  if (slot.value === null || slot.value === undefined) return '--'
  const v = slot.value
  const fmt = (v >= 10000) ? v.toLocaleString() : Number.isInteger(v) ? String(v) : Number(v).toFixed(1)
  return `${fmt} ${slot.unit ?? ''}`.trim()
}

/** Teams MessageCard 페이로드 빌드 */
function buildPayload(slot) {
  const meta      = ALERT_META[slot.dataStatus] ?? { title: '알림', themeColor: '888888' }
  const farmName  = getFarmName()
  const now       = new Date().toLocaleString('ko-KR', { hour12: false })

  const facts = [
    { name: '항목',    value: `${slot.icon ?? ''} ${slot.title}`.trim() },
    { name: '현재값',  value: formatValue(slot) },
    { name: '발생시각', value: now },
    { name: '농장',    value: farmName },
  ]

  if (slot.zoneLabel) {
    facts.splice(2, 0, { name: '구역', value: slot.zoneLabel })
  }

  if (slot.dataStatus === 'OUT_OF_RANGE' && slot.yMin != null && slot.yMax != null) {
    facts.splice(2, 0, { name: '정상범위', value: `${slot.yMin} ~ ${slot.yMax} ${slot.unit ?? ''}`.trim() })
  }

  return {
    '@type':      'MessageCard',
    '@context':   'http://schema.org/extensions',
    themeColor:   meta.themeColor,
    summary:      `${meta.title} — ${slot.title}`,
    sections: [{
      activityTitle:    `**${meta.title}**`,
      activitySubtitle: farmName,
      facts,
      markdown: true,
    }],
  }
}

/**
 * Teams에 알림 전송
 * @param {string} webhookUrl  Teams Incoming Webhook URL
 * @param {object} slot        KPI 슬롯 (id, title, value, unit, dataStatus, yMin, yMax, icon)
 */
export async function sendTeamsAlert(webhookUrl, slot) {
  const payload = buildPayload(slot)
  const resp = await fetch('/api/admin/notify/teams', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ webhookUrl, payload }),
    signal:  AbortSignal.timeout(12_000),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`서버 응답 ${resp.status}: ${text}`)
  }
  return resp.json()
}
