import { useState } from 'react'
import { useWeatherPolling } from '../../hooks/useWeatherPolling'
import { useKpiPolling }     from '../../hooks/useKpiPolling'
import { DEFAULT_SLOT_CONFIGS } from '../../constants/kpiCandidates'
import { MOCK_EXTERNAL_TEMP }   from '../../mocks/kpiMockData'
import WeatherBackground    from './WeatherBackground'
import ZoneTabs             from './ZoneTabs'
import FixedMetricCard      from './FixedMetricCard'
import VariableMetricCard   from './VariableMetricCard'
import KpiSelectorModal     from './KpiSelectorModal'
import './TopBanner.css'

const ZONE_NAMES  = ['1구역', '2구역', '3구역', '4구역']
const FARM_NAME   = '태안팜2ha'   // TODO: 설정/API로 교체 (README 참고)

function fmtNow() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `Update ${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TopBanner() {
  const [activeZone,   setActiveZone]   = useState(0)
  const [slotConfigs,  setSlotConfigs]  = useState(DEFAULT_SLOT_CONFIGS)
  const [pickerOpen,   setPickerOpen]   = useState(false)

  const weather  = useWeatherPolling()
  const kpiSlots = useKpiPolling(slotConfigs)

  const extTemp = MOCK_EXTERNAL_TEMP  // 외부 온도는 고정 mock

  return (
    <div className="topbanner">
      {/* 날씨 배경 */}
      <WeatherBackground condition={weather.condition} />

      <div className="topbanner__content">
        {/* 구역 탭 행 */}
        <div className="topbanner__zone-row">
          <ZoneTabs activeZone={activeZone} onZoneChange={setActiveZone} />
        </div>

        {/* 타이틀 + 업데이트 + 항목변경 버튼 */}
        <div className="topbanner__info-row">
          <div className="topbanner__info-left">
            <span className="topbanner__farm-name">{FARM_NAME}</span>
            <div className="topbanner__zone-info">
              <span className="topbanner__zone-title">{ZONE_NAMES[activeZone]}</span>
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

      {/* KPI 선택 모달 */}
      {pickerOpen && (
        <KpiSelectorModal
          slots={slotConfigs}
          onSlotsChange={setSlotConfigs}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
