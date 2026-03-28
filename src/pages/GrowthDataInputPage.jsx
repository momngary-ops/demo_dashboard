import { useState } from 'react'
import { CROP_SCHEMA, loadFarmConfig } from '../constants/farmSchema'
import AdminPasswordModal from '../components/AdminPasswordModal'
import './GrowthDataInputPage.css'

const STORAGE_KEY    = 'growth-input:records'
const CURRENT_AUTHOR = '신연준 총괄'   // 추후 auth context 교체

// ─── CSV 헬퍼 ─────────────────────────────────────────────────────────────────

function escapeCsv(val) {
  const s = String(val ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s
}

function downloadCsv(filename, rows) {
  const csv  = rows.map(r => r.map(escapeCsv).join(',')).join('\r\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

// ─── localStorage 헬퍼 ───────────────────────────────────────────────────────

function loadRecords() {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : [] }
  catch { return [] }
}
function saveRecords(records) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)) } catch {}
}

// ─── 초기 formValues 생성 ────────────────────────────────────────────────────
// unitOptions가 있는 필드는 { int, dec, unit } 구조 사용

function makeInitialValues(cropId) {
  const schema = CROP_SCHEMA[cropId]
  if (!schema) return {}
  return Object.fromEntries(
    schema.fields.map(f => [
      f.id,
      { int: 0, dec: 0, unit: f.unitOptions ? f.unitOptions[0] : null },
    ])
  )
}

// ─── DecimalPicker 컴포넌트 ──────────────────────────────────────────────────

function DecimalPicker({ field, value, onChange }) {
  const { int, dec, unit } = value

  const handleIntChange = (e) => {
    const v = parseInt(e.target.value, 10)
    onChange({ ...value, int: isNaN(v) ? 0 : Math.max(0, v) })
  }
  const handleStep = (delta) => onChange({ ...value, int: Math.max(0, int + delta) })
  const finalValue = int + dec

  return (
    <div className="gdi-field">
      <span className="gdi-field__label">{field.label}</span>
      <div className="gdi-field__controls">
        <div className="gdi-int-spinner">
          <input
            type="number" className="gdi-int-spinner__input"
            min="0" value={int} onChange={handleIntChange}
          />
          <div className="gdi-int-spinner__btns">
            <button className="gdi-int-spinner__btn" onClick={() => handleStep(1)}>▲</button>
            <button className="gdi-int-spinner__btn" onClick={() => handleStep(-1)}>▼</button>
          </div>
        </div>

        {field.decimalOptions ? (
          <>
            <div className="gdi-dec-picker">
              {field.decimalOptions.map(d => (
                <button
                  key={d}
                  className={`gdi-dec-picker__btn ${dec === d ? 'gdi-dec-picker__btn--active' : ''}`}
                  onClick={() => onChange({ ...value, dec: d })}
                >
                  {d === 0 ? '.0' : `.${String(d).split('.')[1]}`}
                </button>
              ))}
            </div>
            <span className="gdi-field__preview">→ {finalValue.toFixed(2).replace(/\.?0+$/, '') || '0'}</span>
          </>
        ) : field.unitOptions ? (
          // 단위 선택 드롭다운 (예: 관부직경)
          <select
            className="gdi-unit-select"
            value={unit ?? field.unitOptions[0]}
            onChange={e => onChange({ ...value, unit: e.target.value })}
          >
            {field.unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        ) : (
          <span className="gdi-field__unit">{field.unit}</span>
        )}
      </div>
    </div>
  )
}

// ─── 메인 페이지 ─────────────────────────────────────────────────────────────

export default function GrowthDataInputPage() {
  const today = new Date().toISOString().slice(0, 10)

  const [farmConfig] = useState(loadFarmConfig)
  const zones = farmConfig.zones

  // 농장에 등록된 대표작물 + Sub작물 목록 (스키마에 존재하는 것만)
  const availableCrops = [farmConfig.cropId, farmConfig.subCropId]
    .filter(Boolean)
    .filter(id => CROP_SCHEMA[id])

  const [date,       setDate]       = useState(today)
  const [zoneId,     setZoneId]     = useState(() => zones[0]?.id ?? '')
  const [cropId,     setCropId]     = useState(() => availableCrops[0] ?? 'tomato-mature')
  const [formValues, setFormValues] = useState(() => makeInitialValues(availableCrops[0] ?? 'tomato-mature'))
  const [records,    setRecords]    = useState(loadRecords)

  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo,   setFilterTo]   = useState('')
  const [filterZone, setFilterZone] = useState('전체')

  const [pendingDeleteId, setPendingDeleteId] = useState(null)

  const schema    = CROP_SCHEMA[cropId] ?? Object.values(CROP_SCHEMA)[0]
  const zoneLabel = (id) => zones.find(z => z.id === id)?.label ?? id

  const handleCropChange = (newId) => {
    setCropId(newId)
    setFormValues(makeInitialValues(newId))
  }

  const handleFieldChange = (fieldId, newValue) => {
    setFormValues(prev => ({ ...prev, [fieldId]: newValue }))
  }

  const handleSave = () => {
    const values = Object.fromEntries(
      schema.fields.map(f => {
        const { int, dec } = formValues[f.id] ?? { int: 0, dec: 0 }
        return [f.id, int + dec]
      })
    )
    // 단위 선택이 있는 필드의 선택된 단위 저장
    const valueUnits = Object.fromEntries(
      schema.fields
        .filter(f => f.unitOptions)
        .map(f => [f.id, formValues[f.id]?.unit ?? f.unitOptions[0]])
    )
    const record = {
      id: String(Date.now()),
      date, zoneId, cropId,
      author: CURRENT_AUTHOR,
      values,
      ...(Object.keys(valueUnits).length > 0 && { valueUnits }),
      createdAt: new Date().toISOString(),
    }
    const next = [record, ...records]
    setRecords(next); saveRecords(next)
  }

  const handleReset         = () => setFormValues(makeInitialValues(cropId))
  const handleDeleteConfirm = () => {
    const next = records.filter(r => r.id !== pendingDeleteId)
    setRecords(next); saveRecords(next)
    setPendingDeleteId(null)
  }

  // 셀 값 포맷 (숫자 + 선택 단위)
  const fmtCell = (r, f) => {
    const v = r.values?.[f.id]
    if (v == null) return '-'
    const num  = String(v).replace(/\.?0+$/, '') || '0'
    const unit = f.unitOptions ? (r.valueUnits?.[f.id] ?? f.unitOptions[0]) : ''
    return num + unit
  }

  const filtered = records
    .filter(r => r.cropId === cropId)
    .filter(r => !filterFrom || r.date >= filterFrom)
    .filter(r => !filterTo   || r.date <= filterTo)
    .filter(r => filterZone === '전체' || r.zoneId === filterZone)

  const handleExport = () => {
    const headers = ['날짜', '구역', '입력자', ...schema.fields.map(f => f.label)]
    const rows = filtered.map(r => [
      r.date, zoneLabel(r.zoneId), r.author ?? '',
      ...schema.fields.map(f => fmtCell(r, f)),
    ])
    const zoneStr = filterZone === '전체' ? 'ALL' : zoneLabel(filterZone)
    const filename = `생육데이터_${schema.label}_${filterFrom || 'ALL'}_${filterTo || 'ALL'}_${zoneStr}.csv`
    downloadCsv(filename, [headers, ...rows])
  }

  const pendingRecord = pendingDeleteId ? records.find(r => r.id === pendingDeleteId) : null

  return (
    <div className="gdi">
      {pendingDeleteId && (
        <AdminPasswordModal
          title="레코드 삭제"
          description={pendingRecord
            ? `${pendingRecord.date} / ${zoneLabel(pendingRecord.zoneId)} 데이터를 영구 삭제합니다.`
            : '이 생육 데이터 레코드를 영구 삭제합니다.'}
          confirmLabel="삭제 확인"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
      {/* 툴바 */}
      <div className="gdi__toolbar">
        <span className="gdi__title">생육데이터 입력</span>
      </div>

      {/* 메타데이터 헤더 */}
      <div className="gdi__meta">
        <label className="gdi-meta__item">
          <span className="gdi-meta__label">날짜</span>
          <input type="date" className="gdi-meta__input" value={date}
            onChange={e => setDate(e.target.value)} />
        </label>
        <label className="gdi-meta__item">
          <span className="gdi-meta__label">구역</span>
          <select className="gdi-meta__input" value={zoneId}
            onChange={e => setZoneId(e.target.value)}>
            {zones.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
          </select>
        </label>
        <label className="gdi-meta__item">
          <span className="gdi-meta__label">작물</span>
          {availableCrops.length > 1 ? (
            <select className="gdi-meta__input" value={cropId}
              onChange={e => handleCropChange(e.target.value)}>
              {availableCrops.map(id => (
                <option key={id} value={id}>{CROP_SCHEMA[id].label}</option>
              ))}
            </select>
          ) : (
            <span className="gdi-meta__readonly">{schema.label}</span>
          )}
        </label>
        <div className="gdi-meta__item">
          <span className="gdi-meta__label">농장</span>
          <span className="gdi-meta__readonly">{farmConfig.farmName} ({farmConfig.hectares}ha)</span>
        </div>
      </div>

      {/* 입력 폼 */}
      <div className="gdi__form">
        <div className="gdi-fields">
          {schema.fields.map(field => (
            <DecimalPicker
              key={`${cropId}-${field.id}`}
              field={field}
              value={formValues[field.id] ?? { int: 0, dec: 0, unit: field.unitOptions?.[0] ?? null }}
              onChange={val => handleFieldChange(field.id, val)}
            />
          ))}
        </div>
        <div className="gdi__form-actions">
          <button className="toolbar-btn toolbar-btn--primary" onClick={handleSave}>저장</button>
          <button className="toolbar-btn" onClick={handleReset}>초기화</button>
        </div>
      </div>

      {/* 입력 내역 테이블 */}
      <div className="gdi__history">
        <div className="gdi__filter-bar">
          <span className="gdi__history-title">입력 내역</span>
          <div className="gdi-filter__group">
            <span className="gdi-filter__label">기간</span>
            <input type="date" className="gdi-meta__input" value={filterFrom}
              onChange={e => setFilterFrom(e.target.value)} />
            <span className="gdi-filter__sep">~</span>
            <input type="date" className="gdi-meta__input" value={filterTo}
              onChange={e => setFilterTo(e.target.value)} />
          </div>
          <div className="gdi-filter__group">
            <span className="gdi-filter__label">구역</span>
            <select className="gdi-meta__input" value={filterZone}
              onChange={e => setFilterZone(e.target.value)}>
              <option value="전체">전체</option>
              {zones.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
            </select>
          </div>
          <button className="toolbar-btn"
            onClick={() => { setFilterFrom(''); setFilterTo(''); setFilterZone('전체') }}>
            초기화
          </button>
          <button className="toolbar-btn toolbar-btn--export"
            onClick={handleExport} disabled={filtered.length === 0}>
            내보내기 ({filtered.length}건)
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="gdi__history-empty">조건에 맞는 내역이 없습니다.</div>
        ) : (
          <div className="gdi__table-wrap">
            <table className="gdi-table">
              <thead>
                <tr>
                  <th>날짜</th><th>구역</th><th>입력자</th>
                  {schema.fields.map(f => <th key={f.id}>{f.label}</th>)}
                  <th>삭제</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td>{zoneLabel(r.zoneId)}</td>
                    <td>{r.author ?? '-'}</td>
                    {schema.fields.map(f => <td key={f.id}>{fmtCell(r, f)}</td>)}
                    <td>
                      <button className="gdi-table__del-btn" onClick={() => setPendingDeleteId(r.id)}>
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
