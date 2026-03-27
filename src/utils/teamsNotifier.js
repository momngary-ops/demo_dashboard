/**
 * Teams Incoming Webhook 알림 유틸
 *
 * 브라우저에서 직접 Teams URL로 POST하면 CORS 오류가 발생하므로
 * 백엔드 프록시 엔드포인트(/api/admin/notify/teams)를 통해 전송한다.
 *
 * MessageCard(deprecated) → Adaptive Card 형식으로 전환
 */

const PROXY_URL = '/api/admin/notify/teams'

const FAULT_STATUSES = new Set(['STALE_CRIT', 'SENSOR_FAULT', 'SENSOR_LOST'])

const STATUS_META = {
  OUT_OF_RANGE: { title: '⚠️ 임계치 이탈',     style: 'warning'   },
  FLAPPING:     { title: '⚠️ 반복 이탈 감지',   style: 'warning'   },
  STALE_CRIT:   { title: '🔴 데이터 수신 중단',  style: 'attention' },
  SENSOR_FAULT: { title: '🚨 센서 오류',         style: 'attention' },
  SENSOR_LOST:  { title: '🔌 센서 연결 끊김',    style: 'attention' },
}

const PREV_STATUS_LABEL = {
  OUT_OF_RANGE: '임계치 이탈',
  STALE_CRIT:   '데이터 수신 중단',
  SENSOR_FAULT: '센서 오류',
  SENSOR_LOST:  '센서 연결 끊김',
  FLAPPING:     '반복 이탈',
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
  const fmt = v >= 10000 ? v.toLocaleString() : Number.isInteger(v) ? String(v) : Number(v).toFixed(1)
  return `${fmt}${slot.unit ?? ''}`
}

function formatNow() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}  ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function deviationText(slot) {
  const { value, yMin, yMax, unit = '' } = slot
  if (value == null || yMin == null || yMax == null) return null
  if (value > yMax) return { diff: `+${(value - yMax).toFixed(1)}${unit}`, bound: `상한 ${yMax}${unit}` }
  if (value < yMin) return { diff: `-${(yMin - value).toFixed(1)}${unit}`, bound: `하한 ${yMin}${unit}` }
  return null
}

/** 컬러 스트립 헤더 컨테이너 */
function headerContainer(title, farmName, style) {
  return {
    type: 'Container',
    style,
    bleed: true,
    items: [{
      type: 'ColumnSet',
      columns: [
        {
          type: 'Column',
          width: 'stretch',
          items: [{
            type: 'TextBlock',
            text: title,
            weight: 'bolder',
            size: 'medium',
            wrap: false,
          }],
        },
        {
          type: 'Column',
          width: 'auto',
          verticalContentAlignment: 'center',
          items: [{
            type: 'TextBlock',
            text: farmName,
            isSubtle: true,
            size: 'small',
            wrap: false,
          }],
        },
      ],
    }],
  }
}

/** KPI 이름·구역 행 */
function kpiRow(slot) {
  const label = [slot.icon, slot.title, slot.zoneLabel ? `·  ${slot.zoneLabel}` : '']
    .filter(Boolean).join('  ')
  return {
    type: 'TextBlock',
    text: label,
    weight: 'bolder',
    spacing: 'medium',
    separator: true,
  }
}

/** 2열 데이터 행 */
function dataRow(leftLabel, leftValue, leftSub, rightLabel, rightValue, rightSub) {
  function col(label, value, sub) {
    const items = [
      { type: 'TextBlock', text: label, isSubtle: true, size: 'small', spacing: 'none' },
      { type: 'TextBlock', text: value, weight: 'bolder', spacing: 'none', wrap: false },
    ]
    if (sub) items.push({ type: 'TextBlock', text: sub, isSubtle: true, size: 'small', spacing: 'none' })
    return { type: 'Column', width: 'stretch', items }
  }
  return {
    type: 'ColumnSet',
    separator: true,
    spacing: 'small',
    columns: [col(leftLabel, leftValue, leftSub), col(rightLabel, rightValue, rightSub)],
  }
}

function wrapAdaptiveCard(body) {
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.2',
        body,
      },
    }],
  }
}

/** 경고 카드 (OUT_OF_RANGE) */
function buildWarningPayload(slot) {
  const farmName = getFarmName()
  const dev = deviationText(slot)
  const delayMin = slot.alertDelayMin ?? 0
  return wrapAdaptiveCard([
    headerContainer('⚠️ 임계치 이탈', farmName, 'warning'),
    kpiRow(slot),
    dataRow(
      '현재값',   formatValue(slot), null,
      '이탈 범위', dev?.diff ?? '--', dev?.bound ?? null,
    ),
    dataRow(
      '이탈 확정', delayMin > 0 ? `${delayMin}분 이상 지속` : '즉시 감지', null,
      '발생시각',  formatNow(),       null,
    ),
  ])
}

/** 반복 이탈 카드 (FLAPPING) */
function buildFlappingPayload(slot) {
  const farmName = getFarmName()
  const dev = deviationText(slot)
  return wrapAdaptiveCard([
    headerContainer('⚠️ 반복 이탈 감지', farmName, 'warning'),
    kpiRow(slot),
    dataRow(
      '현재값',   formatValue(slot),                          null,
      '이탈 범위', dev?.diff ?? '--',                          dev?.bound ?? null,
    ),
    dataRow(
      '이탈 확정', `딜레이 내 ${slot.flapCount ?? 3}회 반복`, null,
      '발생시각',  formatNow(),                                null,
    ),
  ])
}

/** 장애 카드 (STALE_CRIT / SENSOR_FAULT / SENSOR_LOST) */
function buildFaultPayload(slot) {
  const farmName = getFarmName()
  const meta = STATUS_META[slot.dataStatus] ?? { title: '⚠️ 알림', style: 'attention' }
  return wrapAdaptiveCard([
    headerContainer(meta.title, farmName, 'attention'),
    kpiRow(slot),
    dataRow(
      '마지막 수신값', formatValue(slot), null,
      '발생시각',      formatNow(),       null,
    ),
  ])
}

/** 복구 카드 (RECOVERED) */
function buildRecoveryPayload(slot) {
  const farmName = getFarmName()
  const prevLabel = PREV_STATUS_LABEL[slot.prevStatus] ?? '이상 상태'
  return wrapAdaptiveCard([
    headerContainer('✅ 정상 복귀', farmName, 'good'),
    kpiRow(slot),
    dataRow(
      '현재값',   formatValue(slot), null,
      '이전 상태', prevLabel,         null,
    ),
    {
      type: 'TextBlock',
      text: `복구 시각: ${formatNow()}`,
      isSubtle: true,
      size: 'small',
      separator: true,
      spacing: 'small',
    },
  ])
}

async function postToTeams(webhookUrl, payload) {
  const resp = await fetch(PROXY_URL, {
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

/**
 * Teams에 경고/FLAPPING/장애 알림 전송
 * @param {string} webhookUrl
 * @param {object} slot  dataStatus 포함 (FLAPPING인 경우 flapCount 포함)
 */
export async function sendTeamsAlert(webhookUrl, slot) {
  let payload
  if (slot.dataStatus === 'FLAPPING') {
    payload = buildFlappingPayload(slot)
  } else if (FAULT_STATUSES.has(slot.dataStatus)) {
    payload = buildFaultPayload(slot)
  } else {
    payload = buildWarningPayload(slot)
  }
  return postToTeams(webhookUrl, payload)
}

/**
 * Teams에 복구 알림 전송
 * @param {string} webhookUrl
 * @param {object} slot  prevStatus 포함
 */
export async function sendTeamsRecovery(webhookUrl, slot) {
  return postToTeams(webhookUrl, buildRecoveryPayload(slot))
}
