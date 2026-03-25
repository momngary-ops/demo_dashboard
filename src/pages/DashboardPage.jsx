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
import { useState, useCallback, useMemo } from 'react'
import AdminPasswordModal from '../components/AdminPasswordModal'
import { useKpiPolling } from '../hooks/useKpiPolling'
import { KPI_CANDIDATES } from '../constants/kpiCandidates'
import { useCapabilities } from '../contexts/CapabilitiesContext'
import GridLayout from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import Widget from '../components/Widget'
import WidgetPicker from '../components/WidgetPicker'
import TopBanner from '../components/TopBanner/TopBanner'
import './DashboardPage.css'

const COLS    = 20
const ROW_H   = 80
const MARGIN  = [12, 12]
const PAD     = [16, 16]

// ─── localStorage 키 — App.jsx(초기화)에서도 동일 키를 사용한다 ───────
export const STORAGE_KEY_LAYOUT  = 'dashboard:layout'
export const STORAGE_KEY_WIDGETS = 'dashboard:widgets'

function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function saveToStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* quota 초과 등 무시 */ }
}

const DEFAULT_LAYOUT = [
  { i: 'w1', x: 0,  y: 0, w: 5,  h: 5, minW: 2, minH: 2 },
  { i: 'w2', x: 5,  y: 0, w: 5,  h: 5, minW: 2, minH: 2 },
  { i: 'w3', x: 10, y: 0, w: 5,  h: 5, minW: 2, minH: 2 },
  { i: 'w4', x: 15, y: 0, w: 5,  h: 5, minW: 2, minH: 2 },
  { i: 'w5', x: 0,  y: 5, w: 10, h: 5, minW: 2, minH: 2 },
  { i: 'w6', x: 10, y: 5, w: 10, h: 5, minW: 2, minH: 2 },
]

const DEFAULT_WIDGETS = {
  w1: { type: 'stat',  title: '내부 온도',  kpiId: 'xintemp1' },
  w2: { type: 'stat',  title: '내부 습도',  kpiId: 'xinhum1' },
  w3: { type: 'stat',  title: 'CO₂',       kpiId: 'xco2' },
  w4: { type: 'stat',  title: '급액 EC',    kpiId: 'now_ec' },
  w5: { type: 'chart', title: '환경 추이',  kpiId: null },
  w6: { type: 'chart', title: '농가 현황',  kpiId: null },
}

// B: 그리드 오버레이 — 컬럼·행 가이드선
function GridOverlay({ containerWidth }) {
  const innerW  = containerWidth - PAD[0] * 2
  const cellW   = (innerW - MARGIN[0] * (COLS - 1)) / COLS
  const stepX   = cellW + MARGIN[0]
  const stepY   = ROW_H + MARGIN[1]
  const rowCount = 12

  const vLines = Array.from({ length: COLS + 1 }, (_, i) => {
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
      {Array.from({ length: COLS }, (_, i) => (
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
  const [layout, setLayout]   = useState(() => loadFromStorage(STORAGE_KEY_LAYOUT,  DEFAULT_LAYOUT))
  const [widgets, setWidgets] = useState(() => loadFromStorage(STORAGE_KEY_WIDGETS, DEFAULT_WIDGETS))
  const [editMode, setEditMode]       = useState(false)
  const [pickerOpen, setPickerOpen]   = useState(false)
  const [pendingRemoveId, setPendingRemoveId] = useState(null)
  const [isResizing, setIsResizing]   = useState(false)
  const [bannerCompact, setBannerCompact] = useState(false)
  const [containerWidth, setContainerWidth] = useState(
    window.innerWidth - 200
  )

  // 사이드바 토글 대응 — ResizeObserver로 실시간 감지
  const containerRef = useCallback(node => {
    if (!node) return
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width)
    })
    ro.observe(node)
  }, [])

  const handleLayoutChange = (newLayout) => setLayout(newLayout)

  const handleRemoveWidgetConfirm = () => {
    setLayout(prev => prev.filter(l => l.i !== pendingRemoveId))
    setWidgets(prev => { const n = { ...prev }; delete n[pendingRemoveId]; return n })
    setPendingRemoveId(null)
  }

  const handleAddWidget = (widgetDef) => {
    const id   = `w${Date.now()}`
    const maxY = layout.reduce((m, l) => Math.max(m, l.y + l.h), 0)
    setLayout(prev => [...prev, { i: id, x: 0, y: maxY, w: 5, h: 5, minW: 2, minH: 2 }])
    setWidgets(prev => ({ ...prev, [id]: widgetDef }))
    setPickerOpen(false)
  }

  const { dynamicCandidates, zoneCapabilities } = useCapabilities()
  const allCandidates = useMemo(() => [...KPI_CANDIDATES, ...dynamicCandidates], [dynamicCandidates])

  // 첫 번째 연결된 구역 ID 사용 (대시보드는 구역 탭 없음)
  const firstZoneId = useMemo(
    () => Object.keys(zoneCapabilities).find(id => zoneCapabilities[id]?.available?.length > 0) ?? null,
    [zoneCapabilities]
  )

  // 위젯 KPI 폴링 — kpiId 있는 위젯만 수집 후 일괄 폴링
  const widgetSlotConfigs = useMemo(() =>
    Object.values(widgets)
      .filter(w => w.kpiId)
      .map(w => allCandidates.find(c => c.id === w.kpiId) ?? { id: w.kpiId, title: w.title }),
    [widgets, allCandidates]
  )
  const widgetKpiSlots = useKpiPolling(widgetSlotConfigs, firstZoneId)
  const kpiSlotMap = Object.fromEntries(widgetKpiSlots.map(s => [s.id, s]))

  // C: 위젯별 현재 grid 크기 맵
  const sizeMap = Object.fromEntries(layout.map(l => [l.i, { w: l.w, h: l.h }]))

  return (
    <div className="dashboard" ref={containerRef}>
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
        {isAdmin && (
          <div className="dashboard__actions">
            <button
              className={`toolbar-btn ${editMode ? 'toolbar-btn--active' : ''}`}
              onClick={() => {
                if (editMode) {
                  // 편집 완료 — 현재 레이아웃·위젯 상태를 localStorage에 저장
                  saveToStorage(STORAGE_KEY_LAYOUT,  layout)
                  saveToStorage(STORAGE_KEY_WIDGETS, widgets)
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
          </div>
        )}
      </div>

      {/* 헤드 위젯 */}
      <TopBanner
        compact={bannerCompact}
        onToggleCompact={() => setBannerCompact(v => !v)}
      />

      {/* 그리드 영역 */}
      <div
        className={`dashboard__grid-wrap ${editMode ? 'dashboard__grid-wrap--edit' : ''}`}
        onScroll={e => setBannerCompact(e.currentTarget.scrollTop > 40)}
      >

        {/* B: 편집모드 그리드 오버레이 */}
        {editMode && <GridOverlay containerWidth={containerWidth} />}

        <GridLayout
          layout={layout}
          cols={COLS}
          rowHeight={ROW_H}
          width={containerWidth}
          isDraggable={editMode}
          isResizable={editMode}
          onLayoutChange={handleLayoutChange}
          margin={MARGIN}
          containerPadding={PAD}
          draggableHandle=".widget__drag-handle"
          // A: 핸들 6방향
          resizeHandles={['se', 'sw', 'ne', 'nw', 's', 'e']}
          onResizeStart={() => setIsResizing(true)}
          onResizeStop={() => setIsResizing(false)}
        >
          {layout.map(({ i }) => (
            <div key={i}>
              <Widget
                id={i}
                config={widgets[i]}
                kpiSlot={kpiSlotMap[widgets[i]?.kpiId] ?? null}
                editMode={editMode}
                onRemove={() => setPendingRemoveId(i)}
                gridSize={sizeMap[i]}          // C: 크기 배지용
                isResizing={isResizing}
              />
            </div>
          ))}
        </GridLayout>
      </div>

      {pickerOpen && (
        <WidgetPicker onAdd={handleAddWidget} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  )
}
