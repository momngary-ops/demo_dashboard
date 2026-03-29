import { useState, useRef, useEffect, useMemo } from 'react'
import { GripHorizontal, X, Pencil, Plus } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { GAUGE_SET_GROUPS, STATUS_PANEL_GROUPS } from '../constants/actuatorCandidates'
import { useGuideline } from '../contexts/GuidelineContext'
import './Widget.css'

const ERROR_STATUSES = new Set(['NULL_DATA', 'SENSOR_FAULT', 'API_TIMEOUT', 'NO_API', 'SENSOR_LOST'])

function fmt(v) {
  if (v === null || v === undefined) return '--'
  if (v >= 10000) return v.toLocaleString()
  if (Number.isInteger(v)) return String(v)
  return Number(v).toFixed(1)
}

// ─── SparklineSVG ────────────────────────────────────────────────────────────
// glBands: [{ startPct, endPct, min, max }] — 24h 시간대별 가이드라인 밴드
// 경계 연속성: 동일한 fullD 경로를 clipPath로 분할 → 경계에서 끊김 없음
// 정상 구간: #6AC8C7(teal), 이탈 구간: #f59e0b(orange), 밴드 없음: currentColor
function SparklineSVG({ data, glBands }) {
  // 인스턴스별 고유 ID — SVG defs 충돌 방지 (복수 위젯 공존 시)
  const uid = useRef(`spk${Math.random().toString(36).slice(2, 6)}`).current

  if (!data || data.length < 2) return null

  const W = 200, H = 60, PAD = 6
  const min = Math.min(...data)
  const max = Math.max(...data)
  const isFlat = min === max
  const pts = data.length

  const hasBands = glBands && glBands.length > 0
  const bandOverallMin = hasBands ? Math.min(...glBands.map(b => b.min)) : undefined
  const bandOverallMax = hasBands ? Math.max(...glBands.map(b => b.max)) : undefined

  const yLo = (hasBands && !isFlat) ? Math.min(min, bandOverallMin) : min
  const yHi = (hasBands && !isFlat) ? Math.max(max, bandOverallMax) : max
  const yRange = yHi - yLo

  const toY = (v) => isFlat
    ? H / 2
    : PAD + (1 - (v - yLo) / (yRange || 1)) * (H - PAD * 2)

  const points = data.map((v, i) => ({
    x: PAD + (i / (pts - 1)) * (W - PAD * 2),
    y: toY(v),
  }))

  // Catmull-Rom → Cubic Bezier (tension 0.3) — 전체 경로 1개 생성
  const tension = 0.3
  let fullD = `M ${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`
  for (let i = 0; i < pts - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(pts - 1, i + 2)]
    const cp1x = p1.x + (p2.x - p0.x) * tension
    const cp1y = p1.y + (p2.y - p0.y) * tension
    const cp2x = p2.x - (p3.x - p1.x) * tension
    const cp2y = p2.y - (p3.y - p1.y) * tension
    fullD += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`
  }

  const last  = points[pts - 1]
  const areaD = isFlat ? null
    : `${fullD} L ${last.x.toFixed(2)},${H} L ${points[0].x.toFixed(2)},${H} Z`

  // 포인트별 정상/이탈 판정 + 단발 스파이크 억제
  const COLOR_IN  = '#6AC8C7'
  const COLOR_OUT = '#f59e0b'

  const isInRange = data.map((v, i) => {
    if (!hasBands) return true
    const pct  = i / (pts - 1)
    const band = glBands.find(b => pct >= b.startPct && pct <= b.endPct)
    if (!band) return true
    return v >= band.min && v <= band.max
  })

  const stable = [...isInRange]
  for (let i = 1; i < stable.length - 1; i++) {
    if (stable[i] !== stable[i - 1] && stable[i] !== stable[i + 1]) {
      stable[i] = stable[i - 1]
    }
  }

  // 연속 구간 묶기
  const segments = []
  let segStart = 0
  for (let i = 1; i <= stable.length; i++) {
    if (i === stable.length || stable[i] !== stable[segStart]) {
      segments.push({ start: segStart, end: i - 1, inRange: stable[segStart] })
      segStart = i
    }
  }

  const lastColor = hasBands ? (stable[pts - 1] ? COLOR_IN : COLOR_OUT) : 'currentColor'

  return (
    <svg
      className="cm-sparkline__svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      overflow="hidden"
    >
      <defs>
        <linearGradient id={`${uid}-grad`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0"    />
        </linearGradient>
        {/* 세그먼트 클립 영역 — 인접 경계의 X 중간점으로 분할하여 틈 없이 연결 */}
        {hasBands && segments.map((seg, si) => {
          const prev  = segments[si - 1]
          const next  = segments[si + 1]
          const leftX = si === 0
            ? 0
            : (points[prev.end].x + points[seg.start].x) / 2
          const rightX = si === segments.length - 1
            ? W
            : (points[seg.end].x + points[next.start].x) / 2
          return (
            <clipPath key={si} id={`${uid}-${si}`}>
              <rect x={leftX} y={0} width={Math.max(0, rightX - leftX)} height={H} />
            </clipPath>
          )
        })}
      </defs>

      {/* min/max 점선 기준선 */}
      {!isFlat && <>
        <line x1={PAD} y1={PAD}     x2={W - PAD} y2={PAD}
              stroke="currentColor" strokeWidth="0.7" strokeDasharray="4 3" opacity="0.4" />
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD}
              stroke="currentColor" strokeWidth="0.7" strokeDasharray="4 3" opacity="0.4" />
      </>}

      {/* 시간대별 가이드라인 밴드 */}
      {hasBands && !isFlat && glBands.map((band, bi) => {
        const bx1 = PAD + band.startPct * (W - PAD * 2)
        const bx2 = PAD + band.endPct   * (W - PAD * 2)
        const by1 = toY(band.max)
        const by2 = toY(band.min)
        const bh  = Math.abs(by2 - by1)
        if (bh <= 0) return null
        return (
          <rect
            key={bi}
            x={bx1} y={Math.min(by1, by2)}
            width={Math.max(0, bx2 - bx1)} height={bh}
            fill="rgba(106,200,199,0.15)"
            stroke="rgba(106,200,199,0.5)"
            strokeWidth="0.5"
            strokeDasharray="3 3"
          />
        )
      })}

      {areaD && <path d={areaD} fill={`url(#${uid}-grad)`} />}

      {/* 색상 경로 — 동일한 fullD를 clipPath로 분할 (경계 C1 연속 보장) */}
      {hasBands
        ? segments.map((seg, si) => (
            <path
              key={si}
              d={fullD}
              fill="none"
              stroke={seg.inRange ? COLOR_IN : COLOR_OUT}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.9"
              vectorEffect="non-scaling-stroke"
              clipPath={`url(#${uid}-${si})`}
            />
          ))
        : <path d={fullD} fill="none" stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round" opacity="0.9"
                vectorEffect="non-scaling-stroke" />
      }
      <circle cx={last.x} cy={last.y} r="3" fill={lastColor} opacity="0.95" />
    </svg>
  )
}

// 0°=북 기준 시계방향 8방위 변환
const COMPASS8 = ['북', '북동', '동', '남동', '남', '남서', '서', '북서']
function toCompass8(deg) {
  if (deg === null || deg === undefined) return '--'
  return COMPASS8[Math.round(((deg % 360) + 360) % 360 / 45) % 8]
}

// ─── CompassDial ─────────────────────────────────────────────────────────────
function CompassDial({ deg }) {
  const S = 120, cx = 60, cy = 60, r = 50
  const validDeg = (deg !== null && deg !== undefined && !isNaN(deg))
  const rotation = validDeg ? ((deg % 360) + 360) % 360 : 0

  // 8방향 눈금 + 4방위 레이블
  const DIRS = ['북','','동','','남','','서','']
  const ticks = Array.from({ length: 8 }, (_, i) => {
    const rad = (i * 45 - 90) * Math.PI / 180
    const isMajor = i % 2 === 0
    const inner   = isMajor ? r * 0.82 : r * 0.90
    return {
      x1: cx + r      * Math.cos(rad),
      y1: cy + r      * Math.sin(rad),
      x2: cx + inner  * Math.cos(rad),
      y2: cy + inner  * Math.sin(rad),
      lx: cx + r * 0.64 * Math.cos(rad),
      ly: cy + r * 0.64 * Math.sin(rad),
      label: DIRS[i],
      isMajor,
    }
  })

  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="cm-compass-svg">
      {/* 외곽 링 */}
      <circle cx={cx} cy={cy} r={r}
        fill="none" stroke="var(--border)" strokeWidth="1.5" />
      {/* 내부 희미한 링 */}
      <circle cx={cx} cy={cy} r={r * 0.55}
        fill="none" stroke="var(--border)" strokeWidth="0.8" strokeDasharray="3 3" />

      {/* 눈금 + 방위 레이블 */}
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke="var(--text-secondary)"
            strokeWidth={t.isMajor ? 1.8 : 1}
            opacity={t.isMajor ? 0.8 : 0.45}
          />
          {t.label && (
            <text x={t.lx} y={t.ly}
              textAnchor="middle" dominantBaseline="central"
              fontSize="10" fontWeight="600"
              fill={t.label === '북' ? 'var(--accent)' : 'var(--text-secondary)'}
            >
              {t.label}
            </text>
          )}
        </g>
      ))}

      {/* 바람 방향 화살표 (deg 방향에서 불어오는 방향으로 회전) */}
      <g transform={`rotate(${rotation}, ${cx}, ${cy})`} opacity={validDeg ? 1 : 0.25}>
        {/* 앞쪽 침 (accent 색) */}
        <polygon
          points={`${cx},${cy - r * 0.75} ${cx - 5},${cy + 4} ${cx},${cy - 4} ${cx + 5},${cy + 4}`}
          fill="var(--accent)"
        />
        {/* 뒤쪽 침 (muted 색) */}
        <polygon
          points={`${cx},${cy + r * 0.52} ${cx - 4},${cy - 2} ${cx},${cy + 4} ${cx + 4},${cy - 2}`}
          fill="var(--text-muted)"
        />
      </g>
      {/* 중심 도트 */}
      <circle cx={cx} cy={cy} r="4" fill="var(--surface-2)" stroke="var(--text-secondary)" strokeWidth="1.5" />

      {/* 하단 도수 표시 */}
      {validDeg && (
        <text x={cx} y={S - 6}
          textAnchor="middle" fontSize="9"
          fill="var(--text-muted)"
        >
          {Math.round(rotation)}°
        </text>
      )}
    </svg>
  )
}

// ─── ChartMainWidget ─────────────────────────────────────────────────────────
function ChartMainWidget({ config, kpiSlot, candidate, gridSize, extraSlots }) {
  const value  = kpiSlot?.value ?? null
  const status = kpiSlot?.dataStatus ?? 'LOADING'
  const data   = kpiSlot?.data ?? []
  const unit   = kpiSlot?.unit ?? config.unit ?? candidate?.unit ?? ''

  // 24h 시간대별 가이드라인 밴드 (xintemp1 / xinhum1 / xco2 만 적용)
  const { guidelines } = useGuideline() ?? {}
  const kid = config.kpiId ?? candidate?.id
  const glBands = useMemo(() => {
    if (!guidelines || !kid) return []
    if (kid !== 'xintemp1' && kid !== 'xinhum1' && kid !== 'xco2') return []
    const now = Date.now()
    const windowMs    = 24 * 60 * 60_000
    const windowStart = now - windowMs
    const bands = []
    for (let h = 0; h < 24; h++) {
      const segStart = windowStart + h * 3_600_000
      const segEnd   = Math.min(segStart + 3_600_000, now)
      const midTs    = (segStart + segEnd) / 2
      const hour     = new Date(midTs).getHours()
      const monthKey = String(new Date(midTs).getMonth() + 1)
      const rows     = guidelines[monthKey]
      if (!rows) continue
      const row = rows.find(r => r.hour === hour)
      if (!row) continue
      let glMin, glMax
      if (kid === 'xintemp1') { glMin = row.temp_min; glMax = row.temp_max }
      if (kid === 'xinhum1')  { glMin = row.hum_min;  glMax = row.hum_max  }
      if (kid === 'xco2')     { glMin = row.co2 * 0.9; glMax = row.co2 * 1.1 }
      if (glMin != null && glMax != null) {
        bands.push({
          startPct: (segStart - windowStart) / windowMs,
          endPct:   (segEnd   - windowStart) / windowMs,
          min: glMin,
          max: glMax,
        })
      }
    }
    return bands
  }, [guidelines, kid])

  const isLoading = status === 'LOADING'
  const isError   = ERROR_STATUSES.has(status)
  const isCrit    = status === 'STALE_CRIT'
  const isWarn    = status === 'STALE_WARN'

  // 8방위 표시 여부
  const isCompass   = candidate?.displayType === 'compass8'
  const displayVal  = isCompass ? toCompass8(value) : fmt(value)
  const displayUnit = isCompass ? '' : unit

  const subRows = candidate?.subRows ?? []

  // 크기 tier — w<3 또는 h<2 이하는 stat 형태(값만)
  const isCompact = gridSize && (gridSize.w < 3 || gridSize.h < 2)
  const hideSpark = isCompact
  const hideRow2  = isCompact || (gridSize && gridSize.h < 3 && gridSize.w < 4)

  // 신호등 dot — 대동 브랜드 색상 정책
  // 정상: Future Green Light / 경고: 앰버 / 심각·오류: Daedong Red / 미연결: 그레이
  const signalColor =
    (isCrit || status === 'SENSOR_FAULT')  ? '#EF4023' :
    isWarn                                  ? '#fb923c' :
    status === 'OUT_OF_RANGE'              ? '#f59e0b' :
    status === 'OK'                         ? '#6AC8C7' :
    status === 'SENSOR_LOST'              ? '#9E9F9C' :
    '#4a5a7a'

  // delta / trend (row1)
  const row1 = subRows[0]
  const deltaWindowMin = row1?.deltaWindowMin ?? 30
  const prevValue = deltaWindowMin <= 30 ? (kpiSlot?.prev30 ?? null) : (kpiSlot?.prev60 ?? null)
  const delta = (value !== null && prevValue !== null)
    ? +(value - prevValue).toFixed(1) : null
  const trend = delta === null ? null : delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat'

  // row2 값 계산
  const row2 = subRows[1] ?? null
  let row2Value = null
  if (row2) {
    if (row2.type === 'sparkline-range' && data.length >= 2) {
      const dMax = Math.max(...data)
      const dMin = Math.min(...data)
      row2Value = `${fmt(dMax)} / ${fmt(dMin)}`
    } else if (row2.kpiId2) {
      const v1 = extraSlots?.[row2.kpiId]?.value
      const v2 = extraSlots?.[row2.kpiId2]?.value
      row2Value = `${fmt(v1)} / ${fmt(v2)}`
    } else if (row2.kpiId) {
      const v = extraSlots?.[row2.kpiId]?.value
      row2Value = fmt(v) + (row2.unit ? ` ${row2.unit}` : '')
    }
  }

  if (isLoading) {
    return (
      <div className="chart-main">
        <div className="cm-value-area">
          <div className="cm-shimmer cm-shimmer--val" />
        </div>
        {!hideSpark && (
          <div className="cm-spark-area">
            <div className="cm-shimmer cm-shimmer--spark" />
          </div>
        )}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="chart-main">
        <div className="cm-value-area">
          <div className="cm-primary-row">
            <span className="cm-value" style={{ color: 'var(--text-muted)' }}>--</span>
            {unit && <span className="cm-unit">{unit}</span>}
          </div>
          <div className="cm-stale-msg">
            {status === 'NO_API' ? '준비 중' : status === 'SENSOR_LOST' ? '⚠ 센서 끊김' : '연결 재시도 중...'}
          </div>
        </div>
      </div>
    )
  }

  const valueColor =
    (isCrit || status === 'SENSOR_FAULT') ? '#EF4023' :
    isWarn                                 ? '#fb923c' :
    status === 'OUT_OF_RANGE'             ? '#f59e0b' :
    'var(--text-primary)'

  // 스파크라인 색 — 상태별 분리 (정상은 Future Green Light, 문제시에만 빨강)
  const sparkColor =
    (isCrit || status === 'SENSOR_FAULT') ? '#EF4023' :
    isWarn                                 ? '#fb923c' :
    status === 'OUT_OF_RANGE'             ? '#f59e0b' :
    status === 'OK'                        ? '#6AC8C7' :
    status === 'SENSOR_LOST'             ? '#9E9F9C' :
    '#4a5a7a'

  return (
    <div className={`chart-main${hideSpark ? ' chart-main--compact' : ''}`}>
      {/* 현재값 영역 */}
      <div className="cm-value-area">
        <div className="cm-primary-row">
          <span className="cm-signal" style={{ background: signalColor }} />
          <span className="cm-value" style={{ color: valueColor }}>{displayVal}</span>
          <span className="cm-unit">{displayUnit}</span>
        </div>
        {/* 나침반 모드: 방위각 도수 보조 표시 */}
        {isCompass && value !== null && !isCompact && (
          <div className="cm-secondary-row">
            <span className="cm-sec-label">방위각</span>
            <span className="cm-sec-val">{fmt(value)}°</span>
          </div>
        )}

        {row1?.showDelta && delta !== null && (
          <div className={`cm-delta cm-delta--${trend}`}>
            {delta > 0 ? '+' : ''}{delta}
            {row1?.showTrend && trend && trend !== 'flat' && (
              <span className={`cm-trend cm-trend--${trend}`}>
                {trend === 'up' ? ' ▲' : ' ▼'}
              </span>
            )}
          </div>
        )}

        {row2 && !hideRow2 && row2Value && (
          <div className="cm-secondary-row">
            <span className="cm-sec-label">{row2.label}</span>
            <span className="cm-sec-val">{row2Value}</span>
          </div>
        )}

        {(isWarn || isCrit) && (
          <div className="cm-stale-msg" style={{ color: valueColor }}>
            {isCrit ? '🔴 데이터 지연' : '⚠ 데이터 지연'}
          </div>
        )}
      </div>

      {/* 나침반 모드: 다이얼 표시 */}
      {isCompass && !hideSpark && (
        <div className="cm-compass-area">
          <CompassDial deg={value} />
        </div>
      )}

      {/* 스파크라인 영역 — 하단 (나침반 모드 제외) */}
      {!isCompass && !hideSpark && data.length >= 2 && (() => {
        const dMax = Math.max(...data)
        const dMin = Math.min(...data)
        const hasRange = dMax !== dMin
        return (
          <div className="cm-spark-area" style={{ color: sparkColor }}>
            <SparklineSVG data={data} glBands={glBands} />
            {hasRange && <>
              <span className="cm-spark-label cm-spark-label--max">
                {fmt(dMax)}{unit && ` ${unit}`}
              </span>
              <span className="cm-spark-label cm-spark-label--min">
                {fmt(dMin)}{unit && ` ${unit}`}
              </span>
            </>}
          </div>
        )
      })()}
    </div>
  )
}

// ─── ComputedWidget ──────────────────────────────────────────────────────────
function svp(t) {
  return 0.6108 * Math.exp(17.27 * t / (t + 237.3))
}

function calcComputed(formula, val1, val2, constant) {
  if (formula === 'subtract')
    return (val1 !== null && val2 !== null) ? +(val1 - val2).toFixed(2) : null
  if (formula === 'multiply_const')
    return (val1 !== null) ? +(val1 * (constant ?? 1)).toFixed(1) : null
  if (formula === 'vpd') {
    if (val1 === null || val2 === null) return null
    return +((svp(val1) * (1 - val2 / 100)).toFixed(2))
  }
  return null
}

function buildSparkData(formula, data1, data2, val2, constant) {
  if (formula === 'subtract' && data1.length >= 2 && data2.length >= 2)
    return data1.map((v, i) => +(v - (data2[i] ?? val2 ?? 0)).toFixed(2))
  if (formula === 'multiply_const' && data1.length >= 2)
    return data1.map(v => +(v * (constant ?? 1)).toFixed(1))
  if (formula === 'vpd' && data1.length >= 2 && data2.length >= 2)
    return data1.map((t, i) => {
      const rh = data2[i] ?? val2 ?? 0
      return +((svp(t) * (1 - rh / 100)).toFixed(2))
    })
  return []
}

function ComputedWidget({ config, kpiSlot, kpiSlot2, gridSize }) {
  const val1   = kpiSlot?.value  ?? null
  const val2   = kpiSlot2?.value ?? null
  const unit   = config.unit ?? '°C'
  const formula = config.formula ?? 'subtract'

  const computed = calcComputed(formula, val1, val2, config.constant)

  const status1   = kpiSlot?.dataStatus  ?? 'LOADING'
  const status2   = config.kpiId2 ? (kpiSlot2?.dataStatus ?? 'LOADING') : 'OK'
  const isLoading = status1 === 'LOADING' || status2 === 'LOADING'
  const isError   = (ERROR_STATUSES.has(status1) && status1 !== 'LOADING') ||
                    (config.kpiId2 && ERROR_STATUSES.has(status2) && status2 !== 'LOADING')
  const isCompact = gridSize && (gridSize.w < 3 || gridSize.h < 2)

  const data1 = kpiSlot?.data  ?? []
  const data2 = kpiSlot2?.data ?? []
  const sparkData = buildSparkData(formula, data1, data2, val2, config.constant)

  if (isLoading) {
    return (
      <div className="chart-main">
        <div className="cm-value-area"><div className="cm-shimmer cm-shimmer--val" /></div>
        {!isCompact && <div className="cm-spark-area"><div className="cm-shimmer cm-shimmer--spark" /></div>}
      </div>
    )
  }

  if (isError || computed === null) {
    return (
      <div className="chart-main">
        <div className="cm-value-area">
          <div className="cm-primary-row">
            <span className="cm-value" style={{ color: 'var(--text-muted)' }}>--</span>
            <span className="cm-unit">{unit}</span>
          </div>
          <div className="cm-stale-msg">연결 재시도 중...</div>
        </div>
      </div>
    )
  }

  return (
    <div className={`chart-main${isCompact ? ' chart-main--compact' : ''}`}>
      <div className="cm-value-area">
        <div className="cm-primary-row">
          <span className="cm-value">{fmt(computed)}</span>
          <span className="cm-unit">{unit}</span>
        </div>
        {config.description && (
          <div className="cm-secondary-row">
            <span className="cm-sec-label">{config.description}</span>
            {formula !== 'multiply_const' && val1 !== null && val2 !== null && (
              <span className="cm-sec-val">{fmt(val1)} / {fmt(val2)}</span>
            )}
          </div>
        )}
      </div>
      {!isCompact && sparkData.length >= 2 && (
        <div className="cm-spark-area">
          <SparklineSVG data={sparkData} />
        </div>
      )}
    </div>
  )
}

// ─── StatWidget ──────────────────────────────────────────────────────────────
function StatWidget({ config, kpiSlot, candidate, gridSize }) {
  const value  = kpiSlot?.value ?? null
  const unit   = kpiSlot?.unit ?? config.unit ?? candidate?.unit ?? ''
  const status = kpiSlot?.dataStatus ?? 'LOADING'

  const isLoading = status === 'LOADING'
  const isError   = ERROR_STATUSES.has(status)
  const isCrit    = status === 'STALE_CRIT'
  const isWarn    = status === 'STALE_WARN'

  const icon    = candidate?.icon ?? null
  const yMin    = candidate?.yMin ?? null
  const yMax    = candidate?.yMax ?? null

  const rangePct = (value !== null && yMin !== null && yMax !== null && yMax > yMin)
    ? Math.max(0, Math.min(1, (value - yMin) / (yMax - yMin))) : null

  const isXS      = gridSize && (gridSize.h <= 2 || gridSize.w <= 2)
  const showRange = rangePct !== null && !isXS && gridSize?.h >= 4
  const showIcon  = icon && !isXS

  const valueColor =
    (isCrit || status === 'SENSOR_FAULT') ? '#EF4023' :
    isWarn                                 ? '#fb923c' :
    status === 'OUT_OF_RANGE'             ? '#f59e0b' :
    'var(--text-primary)'

  if (isLoading) {
    return (
      <div className="widget__stat">
        <div className="widget__stat-value" style={{ color: 'var(--text-muted)' }}>--</div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="widget__stat">
        <div className="widget__stat-value" style={{ color: 'var(--text-muted)' }}>--</div>
        <div className="widget__stat-msg">
          {status === 'API_TIMEOUT'  ? '연결 재시도 중...' :
           status === 'NO_API'       ? '준비 중' :
           status === 'SENSOR_LOST'  ? '⚠ 센서 연결 끊김' : '센서 오류'}
        </div>
      </div>
    )
  }

  return (
    <div className={`widget__stat${isXS ? ' widget__stat--xs' : ''}`}>
      {showIcon && <div className="widget__stat-icon">{icon}</div>}
      <div className="widget__stat-value"
           style={{ color: valueColor, opacity: isCrit ? 0.65 : 1 }}>
        {fmt(value)}<span className="widget__stat-unit">{unit}</span>
      </div>
      {(isWarn || isCrit) && (
        <div className="widget__stat-msg" style={{ color: valueColor }}>
          {isCrit ? '🔴 데이터 지연' : '⚠ 데이터 지연'}
        </div>
      )}
      {showRange && (
        <div className="widget__stat-range">
          <div className="widget__stat-range-track">
            <div className="widget__stat-range-fill"
                 style={{ width: `${rangePct * 100}%` }} />
          </div>
          <div className="widget__stat-range-labels">
            <span>{fmt(yMin)}</span>
            <span>{fmt(yMax)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── GaugeSetWidget ──────────────────────────────────────────────────────────
function GaugeSetWidget({ config, actuatorSlots, allAvailableIds }) {
  const group = GAUGE_SET_GROUPS.find(g => g.id === config.groupId)
  if (!group) return <div className="gauge-set"><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>그룹을 찾을 수 없음</span></div>

  const visibleItems = allAvailableIds?.size > 0
    ? group.items.filter(item => allAvailableIds.has(item.id))
    : group.items

  if (visibleItems.length === 0) {
    return (
      <div className="gauge-set" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>연결된 구동기 없음</span>
      </div>
    )
  }

  return (
    <div className="gauge-set">
      {visibleItems.map(item => {
        const slot = actuatorSlots?.[item.id.toLowerCase()]
        const rawVal = slot?.value ?? null
        const pct = rawVal !== null ? Math.max(0, Math.min(100, rawVal)) : null
        return (
          <div key={item.id + item.label} className="gs-row">
            <span className="gs-label">{item.label}</span>
            <div className="gs-track">
              <div className="gs-fill" style={{ width: pct !== null ? `${pct}%` : '0%' }} />
            </div>
            <span className="gs-pct">{pct !== null ? `${Math.round(pct)}%` : '--'}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── StatusPanelWidget ───────────────────────────────────────────────────────
function StatusPanelWidget({ config, actuatorSlots, allAvailableIds }) {
  const group = STATUS_PANEL_GROUPS.find(g => g.id === config.groupId)
  if (!group) return <div className="status-panel"><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>그룹을 찾을 수 없음</span></div>

  const visibleItems = allAvailableIds?.size > 0
    ? group.items.filter(item => allAvailableIds.has(item.id))
    : group.items

  if (visibleItems.length === 0) {
    return (
      <div className="status-panel" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>연결된 장치 없음</span>
      </div>
    )
  }

  return (
    <div className="status-panel">
      {visibleItems.map((item, idx) => {
        const autoSlot = actuatorSlots?.[item.id.toLowerCase()]
        const runSlot  = item.runId ? actuatorSlots?.[item.runId.toLowerCase()] : null
        const autoVal  = autoSlot?.value ?? null
        // 1 = 자동, 0 = 수동, null = 미확인
        const isAuto   = autoVal === 1 || autoVal === true
        const runVal   = runSlot?.value ?? null
        const isOn     = runVal === 1 || runVal === true
        return (
          <div key={`${item.id}-${idx}`} className="sp-row">
            <span className="sp-label">{item.label}</span>
            {autoVal !== null && (
              <span className={`sp-auto ${isAuto ? 'sp-auto--a' : 'sp-auto--m'}`}>
                {isAuto ? '자동' : '수동'}
              </span>
            )}
            {item.runId && runVal !== null && (
              <span className={`sp-run ${isOn ? 'sp-run--on' : 'sp-run--off'}`}>
                {isOn ? '● ON' : '○ OFF'}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── 오버레이 드롭다운 ────────────────────────────────────────────────────────
const OVERLAY_PALETTE = ['#2d7dd2', '#4ade80', '#fb923c', '#f472b6', '#a78bfa']

function OverlayDropdown({ allCandidates, allAvailableIds, currentIds, onToggle, onClose }) {
  const available = allCandidates.filter(c =>
    !allAvailableIds || allAvailableIds.size === 0 || allAvailableIds.has(c.id)
  )
  return (
    <div className="overlay-dropdown" onClick={e => e.stopPropagation()}>
      <div className="overlay-dropdown__header">
        <span>오버레이 KPI</span>
        <button className="overlay-dropdown__close" onClick={onClose}><X size={12} /></button>
      </div>
      <div className="overlay-dropdown__list">
        {available.map(c => {
          const active = currentIds.includes(c.id)
          return (
            <button
              key={c.id}
              className={`overlay-dropdown__item ${active ? 'overlay-dropdown__item--active' : ''}`}
              onClick={() => onToggle(c.id)}
            >
              {c.title}
              {active && <span style={{ marginLeft: 'auto', color: '#4ade80', fontSize: 10 }}>✓</span>}
            </button>
          )
        })}
        {available.length === 0 && (
          <span style={{ padding: '6px 8px', fontSize: 11, color: 'var(--text-muted)' }}>연결된 KPI 없음</span>
        )}
      </div>
    </div>
  )
}

// ─── MultiLineChartWidget (Recharts) ─────────────────────────────────────────
function MultiLineChartWidget({ config, kpiSlot, extraSlots, candidate, allCandidates, allAvailableIds, onConfigChange }) {
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const primaryData  = kpiSlot?.data ?? []
  const overlayIds   = config.overlayIds ?? []
  const primaryUnit  = kpiSlot?.unit ?? config.unit ?? candidate?.unit ?? ''

  // 차트 데이터 빌드: 인덱스 기준 (0=12h전, 끝=현재)
  const pts = primaryData.length || 1
  const chartData = Array.from({ length: pts }, (_, i) => {
    const point = { _idx: i }
    point[config.kpiId ?? 'primary'] = primaryData[i] ?? null
    overlayIds.forEach(id => {
      const slot = extraSlots?.[id]
      const d = slot?.data ?? []
      // overlay 데이터가 primary와 길이 다를 수 있어 비율로 매핑
      const mappedIdx = d.length > 1
        ? Math.round(i * (d.length - 1) / Math.max(pts - 1, 1))
        : 0
      point[id] = d[mappedIdx] ?? null
    })
    return point
  })

  const allLines = [
    { id: config.kpiId ?? 'primary', label: config.title, color: OVERLAY_PALETTE[0] },
    ...overlayIds.slice(0, 4).map((id, i) => {
      const c = allCandidates?.find(x => x.id === id)
      return { id, label: c?.title ?? id, color: OVERLAY_PALETTE[i + 1] }
    }),
  ]

  // X축 레이블: 총 80포인트 → 12h → 간격 = 12*60/80 = 9분
  const xFormatter = (idx) => {
    if (idx !== 0 && idx !== Math.floor(pts / 2) && idx !== pts - 1) return ''
    const msAgo = (pts - 1 - idx) * (12 * 60 * 60_000 / Math.max(pts - 1, 1))
    const d = new Date(Date.now() - msAgo)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const handleToggleOverlay = (id) => {
    const cur = config.overlayIds ?? []
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]
    onConfigChange?.({ overlayIds: next })
  }

  const isLoading = !kpiSlot || kpiSlot.dataStatus === 'LOADING'
  const isError   = kpiSlot && ERROR_STATUSES.has(kpiSlot.dataStatus)

  if (isLoading) {
    return (
      <div className="chart-multi">
        <div className="cm-shimmer cm-shimmer--spark" style={{ flex: 1 }} />
      </div>
    )
  }

  if (isError || primaryData.length < 2) {
    return (
      <div className="chart-multi" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          {isError ? (kpiSlot?.dataStatus === 'NO_API' ? '준비 중' : '데이터 없음') : '데이터 수집 중...'}
        </span>
      </div>
    )
  }

  return (
    <div className="chart-multi">
      {/* 범례 + 오버레이 버튼 */}
      <div className="chart-multi__top">
        <div className="chart-multi__legend">
          {allLines.map(l => (
            <span key={l.id} className="chart-multi__legend-item">
              <span className="chart-multi__legend-dot" style={{ background: l.color }} />
              {l.label}
              {primaryUnit && l.id === (config.kpiId ?? 'primary') && ` (${primaryUnit})`}
            </span>
          ))}
        </div>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            className="chart-multi__overlay-btn"
            onClick={() => setDropdownOpen(v => !v)}
            title="오버레이 KPI 추가/제거"
          >
            <Plus size={11} />
          </button>
          {dropdownOpen && (
            <OverlayDropdown
              allCandidates={allCandidates ?? []}
              allAvailableIds={allAvailableIds}
              currentIds={overlayIds}
              onToggle={handleToggleOverlay}
              onClose={() => setDropdownOpen(false)}
            />
          )}
        </div>
      </div>

      {/* Recharts */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="_idx"
              tickFormatter={xFormatter}
              tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.4)' }}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.4)' }}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              tickLine={false}
              width={32}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontSize: 11,
                color: 'var(--text-primary)',
              }}
              labelFormatter={() => ''}
            />
            {allLines.map(l => (
              <Line
                key={l.id}
                type="monotone"
                dataKey={l.id}
                stroke={l.color}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3 }}
                name={l.label}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── AvgTempWidget ───────────────────────────────────────────────────────────
function AvgTempWidget({ config, kpiSlots, zoneId, gridSize }) {
  const [weekly, setWeekly] = useState(null)

  useEffect(() => {
    if (!zoneId) return
    const load = () =>
      fetch(`/api/zone/${encodeURIComponent(zoneId)}/temp-weekly-avg`)
        .then(r => r.ok ? r.json() : null)
        .then(d => d && setWeekly(d))
        .catch(() => {})
    load()
    const t = setInterval(load, 5 * 60_000)
    return () => clearInterval(t)
  }, [zoneId])

  const validSlots = (kpiSlots ?? []).filter(s => s?.value != null)
  const currentAvg = validSlots.length > 0
    ? +(validSlots.reduce((s, sl) => s + sl.value, 0) / validSlots.length).toFixed(1)
    : null

  const dayAvg   = weekly?.week_day_avg   ?? null
  const nightAvg = weekly?.week_night_avg ?? null
  const dailyAvg = weekly?.week_daily_avg ?? null

  // 알림은 useAlertNotifier(xintemp1 기반)에서 처리 — 이 위젯에서 직접 발송하지 않음
  const isAlert = false
  const isNightAlert = false

  const chartData = (weekly?.days ?? []).map(d => ({
    date:      d.date?.slice(5),
    day_high:  d.day_high,
    daily_avg: d.daily_avg,
    night_low: d.night_low,
  }))

  const isCompact = gridSize && (gridSize.w < 3 || gridSize.h < 2)

  return (
    <div className={`chart-main${isAlert ? ' chart-main--alert' : ''}`}>
      <div className="cm-value-area" style={{ flexShrink: 0 }}>
        <div className="cm-primary-row">
          {currentAvg !== null
            ? <><span className="cm-value">{currentAvg}</span><span className="cm-unit">°C</span></>
            : <span className="cm-value" style={{ color: 'var(--text-muted)' }}>--</span>
          }
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>
            {validSlots.length}개 센서
          </span>
        </div>
      </div>

      {!isCompact && chartData.length >= 2 && (
        <div style={{ flex: 1, minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.4)' }}
                     axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.4)' }}
                     axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
                       formatter={(v, name) => [`${v}°C`, name]} />
              <Line type="monotone" dataKey="day_high"  stroke="#f97316" strokeWidth={1.5} dot={false} name="주간최고" connectNulls />
              <Line type="monotone" dataKey="daily_avg" stroke="#6ac8c7" strokeWidth={1.5} dot={false} name="일평균"   connectNulls />
              <Line type="monotone" dataKey="night_low" stroke="#60a5fa" strokeWidth={1.5} dot={false} name="야간최저" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexShrink: 0, fontSize: 11, paddingTop: 4 }}>
        <span style={{ color: '#f97316' }}>주간 {dayAvg ?? '--'}°C</span>
        <span style={{ color: 'rgba(255,255,255,0.4)' }}>|</span>
        <span style={{ color: '#6ac8c7' }}>일평균 {dailyAvg ?? '--'}°C</span>
        <span style={{ color: 'rgba(255,255,255,0.4)' }}>|</span>
        <span style={{ color: isNightAlert ? '#f87171' : '#60a5fa' }}>야간 {nightAvg ?? '--'}°C</span>
      </div>
    </div>
  )
}

// ─── SizeBadge ───────────────────────────────────────────────────────────────
function SizeBadge({ w, h }) {
  return (
    <span className="widget__size-badge" title="현재 그리드 크기">
      {w} × {h}
    </span>
  )
}

// ─── Widget (root) ───────────────────────────────────────────────────────────
export default function Widget({
  id, config, kpiSlot, kpiSlot2, editMode, onRemove,
  gridSize, candidate, extraSlots, onTitleChange, defaultTitle,
  actuatorSlots, allAvailableIds, allCandidates, onConfigChange,
  kpiSlots = undefined, zoneId = null,
}) {
  if (!config) return null

  // 임계값 상태 → 배경 레벨
  // chart-main: 가이드라인 이탈(OUT_OF_RANGE)까지 포함
  // computed 등 나머지: 하드웨어·연결 오류만 반영 (입력 KPI의 이탈 상태는 전파하지 않음)
  const ds = kpiSlot?.dataStatus
  const statusLevel = config.type === 'chart-main'
    ? (ds === 'STALE_CRIT' || ds === 'SENSOR_FAULT' ? 'crit'
      : ds === 'STALE_WARN'    ? 'warn'
      : ds === 'OUT_OF_RANGE'  ? 'oor'
      : ds === 'SENSOR_LOST'   ? 'lost'
      : null)
    : (ds === 'STALE_CRIT' || ds === 'SENSOR_FAULT' ? 'crit'
      : ds === 'SENSOR_LOST'   ? 'lost'
      : null)

  // 타이틀 인라인 편집
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle]         = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (isEditingTitle) inputRef.current?.select()
  }, [isEditingTitle])

  const startEdit = () => {
    if (!editMode) return
    setDraftTitle(config.title)
    setIsEditingTitle(true)
  }

  const saveTitle = () => {
    const trimmed = draftTitle.trim()
    onTitleChange?.(trimmed || defaultTitle || config.title)
    setIsEditingTitle(false)
  }

  const handleTitleKey = (e) => {
    if (e.key === 'Enter') saveTitle()
    if (e.key === 'Escape') setIsEditingTitle(false)
  }

  return (
    <div
      className={`widget${editMode ? ' widget--edit' : ''}${statusLevel ? ` widget--${statusLevel}` : ''}`}
    >
      {/* 헤더 */}
      <div className="widget__header">
        {editMode && (
          <span className="widget__drag-handle" title="드래그하여 이동">
            <GripHorizontal size={14} />
          </span>
        )}

        {isEditingTitle ? (
          <input
            ref={inputRef}
            className="widget__title-input"
            value={draftTitle}
            onChange={e => setDraftTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={handleTitleKey}
          />
        ) : (
          <span
            className={`widget__title ${editMode ? 'widget__title--editable' : ''}`}
            onClick={startEdit}
            title={editMode ? '클릭하여 이름 수정' : undefined}
          >
            {config.title}
            {editMode && <Pencil size={10} className="widget__title-pencil" />}
          </span>
        )}

        {editMode && gridSize && <SizeBadge w={gridSize.w} h={gridSize.h} />}
        {editMode && (
          <button className="widget__remove" onClick={onRemove} title="위젯 제거">
            <X size={14} />
          </button>
        )}
      </div>

      {/* 바디 */}
      <div className="widget__body">
        {config.type === 'chart-main' && (
          <ChartMainWidget
            config={config}
            kpiSlot={kpiSlot}
            candidate={candidate}
            gridSize={gridSize}
            extraSlots={extraSlots}
          />
        )}
        {config.type === 'stat' && (
          <StatWidget
            config={config}
            kpiSlot={kpiSlot}
            candidate={candidate}
            gridSize={gridSize}
          />
        )}
        {config.type === 'chart' && (
          <MultiLineChartWidget
            config={config}
            kpiSlot={kpiSlot}
            extraSlots={extraSlots}
            candidate={candidate}
            allCandidates={allCandidates}
            allAvailableIds={allAvailableIds}
            onConfigChange={onConfigChange}
          />
        )}
        {config.type === 'computed' && (
          <ComputedWidget
            config={config}
            kpiSlot={kpiSlot}
            kpiSlot2={kpiSlot2}
            gridSize={gridSize}
          />
        )}
        {config.type === 'gauge-set' && (
          <GaugeSetWidget
            config={config}
            actuatorSlots={actuatorSlots}
            allAvailableIds={allAvailableIds}
          />
        )}
        {config.type === 'avg-temp' && (
          <AvgTempWidget
            config={config}
            kpiSlots={kpiSlots}
            zoneId={zoneId}
            gridSize={gridSize}
          />
        )}
        {config.type === 'status-panel' && (
          <StatusPanelWidget
            config={config}
            actuatorSlots={actuatorSlots}
            allAvailableIds={allAvailableIds}
          />
        )}
      </div>
    </div>
  )
}
