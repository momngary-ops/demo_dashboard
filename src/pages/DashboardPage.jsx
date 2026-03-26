/**
 * [Dashboard] 페이지 — 로그인 후 랜딩 & 농장 공통 대시보드
 *
 * ■ 확정 정책
 *   1. 사이드바 [Dashboard] 클릭 또는 로그인 직후 이 페이지로 랜딩한다. (고정)
 *   2. 이 페이지는 해당 농장(권한그룹)의 모든 구성원에게 공통으로 표시된다.
 *   3. 레이아웃·위젯 편집·저장은 관리자(role === 'admin' | groupOwner)만 가능하다.
 *      비관리자에게는 편집 툴바(레이아웃 편집 버튼·위젯 추가 버튼)를 노출하지 않는다.
 *   4. 관리자가 저장한 Dashboard 설정이 동일 권한그룹 전체 구성원에게 공통 적용된다.
 *
 * ■ 미구현 (API 연동 시 처리)
 *   - 로그인 사용자의 farmId / groupId / role 조회 (현재: isAdmin 로컬 mock)
 *   - 그룹별 Dashboard 레이아웃·위젯 설정 서버 저장 및 불러오기
 *     (현재: DEFAULT_LAYOUT / DEFAULT_WIDGETS 클라이언트 고정값)
 *   - 구성원별 개인 커스터마이징 필요 시 별도 [개인 대시보드] 페이지로 분리
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import AdminPasswordModal from '../components/AdminPasswordModal'
import ExportModal from '../components/ExportModal'
import { loadFarmConfig } from '../constants/farmSchema'
import { useKpiPolling, clearZoneCache } from '../hooks/useKpiPolling'
import { useAlertNotifier } from '../hooks/useAlertNotifier'
import { KPI_CANDIDATES } from '../constants/kpiCandidates'
import { GAUGE_SET_GROUPS, STATUS_PANEL_GROUPS } from '../constants/actuatorCandidates'
import { useCapabilities } from '../contexts/CapabilitiesContext'
import { Responsive as ResponsiveGridLayout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import Widget from '../components/Widget'
import WidgetPicker from '../components/WidgetPicker'
import TopBanner from '../components/TopBanner/TopBanner'
import { fetchSettings, saveSettings } from '../api/settingsApi'
import './DashboardPage.css'

// 반응형 브레이크포인트 & 컬럼 수
const BREAKPOINTS     = { xl: 1600, lg: 1200, md: 900, sm: 600, xs: 0 }
const RESPONSIVE_COLS = { xl: 20,   lg: 16,   md: 10,  sm: 6,  xs: 4 }
const ROW_H  = 80
const MARGIN = [12, 12]
const PAD    = [16, 16]

// ─── localStorage 키 — App.jsx(초기화)에서도 동일 키를 사용한다 ───────
export const STORAGE_KEY_LAYOUTS = 'dashboard:layouts'
export const STORAGE_KEY_LAYOUT  = 'dashboard:layout'   // legacy (마이그레이션용)
export const STORAGE_KEY_WIDGETS = 'dashboard:widgets'

function saveToStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* quota 초과 등 무시 */ }
}

// 기본 xl(20컬럼) 레이아웃에서 각 브레이크포인트 레이아웃 자동 생성
function makeLayouts(base) {
  const xl = base
  const lg = base.map(l => ({
    ...l,
    x: Math.round(l.x * 16 / 20),
    w: Math.max(2, Math.round(l.w * 16 / 20)),
  }))
  const md = base.map((l, i) => ({
    ...l, x: (i % 2) * 5, y: Math.floor(i / 2) * l.h, w: 5,
  }))
  const sm = base.map((l, i) => ({
    ...l, x: (i % 2) * 3, y: Math.floor(i / 2) * l.h, w: 3,
  }))
  const xs = base.map((l, i) => ({
    ...l, x: 0, y: i * l.h, w: 4,
  }))
  return { xl, lg, md, sm, xs }
}

const DEFAULT_LAYOUT_BASE = [
  { i: 'w1', x: 0,  y: 0, w: 4, h: 3, minW: 2, minH: 2 },
  { i: 'w2', x: 4,  y: 0, w: 4, h: 3, minW: 2, minH: 2 },
  { i: 'w3', x: 8,  y: 0, w: 4, h: 3, minW: 2, minH: 2 },
  { i: 'w4', x: 12, y: 0, w: 4, h: 3, minW: 2, minH: 2 },
  { i: 'w5', x: 16, y: 0, w: 4, h: 3, minW: 2, minH: 2 },
]
const DEFAULT_LAYOUTS = makeLayouts(DEFAULT_LAYOUT_BASE)

function loadLayouts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LAYOUTS)
    if (raw) return JSON.parse(raw)
    // 레거시 단일 레이아웃 → 반응형 마이그레이션
    const legacy = localStorage.getItem(STORAGE_KEY_LAYOUT)
    if (legacy) return makeLayouts(JSON.parse(legacy))
  } catch { /* ignore */ }
  return DEFAULT_LAYOUTS
}

// 현재 컨테이너 폭에 맞는 컬럼 수 반환
function getCurrentCols(width) {
  for (const bp of ['xl', 'lg', 'md', 'sm']) {
    if (width >= BREAKPOINTS[bp]) return RESPONSIVE_COLS[bp]
  }
  return RESPONSIVE_COLS.xs
}

const DEFAULT_WIDGETS = {
  w1: { type: 'chart-main', title: '내부 온도', kpiId: 'xintemp1'  },
  w2: { type: 'chart-main', title: '내부 습도', kpiId: 'xinhum1'   },
  w3: { type: 'chart-main', title: 'CO₂ 농도', kpiId: 'xco2'      },
  w4: { type: 'chart-main', title: '급액 EC',   kpiId: 'now_ec'    },
  w5: { type: 'chart-main', title: '함수율',    kpiId: 'water_con' },
}

// B: 그리드 오버레이 — 컬럼·행 가이드선
function GridOverlay({ containerWidth }) {
  const cols    = getCurrentCols(containerWidth)
  const innerW  = containerWidth - PAD[0] * 2
  const cellW   = (innerW - MARGIN[0] * (cols - 1)) / cols
  const stepX   = cellW + MARGIN[0]
  const stepY   = ROW_H + MARGIN[1]
  const rowCount = 12

  const vLines = Array.from({ length: cols + 1 }, (_, i) => {
    const x = PAD[0] + i * stepX
    return <line key={`v${i}`} x1={x} y1="0" x2={x} y2="100%" />
  })

  const hLines = Array.from({ length: rowCount + 1 }, (_, i) => {
    const y = PAD[1] + i * stepY
    return <line key={`h${i}`} x1="0" y1={y} x2="100%" y2={y} />
  })

  return (
    <div className="grid-overlay" aria-hidden="true">
      <svg width="100%" height="100%">
        <defs>
          <style>{`
            .grid-overlay line {
              stroke: rgba(45,125,210,0.18);
              stroke-width: 1;
              stroke-dasharray: 4 4;
            }
          `}</style>
        </defs>
        {vLines}
        {hLines}
      </svg>
      {/* 컬럼 번호 */}
      {Array.from({ length: cols }, (_, i) => (
        <span
          key={i}
          className="grid-overlay__col-num"
          style={{ left: PAD[0] + i * stepX + cellW / 2 }}
        >
          {i + 1}
        </span>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  // TODO: 실제 연동 시 auth context에서 주입 — role === 'admin' || groupOwner
  const isAdmin = true

  // lazy initializer — 마운트 시 localStorage에서 불러오고, 없으면 기본값 사용
  const [layouts, setLayouts]           = useState(loadLayouts)
  const [currentLayout, setCurrentLayout] = useState(() => loadLayouts().xl ?? DEFAULT_LAYOUTS.xl)
  const [widgets, setWidgets]           = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_WIDGETS)
      return raw ? JSON.parse(raw) : DEFAULT_WIDGETS
    } catch { return DEFAULT_WIDGETS }
  })
  const [editMode, setEditMode]       = useState(false)
  const [pickerOpen, setPickerOpen]   = useState(false)
  const [exportOpen, setExportOpen]   = useState(false)
  const [pendingRemoveId, setPendingRemoveId] = useState(null)
  const [isResizing, setIsResizing]   = useState(false)
  const [farmConfig]   = useState(loadFarmConfig)
  const [activeZone,   setActiveZone]   = useState(0)
  const [bannerCompact, setBannerCompact] = useState(false)
  const [refreshKey,   setRefreshKey]  = useState(0)
  const [refreshing,   setRefreshing]  = useState(false)
  const refreshTimer = useRef(null)
  const [containerWidth, setContainerWidth] = useState(
    () => Math.max(320, window.innerWidth - (window.innerWidth < 768 ? 0 : 220))
  )
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth)

  // 사이드바 토글 대응 — ResizeObserver로 실시간 감지
  const containerRef = useCallback(node => {
    if (!node) return
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width)
    })
    ro.observe(node)
  }, [])

  // 윈도우 폭 추적 (브레이크포인트 기준)
  useEffect(() => {
    const fn = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  // 마운트 시 서버 설정 로드 (localStorage 우선 표시 후 서버값으로 교체)
  useEffect(() => {
    fetchSettings().then(data => {
      if (!data) return
      if (data.layouts) {
        setLayouts(data.layouts)
        setCurrentLayout(data.layouts.xl ?? DEFAULT_LAYOUTS.xl)
      }
      if (data.widgets) setWidgets(data.widgets)
    })
  }, [])

  const handleLayoutChange = (cur, all) => {
    setCurrentLayout(cur)
    setLayouts(all)
  }

  const handleRefresh = () => {
    clearZoneCache()
    setRefreshKey(k => k + 1)
    setRefreshing(true)
    clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => setRefreshing(false), 1200)
  }

  const handleRemoveWidgetConfirm = () => {
    const id = pendingRemoveId
    setLayouts(prev => {
      const next = {}
      for (const bp of Object.keys(prev)) {
        next[bp] = prev[bp].filter(l => l.i !== id)
      }
      return next
    })
    setCurrentLayout(prev => prev.filter(l => l.i !== id))
    setWidgets(prev => { const n = { ...prev }; delete n[id]; return n })
    setPendingRemoveId(null)
  }

  const handleAddWidget = (widgetDef) => {
    const id = `w${Date.now()}`
    const szMap = { 'chart-main': [4, 3], 'computed': [4, 3], 'chart': [8, 4], 'gauge-set': [5, 4], 'status-panel': [5, 4], 'avg-temp': [5, 4] }
    const [baseW, h] = szMap[widgetDef.type] ?? [5, 5]
    setLayouts(prev => {
      const next = {}
      for (const bp of Object.keys(RESPONSIVE_COLS)) {
        const bpLayout = prev[bp] ?? []
        const maxY = bpLayout.reduce((m, l) => Math.max(m, l.y + l.h), 0)
        const w = Math.min(baseW, RESPONSIVE_COLS[bp])
        next[bp] = [...bpLayout, { i: id, x: 0, y: maxY, w, h, minW: 2, minH: 2 }]
      }
      return next
    })
    setWidgets(prev => ({ ...prev, [id]: widgetDef }))
    setPickerOpen(false)
  }

  const handleConfigChange = useCallback((widgetId, partialConfig) => {
    setWidgets(prev => {
      const updated = { ...prev, [widgetId]: { ...prev[widgetId], ...partialConfig } }
      saveToStorage(STORAGE_KEY_WIDGETS, updated)
      return updated
    })
  }, [])

  const handleTitleChange = useCallback((widgetId, newTitle) => {
    setWidgets(prev => {
      const updated = { ...prev, [widgetId]: { ...prev[widgetId], title: newTitle } }
      saveToStorage(STORAGE_KEY_WIDGETS, updated)
      return updated
    })
  }, [])

  const { dynamicCandidates, zoneCapabilities } = useCapabilities()
  const allCandidates = useMemo(() => [...KPI_CANDIDATES, ...dynamicCandidates], [dynamicCandidates])

  // candidate 빠른 조회 맵
  const candidateMap = useMemo(
    () => Object.fromEntries(allCandidates.map(c => [c.id, c])),
    [allCandidates]
  )

  // 선택된 구역 ID — TopBanner 탭과 동기화
  const activeZoneId = farmConfig.zones[activeZone]?.id ?? null

  // 전체 연결된 ID Set — WidgetPicker·Widget 양쪽에 전달
  const allAvailableIds = useMemo(
    () => new Set(Object.values(zoneCapabilities).flatMap(z => z.available ?? [])),
    [zoneCapabilities]
  )

  // 위젯 KPI 폴링 — kpiId 있는 위젯만 수집 후 일괄 폴링
  const widgetSlotConfigs = useMemo(() =>
    Object.values(widgets)
      .filter(w => w.kpiId)
      .map(w => allCandidates.find(c => c.id === w.kpiId) ?? { id: w.kpiId, title: w.title }),
    [widgets, allCandidates]
  )
  const widgetKpiSlots = useKpiPolling(widgetSlotConfigs, activeZoneId, refreshKey)
  const kpiSlotMap = Object.fromEntries(widgetKpiSlots.map(s => [s.id, s]))

  // 서브로우 secondary KPI 폴링 + chart overlay ID 포함
  const secondarySlotConfigs = useMemo(() => {
    const ids = new Set()
    Object.values(widgets).forEach(w => {
      const candidate = candidateMap[w.kpiId]
      candidate?.subRows?.forEach(row => {
        if (row.kpiId)  ids.add(row.kpiId)
        if (row.kpiId2) ids.add(row.kpiId2)
      })
      // chart 위젯 오버레이 KPI
      if (w.type === 'chart') {
        w.overlayIds?.forEach(id => ids.add(id))
      }
      // computed 위젯의 kpiId2
      if (w.type === 'computed' && w.kpiId2) ids.add(w.kpiId2)
      // avg-temp 위젯의 kpiIds (xintemp1~5)
      if (w.type === 'avg-temp' && w.kpiIds) {
        w.kpiIds.forEach(id => ids.add(id))
      }
    })
    return [...ids].map(id => allCandidates.find(c => c.id === id) ?? { id })
  }, [widgets, candidateMap, allCandidates])

  const secondaryKpiSlots = useKpiPolling(secondarySlotConfigs, activeZoneId, refreshKey)
  const secondarySlotMap  = Object.fromEntries(secondaryKpiSlots.map(s => [s.id, s]))

  // 구동기 폴링 — gauge-set / status-panel 위젯이 쓰는 ID만 수집
  const actuatorSlotConfigs = useMemo(() => {
    const ids = new Set()
    Object.values(widgets).forEach(w => {
      if (w.type === 'gauge-set') {
        GAUGE_SET_GROUPS.find(g => g.id === w.groupId)?.items
          .forEach(item => ids.add(item.id.toLowerCase()))
      }
      if (w.type === 'status-panel') {
        STATUS_PANEL_GROUPS.find(g => g.id === w.groupId)?.items
          .forEach(item => {
            ids.add(item.id.toLowerCase())
            if (item.runId) ids.add(item.runId.toLowerCase())
          })
      }
    })
    return [...ids].map(id => ({ id }))
  }, [widgets])

  const actuatorKpiSlots = useKpiPolling(actuatorSlotConfigs, activeZoneId, refreshKey)
  const actuatorSlotMap  = Object.fromEntries(actuatorKpiSlots.map(s => [s.id, s]))

  // 현재 구역 라벨 — 알림 메시지에 구역명 표시용
  const zoneLabel = useMemo(() => {
    if (!activeZoneId) return null
    return farmConfig.zones.find(z => z.id === activeZoneId)?.label ?? null
  }, [activeZoneId, farmConfig])

  // 위젯 슬롯에 구역 라벨 주입 후 알림 감시
  const alertSlots = useMemo(
    () => zoneLabel ? widgetKpiSlots.map(s => ({ ...s, zoneLabel })) : widgetKpiSlots,
    [widgetKpiSlots, zoneLabel]
  )
  useAlertNotifier(alertSlots)

  // C: 위젯별 현재 grid 크기 맵
  const sizeMap = Object.fromEntries(currentLayout.map(l => [l.i, { w: l.w, h: l.h }]))

  return (
    <div className="dashboard" ref={containerRef}>
      {exportOpen && <ExportModal onClose={() => setExportOpen(false)} />}
      {pendingRemoveId && (
        <AdminPasswordModal
          title="위젯 제거"
          description={`대시보드에서 '${widgets[pendingRemoveId]?.title ?? '위젯'}'을(를) 제거합니다.`}
          confirmLabel="제거 확인"
          onConfirm={handleRemoveWidgetConfirm}
          onCancel={() => setPendingRemoveId(null)}
        />
      )}
      {/* 툴바 — 편집 기능은 관리자(isAdmin)만 노출 */}
      <div className="dashboard__toolbar">
        <span className="dashboard__title">Dashboard</span>
        <div className="dashboard__actions">
          <button
            className={`toolbar-btn ${refreshing ? 'toolbar-btn--refreshing' : ''}`}
            onClick={handleRefresh}
            disabled={refreshing}
            title="데이터 새로고침"
          >
            {refreshing ? '🔄' : '↻'} 새로고침
          </button>
          <button
            className="toolbar-btn"
            onClick={() => setExportOpen(true)}
            title="환경 데이터 CSV 다운로드"
          >
            ↓ CSV 내보내기
          </button>
          {isAdmin && (
            <>
              <button
                className={`toolbar-btn ${editMode ? 'toolbar-btn--active' : ''}`}
                onClick={() => {
                  if (editMode) {
                    saveToStorage(STORAGE_KEY_LAYOUTS, layouts)
                    saveToStorage(STORAGE_KEY_WIDGETS, widgets)
                    saveSettings({ layouts, widgets })
                  }
                  setEditMode(v => !v)
                }}
              >
                {editMode ? '편집 완료' : '레이아웃 편집'}
              </button>
              {editMode && (
                <button className="toolbar-btn toolbar-btn--primary" onClick={() => setPickerOpen(true)}>
                  + 위젯 추가
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* 헤드 위젯 */}
      <TopBanner
        compact={bannerCompact}
        onToggleCompact={() => setBannerCompact(v => !v)}
        farmConfig={farmConfig}
        activeZone={activeZone}
        onZoneChange={setActiveZone}
      />

      {/* 그리드 영역 */}
      <div
        className={`dashboard__grid-wrap ${editMode ? 'dashboard__grid-wrap--edit' : ''}`}
        onScroll={e => setBannerCompact(e.currentTarget.scrollTop > 40)}
      >

        {/* B: 편집모드 그리드 오버레이 */}
        {editMode && <GridOverlay containerWidth={containerWidth} />}

        <ResponsiveGridLayout
          layouts={layouts}
          breakpoints={Object.fromEntries(
            Object.entries(BREAKPOINTS).map(([k, v]) => [k, Math.max(0, v - (windowWidth - containerWidth))])
          )}
          cols={RESPONSIVE_COLS}
          rowHeight={ROW_H}
          width={containerWidth}
          isDraggable={editMode}
          isResizable={editMode}
          onLayoutChange={handleLayoutChange}
          margin={MARGIN}
          containerPadding={PAD}
          draggableHandle=".widget__drag-handle"
          resizeHandles={['se', 'sw', 'ne', 'nw', 's', 'e']}
          onResizeStart={() => setIsResizing(true)}
          onResizeStop={() => setIsResizing(false)}
        >
          {Object.keys(widgets).map(i => (
            <div key={i}>
              <Widget
                id={i}
                config={widgets[i]}
                kpiSlot={kpiSlotMap[widgets[i]?.kpiId] ?? null}
                kpiSlot2={
                  widgets[i]?.type === 'computed' && widgets[i]?.kpiId2
                    ? (kpiSlotMap[widgets[i].kpiId2] ?? secondarySlotMap[widgets[i].kpiId2] ?? null)
                    : null
                }
                editMode={editMode}
                onRemove={() => setPendingRemoveId(i)}
                gridSize={sizeMap[i]}
                isResizing={isResizing}
                candidate={candidateMap[widgets[i]?.kpiId] ?? null}
                extraSlots={secondarySlotMap}
                onTitleChange={(newTitle) => handleTitleChange(i, newTitle)}
                defaultTitle={candidateMap[widgets[i]?.kpiId]?.title ?? null}
                actuatorSlots={actuatorSlotMap}
                allAvailableIds={allAvailableIds}
                allCandidates={allCandidates}
                onConfigChange={(partial) => handleConfigChange(i, partial)}
                kpiSlots={
                  widgets[i]?.type === 'avg-temp'
                    ? (widgets[i].kpiIds ?? []).map(id => kpiSlotMap[id] ?? secondarySlotMap[id] ?? null)
                    : undefined
                }
                zoneId={activeZoneId}
              />
            </div>
          ))}
        </ResponsiveGridLayout>
      </div>

      {pickerOpen && (
        <WidgetPicker onAdd={handleAddWidget} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  )
}
