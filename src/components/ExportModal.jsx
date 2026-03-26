import { useState, useEffect } from 'react'
import { loadFarmConfig } from '../constants/farmSchema'
import './AdminPasswordModal.css'
import './ExportModal.css'

const FIELD_KO = {
  xintemp1: '내부 온도', xinhum1: '내부 습도', xco2: 'CO₂ 농도',
  xinsunvol: '내부 일사량', xinsunadd: '누적 일사량', xventtemp1: '환기 온도',
  xheattemp1: '난방 온도', xhumlack: '수분부족분', xabhum: '절대 습도',
  xdhum: '이슬점', xgndtemp: '지온', xwinddirec: '외부 풍향',
  xwindsp: '외부 풍속', xsunvol: '외부 일사량', xouttemp: '외부 온도',
  xsupplytemp1: '난방 공급온도', xreturntemp1: '난방 회수온도', xco2set: 'CO₂ 설정값',
  now_ec: '급액 EC', now_ph: '급액 pH', water_con: '함수율',
  medium_ec: '배지 EC', medium_temp: '배지 온도', pi_ec: '배액 EC',
}

function toLocalDateStr(date) {
  return date.toISOString().slice(0, 10)
}

export default function ExportModal({ onClose }) {
  const farmConfig = loadFarmConfig()
  const zones = farmConfig.zones ?? []

  const today = new Date()
  const weekAgo = new Date(today)
  weekAgo.setDate(today.getDate() - 7)

  const [zoneId,   setZoneId]   = useState('')
  const [field,    setField]    = useState('')
  const [fromDate, setFromDate] = useState(toLocalDateStr(weekAgo))
  const [toDate,   setToDate]   = useState(toLocalDateStr(today))
  const [fields,   setFields]   = useState([])

  useEffect(() => {
    const url = zoneId
      ? `/api/logs/fields?zone_id=${encodeURIComponent(zoneId)}`
      : '/api/logs/fields'
    fetch(url)
      .then(r => r.json())
      .then(list => { setFields(list); setField('') })
      .catch(() => setFields([]))
  }, [zoneId])

  function buildUrl() {
    const params = new URLSearchParams()
    if (zoneId)   params.set('zone_id', zoneId)
    if (field)    params.set('field',   field)
    if (fromDate) params.set('from_ts', `${fromDate}T00:00:00Z`)
    if (toDate)   params.set('to_ts',   `${toDate}T23:59:59Z`)
    return `/api/logs/download?${params.toString()}`
  }

  return (
    <div className="adm-backdrop" onClick={onClose}>
      <div className="adm-modal exp-modal" onClick={e => e.stopPropagation()}>
        <p className="adm-modal__title">환경 데이터 내보내기</p>

        <div className="exp-row">
          <label className="exp-label">구역</label>
          <select className="exp-select" value={zoneId} onChange={e => setZoneId(e.target.value)}>
            <option value="">전체 구역</option>
            {zones.map(z => (
              <option key={z.id} value={z.id}>{z.label ?? z.id}</option>
            ))}
          </select>
        </div>

        <div className="exp-row">
          <label className="exp-label">항목</label>
          <select className="exp-select" value={field} onChange={e => setField(e.target.value)}>
            <option value="">전체 항목</option>
            {fields.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <div className="exp-row">
          <label className="exp-label">기간</label>
          <div className="exp-date-wrap">
            <input
              type="date" className="exp-date"
              value={fromDate} onChange={e => setFromDate(e.target.value)}
            />
            <span className="exp-date-sep">~</span>
            <input
              type="date" className="exp-date"
              value={toDate} onChange={e => setToDate(e.target.value)}
            />
          </div>
        </div>

        <div className="adm-modal__actions">
          <button className="adm-modal__btn adm-modal__btn--cancel" onClick={onClose}>
            취소
          </button>
          <a
            className="adm-modal__btn exp-btn--download"
            href={buildUrl()}
            download
            onClick={onClose}
          >
            ↓ CSV 다운로드
          </a>
        </div>
      </div>
    </div>
  )
}
