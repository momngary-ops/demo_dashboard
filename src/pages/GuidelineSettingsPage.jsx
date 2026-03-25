import { useState, useEffect, useMemo } from 'react'
import { useGuideline } from '../contexts/GuidelineContext'
import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid,
} from 'recharts'
import './GuidelineSettingsPage.css'

const FIELDS = [
  { key: 'temp', label: '온도',  minKey: 'temp_min', maxKey: 'temp_max', unit: '°C',  color: '#f87171' },
  { key: 'hum',  label: '습도',  minKey: 'hum_min',  maxKey: 'hum_max',  unit: '%',   color: '#60a5fa' },
  { key: 'co2',  label: 'CO₂',  minKey: 'co2',      maxKey: 'co2',      unit: 'ppm', color: '#4ade80', single: true },
]

const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

export default function GuidelineSettingsPage() {
  const { guidelines: ctxGl, alertConfig: ctxAc, fetchGuidelines } = useGuideline() ?? {}

  // 로컬 편집 상태
  const [localGl,  setLocalGl]  = useState(null)
  const [localAc,  setLocalAc]  = useState(null)
  const [tab,      setTab]      = useState('temp')   // 'temp' | 'hum' | 'co2'
  const [month,    setMonth]    = useState(1)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)

  // 컨텍스트 데이터로 초기화
  useEffect(() => {
    if (ctxGl)  setLocalGl(JSON.parse(JSON.stringify(ctxGl)))
  }, [ctxGl])
  useEffect(() => {
    if (ctxAc)  setLocalAc(JSON.parse(JSON.stringify(ctxAc)))
  }, [ctxAc])

  const field = FIELDS.find(f => f.key === tab)

  // 현재 월/탭 24시간 행
  const rows = useMemo(() =>
    localGl?.[String(month)] ?? [],
    [localGl, month]
  )

  // Recharts 데이터 (bandArea: min~max)
  const chartData = useMemo(() =>
    rows.map(r => ({
      hour: `${String(r.hour).padStart(2,'0')}:00`,
      band: field.single
        ? [r.co2, r.co2]
        : [r[field.minKey], r[field.maxKey]],
      min:  field.single ? r.co2 : r[field.minKey],
      max:  field.single ? r.co2 : r[field.maxKey],
    })),
    [rows, field]
  )

  function updateCell(hour, key, raw) {
    const num = parseFloat(raw)
    if (isNaN(num)) return
    setLocalGl(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const row  = next[String(month)].find(r => r.hour === hour)
      if (row) row[key] = num
      return next
    })
  }

  function updateAlert(field, key, value) {
    setLocalAc(prev => ({
      ...prev,
      [field]: { ...prev[field], [key]: value },
    }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await fetch('/api/guidelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: localGl, alert_config: localAc }),
      })
      await fetchGuidelines?.()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      alert('저장 실패: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    if (!confirm('기본값으로 초기화하시겠습니까?')) return
    await fetch('/api/guidelines/reset', { method: 'POST' })
    await fetchGuidelines?.()
  }

  if (!localGl || !localAc) return <div className="gl-page"><p>로딩 중...</p></div>

  return (
    <div className="gl-page">
      <div className="gl-header">
        <h2 className="gl-title">가이드라인 설정</h2>
        <div className="gl-header-actions">
          <button className="gl-btn gl-btn--outline" onClick={handleReset}>기본값으로 초기화</button>
          <button className="gl-btn gl-btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : saved ? '저장됨 ✓' : '저장'}
          </button>
        </div>
      </div>

      {/* 항목 탭 */}
      <div className="gl-tabs">
        {FIELDS.map(f => (
          <button
            key={f.key}
            className={`gl-tab ${tab === f.key ? 'gl-tab--active' : ''}`}
            onClick={() => setTab(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 월 탭 */}
      <div className="gl-month-tabs">
        {MONTHS.map((m, i) => (
          <button
            key={i}
            className={`gl-month-tab ${month === i+1 ? 'gl-month-tab--active' : ''}`}
            onClick={() => setMonth(i+1)}
          >
            {m}
          </button>
        ))}
      </div>

      {/* 24시간 미리보기 차트 */}
      <div className="gl-chart-wrap">
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a3a4a" />
            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#8899aa' }} interval={3} />
            <YAxis tick={{ fontSize: 10, fill: '#8899aa' }} width={40} unit={` ${field.unit}`} />
            <Tooltip
              contentStyle={{ background: '#1a2a38', border: '1px solid #2a3a4a', fontSize: 12 }}
              labelStyle={{ color: '#ccc' }}
              itemStyle={{ color: field.color }}
            />
            {field.single ? (
              <Area type="monotone" dataKey="min" stroke={field.color} fill={field.color + '30'} strokeWidth={1.5} dot={false} name={field.label} />
            ) : (<>
              <Area type="monotone" dataKey="max" stroke={field.color} fill={field.color + '20'} strokeWidth={1.5} dot={false} name="max" />
              <Area type="monotone" dataKey="min" stroke={field.color + 'aa'} fill={field.color + '10'} strokeWidth={1} dot={false} name="min" />
            </>)}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 24시간 테이블 */}
      <div className="gl-table-wrap">
        <table className="gl-table">
          <thead>
            <tr>
              <th>시간</th>
              {field.single ? (
                <th>{field.label} ({field.unit})</th>
              ) : (<>
                <th>min ({field.unit})</th>
                <th>max ({field.unit})</th>
              </>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.hour}>
                <td>{String(r.hour).padStart(2,'0')}:00</td>
                {field.single ? (
                  <td>
                    <input
                      type="number" step="1" className="gl-input"
                      value={r.co2}
                      onChange={e => updateCell(r.hour, 'co2', e.target.value)}
                    />
                  </td>
                ) : (<>
                  <td>
                    <input
                      type="number" step="0.1" className="gl-input"
                      value={r[field.minKey]}
                      onChange={e => updateCell(r.hour, field.minKey, e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number" step="0.1" className="gl-input"
                      value={r[field.maxKey]}
                      onChange={e => updateCell(r.hour, field.maxKey, e.target.value)}
                    />
                  </td>
                </>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 알림 설정 */}
      <div className="gl-alert-section">
        <h3 className="gl-alert-title">알림 설정</h3>
        <div className="gl-alert-grid">
          {[
            { key: 'temp',     label: '온도',  hasDev: false },
            { key: 'humidity', label: '습도',  hasDev: false },
            { key: 'co2',      label: 'CO₂',  hasDev: true  },
          ].map(({ key, label, hasDev }) => (
            <div key={key} className="gl-alert-row">
              <label className="gl-alert-label">
                <input
                  type="checkbox"
                  checked={localAc[key]?.enabled ?? true}
                  onChange={e => updateAlert(key, 'enabled', e.target.checked)}
                />
                {label}
              </label>
              <span className="gl-alert-field">
                딜레이
                <input
                  type="number" min="1" max="120" className="gl-input gl-input--sm"
                  value={localAc[key]?.delay_min ?? 10}
                  onChange={e => updateAlert(key, 'delay_min', +e.target.value)}
                />
                분
              </span>
              {hasDev && (
                <span className="gl-alert-field">
                  이탈율
                  <input
                    type="number" min="0" max="100" step="1" className="gl-input gl-input--sm"
                    value={localAc[key]?.deviation_pct ?? 10}
                    onChange={e => updateAlert(key, 'deviation_pct', +e.target.value)}
                  />
                  %
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
