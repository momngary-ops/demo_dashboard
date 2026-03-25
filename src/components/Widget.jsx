import { useState, useRef, useEffect } from 'react'
import { GripHorizontal, X, Pencil, Plus } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { GAUGE_SET_GROUPS, STATUS_PANEL_GROUPS } from '../constants/actuatorCandidates'
import './Widget.css'

const ERROR_STATUSES = new Set(['NULL_DATA', 'SENSOR_FAULT', 'API_TIMEOUT', 'NO_API', 'SENSOR_LOST'])

function fmt(v) {
  if (v === null || v === undefined) return '--'
  if (v >= 10000) return v.toLocaleString()
  if (Number.isInteger(v)) return String(v)
  return Number(v).toFixed(1)
}

// ─── SparklineSVG ────────────────────────────────────────────────────────────
// 색상은 CSS의 currentColor / var(--accent) 사용 — 임의 색상 prop 없음
function SparklineSVG({ data }) {
  if (!data || data.length < 2) return null

  const W = 200, H = 60, PAD = 6
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min
  const isFlat = range === 0
  const pts = data.length

  // flat 데이터: 수직 중앙 / 범위 있는 데이터: 정규화
  const toY = (v) => isFlat
    ? H / 2
    : PAD + (1 - (v - min) / range) * (H - PAD * 2)

  const points = data.map((v, i) => ({
    x: PAD + (i / (pts - 1)) * (W - PAD * 2),
    y: toY(v),
  }))

  // Catmull-Rom → Cubic Bezier (tension 0.3)
  const tension = 0.3
  let d = `M ${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]
    const cp1x = p1.x + (p2.x - p0.x) * tension
    const cp1y = p1.y + (p2.y - p0.y) * tension
    const cp2x = p2.x - (p3.x - p1.x) * tension
    const cp2y = p2.y - (p3.y - p1.y) * tension
    d += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`
  }

  const last = points[points.length - 1]
  const areaD = isFlat ? null
    : `${d} L ${last.x.toFixed(2)},${H} L ${points[0].x.toFixed(2)},${H} Z`

  return (
    <svg
      className="cm-sparkline__svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      overflow="hidden"
    >
      <defs>
        <linearGradient id="spk-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="var(--accent)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"    />
        </linearGradient>
      </defs>
      {/* 범위 있을 때만 min/max 점선 기준선 */}
      {!isFlat && <>
        <line x1={PAD} y1={PAD}     x2={W - PAD} y2={PAD}
              stroke="currentColor" strokeWidth="0.7" strokeDasharray="4 3" opacity="0.4" />
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD}
              stroke="currentColor" strokeWidth="0.7" strokeDasharray="4 3" opacity="0.4" />
      </>}
      {areaD && <path d={areaD} fill="url(#spk-grad)" />}
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" opacity="0.9"
            vectorEffect="non-scaling-stroke" />
      <circle cx={last.x} cy={last.y} r="3" fill="currentColor" opacity="0.95" />
    </svg>
  )
}

// 0°=북 기준 시계방향 8방위 변환
const COMPASS8 = ['북', '북동', '동', '남동', '남', '남서', '서', '북서']
function toCompass8(deg) {
  if (deg === null || deg === undefined) return '--'
  return COMPASS8[Math.round(((deg % 360) + 360) % 360 / 45) % 8]
}

// ─── ChartMainWidget ─────────────────────────────────────────────────────────
function ChartMainWidget({ config, kpiSlot, candidate, gridSize, extraSlots }) {
  const value  = kpiSlot?.value ?? null
  const status = kpiSlot?.dataStatus ?? 'LOADING'
  const data   = kpiSlot?.data ?? []
  const unit   = kpiSlot?.unit ?? config.unit ?? candidate?.unit ?? ''

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

  // 신호등 dot — 임계값 미설정 시 회색
  const signalColor = isCrit ? '#f87171' : isWarn ? '#fb923c' : '#3f607a'

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

  const valueColor = isCrit ? '#f87171' : isWarn ? '#fb923c' : 'var(--text-primary)'

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

      {/* 스파크라인 영역 — 하단 */}
      {!hideSpark && data.length >= 2 && (() => {
        const dMax = Math.max(...data)
        const dMin = Math.min(...data)
        const hasRange = dMax !== dMin
        return (
          <div className="cm-spark-area">
            <SparklineSVG data={data} />
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
function ComputedWidget({ config, kpiSlot, kpiSlot2, gridSize }) {
  const val1   = kpiSlot?.value  ?? null
  const val2   = kpiSlot2?.value ?? null
  const unit   = config.unit ?? '°C'

  const computed = (val1 !== null && val2 !== null)
    ? +(val1 - val2).toFixed(1) : null

  const status1   = kpiSlot?.dataStatus  ?? 'LOADING'
  const status2   = kpiSlot2?.dataStatus ?? 'LOADING'
  const isLoading = status1 === 'LOADING' || status2 === 'LOADING'
  const isError   = (ERROR_STATUSES.has(status1) && status1 !== 'LOADING') ||
                    (ERROR_STATUSES.has(status2) && status2 !== 'LOADING')
  const isCompact = gridSize && (gridSize.w < 3 || gridSize.h < 2)

  // 차이 스파크라인 — 두 배열 원소별 뺄셈
  const data1 = kpiSlot?.data  ?? []
  const data2 = kpiSlot2?.data ?? []
  const sparkData = data1.length >= 2 && data2.length >= 2
    ? data1.map((v, i) => +(v - (data2[i] ?? val2 ?? 0)).toFixed(1))
    : []

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
        <div className="cm-secondary-row">
          <span className="cm-sec-label">난방설정 / 외부온도</span>
          <span className="cm-sec-val">{fmt(val1)} / {fmt(val2)} {unit}</span>
        </div>
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

  const valueColor = isCrit ? '#f87171' : isWarn ? '#fb923c' : 'var(--text-primary)'

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
}) {
  if (!config) return null

  // 임계값 상태 → 배경 레벨
  const statusLevel = kpiSlot?.dataStatus === 'STALE_CRIT' ? 'crit'
    : kpiSlot?.dataStatus === 'STALE_WARN' ? 'warn'
    : null

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
