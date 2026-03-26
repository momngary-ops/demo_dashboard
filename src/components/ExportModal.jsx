import { useState, useEffect } from 'react'
import { loadFarmConfig } from '../constants/farmSchema'
import './AdminPasswordModal.css'
import './ExportModal.css'

const FIELD_KO = {
  // 환경 센서
  xintemp1: '내부 온도', xinhum1: '내부 습도', xco2: 'CO₂ 농도',
  xinsunvol: '내부 일사량', xinsunadd: '누적 일사량', xventtemp1: '환기 온도',
  xheattemp1: '난방 온도', xhumlack: '수분부족분', xabhum: '절대 습도',
  xdhum: '이슬점', xgndtemp: '지온', xwinddirec: '외부 풍향',
  xwindsp: '외부 풍속', xsunvol: '외부 일사량', xouttemp: '외부 온도',
  xsupplytemp1: '난방 공급온도', xreturntemp1: '난방 회수온도', xco2set: 'CO₂ 설정값',
  // 양액
  now_ec: '급액 EC', now_ph: '급액 pH', water_con: '함수율',
  medium_ec: '배지 EC', medium_temp: '배지 온도', pi_ec: '배액 EC',
  // 창 개도
  xwinvol1_1: '창1좌 개도', xwinvol1_2: '창1우 개도',
  xwinvol2_1: '창2좌 개도', xwinvol2_2: '창2우 개도',
  xwinvol3_1: '창3좌 개도', xwinvol3_2: '창3우 개도',
  xwinvol4_1: '창4좌 개도', xwinvol4_2: '창4우 개도',
  xwinvol5_1: '창5좌 개도', xwinvol5_2: '창5우 개도',
  xwinvol6_1: '창6좌 개도', xwinvol6_2: '창6우 개도',
  // 커튼·밸브 개도
  xcur1vol: '커튼1 개도', xcur2vol: '커튼2 개도', xcur3vol: '커튼3 개도',
  xcur4vol: '커튼4 개도', xcur5vol: '커튼5 개도',
  x3way1vol: '3Way밸브1 개도', x3way2vol: '3Way밸브2 개도',
  // 창 자수동
  xwin1auto: '창1좌 자수동', xwin1auto2: '창1우 자수동',
  xwin2auto: '창2좌 자수동', xwin2auto2: '창2우 자수동',
  xwin3auto: '창3좌 자수동', xwin3auto2: '창3우 자수동',
  xwin4auto: '창4좌 자수동', xwin4auto2: '창4우 자수동',
  xwin5auto: '창5좌 자수동', xwin5auto2: '창5우 자수동',
  xwin6auto: '창6좌 자수동', xwin6auto2: '창6우 자수동',
  // 커튼 자수동
  xcur1auto: '커튼1 자수동', xcur2auto: '커튼2 자수동', xcur3auto: '커튼3 자수동',
  xcur4auto: '커튼4 자수동', xcur5auto: '커튼5 자수동',
  // 장치
  xco2auto: 'CO₂ 자수동', xco2run: 'CO₂ 작동',
  xlightauto: '보광등 자수동', xlightrun: '보광등 작동',
  xhunauto: '훈증기 자수동', xhunrun: '훈증기 작동',
  xboauto: '보일러 자수동', xborun: '보일러 작동',
  xpumpauto: '순환펌프 자수동', xpumprun1: '순환펌프1 작동', xpumprun2: '순환펌프2 작동',
  // 보조기기
  xass1auto: '보조기기1 자수동', xass1run: '보조기기1 작동',
  xass2auto: '보조기기2 자수동', xass2run: '보조기기2 작동',
  xass3auto: '보조기기3 자수동', xass3run: '보조기기3 작동',
  xass4auto: '보조기기4 자수동', xass4run: '보조기기4 작동',
  xass5auto: '보조기기5 자수동', xass5run: '보조기기5 작동',
  xass6auto: '보조기기6 자수동', xass6run: '보조기기6 작동',
  // 냉난방기
  xheatandcool1auto: '냉난방기1 자수동', xheatandcool1run: '냉난방기1 작동',
  xheatandcool2auto: '냉난방기2 자수동', xheatandcool2run: '냉난방기2 작동',
  xheatandcool3auto: '냉난방기3 자수동', xheatandcool3run: '냉난방기3 작동',
  xheatandcool4auto: '냉난방기4 자수동', xheatandcool4run: '냉난방기4 작동',
  xheatandcool5auto: '냉난방기5 자수동', xheatandcool5run: '냉난방기5 작동',
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
              <option key={f} value={f}>{FIELD_KO[f.toLowerCase()] ?? f}</option>
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
