import { useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { useWeatherPolling } from '../../hooks/useWeatherPolling'
import { useKpiPolling, prefetchZoneData } from '../../hooks/useKpiPolling'
import { DEFAULT_SLOT_CONFIGS } from '../../constants/kpiCandidates'
import { loadFarmConfig } from '../../constants/farmSchema'

const EXT_TEMP_CONFIG = [{ id: 'xouttemp', title: '외부 온도', unit: '°C', yMin: -10, yMax: 45 }]
import WeatherBackground    from './WeatherBackground'
import ZoneTabs             from './ZoneTabs'
import FixedMetricCard      from './FixedMetricCard'
import VariableMetricCard   from './VariableMetricCard'
import KpiSelectorModal     from './KpiSelectorModal'
import './TopBanner.css'

function fmtNow() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `Update ${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const ERROR_STATUSES = new Set(['NULL_DATA', 'SENSOR_FAULT', 'API_TIMEOUT', 'NO_API', 'LOADING'])

function fmtVal(value) {
  if (value === null || value === undefined) return '--'
  if (value >= 10000) return value.toLocaleString()
  if (Number.isInteger(value)) return String(value)
  return Number(value).toFixed(1)
}

const STORAGE_KEY_BANNER_SLOTS = 'topbanner:slots'

export default function TopBanner({ compact = false, onToggleCompact }) {
  const [farmConfig]   = useState(loadFarmConfig)
  const [activeZone,   setActiveZone]   = useState(0)
  const [slotConfigs,  setSlotConfigs]  = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_BANNER_SLOTS)
      if (raw) return JSON.parse(raw)
    } catch { /* 무시 */ }
    return DEFAULT_SLOT_CONFIGS
  })
  const [pickerOpen,   setPickerOpen]   = useState(false)

  const activeZoneId = farmConfig.zones[activeZone]?.id ?? null

  const weather      = useWeatherPolling()
  const kpiSlots     = useKpiPolling(slotConfigs,      activeZoneId)
  const extTempSlots = useKpiPolling(EXT_TEMP_CONFIG,  activeZoneId)
  const extTemp      = extTempSlots[0]

  // compact 바에 표시할 KPI 슬롯 (정상 데이터 있는 것만)
  const visibleSlots = kpiSlots.filter(s => !ERROR_STATUSES.has(s.dataStatus))

  return (
    <div className="topbanner">
      {/* 날씨 배경 */}
      <WeatherBackground condition={weather.condition} />

      <div className="topbanner__content">
        {/* 구역 탭 행 */}
        <div className="topbanner__zone-row">
          <ZoneTabs zones={farmConfig.zones} activeZone={activeZone} onZoneChange={setActiveZone} onZoneHover={prefetchZoneData} />
        </div>

        {/* 요약 바 — compact 상태일 때 표시 */}
        <div className={`topbanner__compact-bar ${compact ? 'topbanner__compact-bar--visible' : ''}`}>
          <span className="topbanner__compact-zone">
            {farmConfig.zones[activeZone]?.label ?? ''}
          </span>
          <div className="topbanner__compact-items">
            <span className="topbanner__compact-item">
              <span className="topbanner__compact-sep">//</span>
              <span className="topbanner__compact-label">외부온도</span>
              <span className="topbanner__compact-value">{fmtVal(extTemp.value)}°C</span>
            </span>
            {visibleSlots.map((slot, i) => (
              <span key={`${slot.id ?? 'null'}-${i}`} className="topbanner__compact-item">
                <span className="topbanner__compact-sep">//</span>
                <span className="topbanner__compact-label">{slot.title}</span>
                <span className="topbanner__compact-value">{fmtVal(slot.value)}{slot.unit}</span>
              </span>
            ))}
            <span className="topbanner__compact-sep">//</span>
          </div>
        </div>

        {/* 전체 컨텐츠 — compact 상태일 때 숨김 */}
        <div className={`topbanner__full ${compact ? 'topbanner__full--hidden' : ''}`}>
          {/* 타이틀 + 업데이트 + 항목변경 버튼 */}
          <div className="topbanner__info-row">
            <div className="topbanner__info-left">
              <span className="topbanner__farm-name">{farmConfig.farmName}</span>
              <div className="topbanner__zone-info">
                <span className="topbanner__zone-title">{farmConfig.zones[activeZone]?.label ?? ''}</span>
                <span className="topbanner__updated">{fmtNow()}</span>
              </div>
            </div>
            <button className="topbanner__kpi-btn" onClick={() => setPickerOpen(true)}>
              항목 추가/변경
            </button>
          </div>

          {/* 카드 행: 고정 1개 + 가변 5개 */}
          <div className="topbanner__cards">
            <FixedMetricCard value={extTemp.value} dataStatus={extTemp.dataStatus} />
            {kpiSlots.map((slot, i) => (
              <VariableMetricCard key={`${slot.id ?? 'null'}-${i}`} slot={slot} />
            ))}
          </div>
        </div>
      </div>

      {/* 하단 접기/펼치기 바 */}
      <button
        className="topbanner__collapse-bar"
        onClick={onToggleCompact}
        title={compact ? '상단바 펼치기' : '상단바 접기'}
      >
        {compact ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
      </button>

      {/* KPI 선택 모달 */}
      {pickerOpen && (
        <KpiSelectorModal
          slots={slotConfigs}
          kpiSlots={kpiSlots}
          onSlotsChange={(next) => {
            setSlotConfigs(next)
            try { localStorage.setItem(STORAGE_KEY_BANNER_SLOTS, JSON.stringify(next)) } catch { /* 무시 */ }
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
