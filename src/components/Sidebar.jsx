import { useState } from 'react'
import {
  LayoutDashboard, Bot, ClipboardEdit, Settings,
  Users, User, LogOut, ChevronLeft, ChevronRight,
  ChevronDown, RotateCcw,
} from 'lucide-react'
import AdminPasswordModal from './AdminPasswordModal'
import './Sidebar.css'

// ─── 메뉴 데이터 ────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    id: 'dashboard-group',
    label: 'Dashboard',
    icon: LayoutDashboard,
    type: 'link',          // 헤더 클릭 → 페이지 이동 / 서브메뉴 항상 표시
    navigateTo: 'dashboard',
    children: [
      { id: 'dashboard',    label: '대시보드 홈' },
      { id: 'my-dashboard', label: 'My Dashboard' },
    ],
  },
  {
    id: 'ai-agent-group',
    label: 'AI Agent',
    icon: Bot,
    type: 'accordion',     // 헤더 클릭 → 서브메뉴 펼침·접힘만 동작
    children: [
      { id: 'ai-consulting',    label: 'AI컨설팅리포트' },
      { id: 'ai-manual',        label: 'AI매뉴얼 Agent' },
      { id: 'env-diagnosis',    label: '환경진단 Agent' },
      { id: 'growth-diagnosis', label: '생육진단 Agent' },
      { id: 'ai-farm-analysis', label: 'AI 농장운영 분석' },
    ],
  },
  {
    id: 'data-input-group',
    label: '데이터입력',
    icon: ClipboardEdit,
    type: 'accordion',
    children: [
      { id: 'env-data-input',    label: '환경데이터 입력' },
      { id: 'growth-data-input', label: '생육데이터 입력' },
      { id: 'mgmt-data-input',   label: '경영데이터 입력' },
    ],
  },
  {
    id: 'data-settings-group',
    label: '데이터설정',
    icon: Settings,
    type: 'accordion',
    children: [
      { id: 'farm-settings',   label: '농장 등록/설정' },
      { id: 'guideline-settings', label: '데이터 항목 수정 및 변경' },
      { id: 'dashboard-reset', label: '대시보드 초기화', special: 'reset' },
    ],
  },
]

const ACCOUNT_ITEMS = [
  { id: 'our-team', label: 'Our Team', icon: Users },
  { id: 'profile',  label: 'Profile',  icon: User  },
  { id: 'logout',   label: 'Logout',   icon: LogOut },
]

// ─── 컴포넌트 ────────────────────────────────────────────────────────
export default function Sidebar({ activePage, onNavigate, onResetDashboard, collapsed, onCollapse }) {
  const [clickOpenGroup,  setClickOpenGroup]  = useState(null)   // 펼친 상태: 클릭 고정 열림
  const [hoverGroup,      setHoverGroup]      = useState(null)   // 펼친 상태: hover 임시 열림
  const [flyout,          setFlyout]          = useState({ groupId: null, y: 0 }) // 접힌 상태 플라이아웃
  const [showResetModal,  setShowResetModal]  = useState(false)

  // 펼친 상태 — 단일 아코디언 토글
  const handleClickGroup = (id) => {
    setClickOpenGroup(prev => prev === id ? null : id)
  }

  // 접힌 상태 — 플라이아웃 열기/닫기
  const openFlyout = (groupId, e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setFlyout(prev =>
      prev.groupId === groupId
        ? { groupId: null, y: 0 }        // 같은 그룹 재클릭 → 닫기
        : { groupId, y: rect.top }
    )
  }
  const closeFlyout = () => setFlyout({ groupId: null, y: 0 })

  const isChildActive = (group) =>
    group.children.some(c => c.id === activePage)

  const flyoutGroupData = NAV_GROUPS.find(g => g.id === flyout.groupId)

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>

      {/* 로고 */}
      <div className="sidebar__logo">
        {!collapsed && (
          <div className="sidebar__logo-text">
            <span className="sidebar__logo-main">대동</span>
            <span className="sidebar__logo-sub">Smart 파밍</span>
          </div>
        )}
        <button
          className="sidebar__toggle"
          onClick={() => onCollapse(v => !v)}
          title={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* 메인 네비게이션 */}
      <nav className="sidebar__nav sidebar__nav--main">
        {NAV_GROUPS.map((group) => {
          // link: 항상 열림 / accordion: 클릭 고정 OR hover 임시
          const isOpen      = group.type === 'link'
                           || clickOpenGroup === group.id
                           || (!collapsed && hoverGroup === group.id)
          const childActive = isChildActive(group)
          const Icon        = group.icon

          return (
            <div
              key={group.id}
              className="sidebar__group"
              onMouseEnter={() => {
                if (group.type === 'accordion' && !collapsed) setHoverGroup(group.id)
              }}
              onMouseLeave={() => {
                if (group.type === 'accordion') setHoverGroup(null)
              }}
            >

              {/* 그룹 헤더 */}
              <button
                className={`sidebar__item sidebar__group-header ${
                  childActive ? 'sidebar__item--child-active' : ''
                }`}
                onClick={(e) => {
                  if (group.type === 'link') {
                    onNavigate(group.navigateTo)
                  } else if (collapsed) {
                    // 접힌 상태: 사이드바 유지 + 플라이아웃 표시
                    openFlyout(group.id, e)
                  } else {
                    handleClickGroup(group.id)
                  }
                }}
              >
                <Icon size={18} className="sidebar__icon" />
                {!collapsed && (
                  <>
                    <span className="sidebar__label">{group.label}</span>
                    {group.type === 'accordion' && (
                      <ChevronDown
                        size={13}
                        className={`sidebar__chevron ${isOpen ? 'sidebar__chevron--open' : ''}`}
                      />
                    )}
                  </>
                )}
                {/* 접힌 상태 커스텀 툴팁 */}
                <span className="sidebar__tooltip">{group.label}</span>
              </button>

              {/* 서브메뉴 — 사이드바 접힌 상태에서는 완전히 숨김 */}
              {!collapsed && (
                <div className={`sidebar__submenu ${isOpen ? 'sidebar__submenu--open' : ''}`}>
                  <div className="sidebar__submenu-inner">
                    {group.children.map((child) => (
                      <button
                        key={child.id}
                        className={`sidebar__item sidebar__subitem ${
                          activePage === child.id ? 'sidebar__item--active' : ''
                        }`}
                        onClick={() => {
                          if (child.special === 'reset') {
                            setShowResetModal(true)
                          } else {
                            onNavigate(child.id)
                          }
                        }}
                      >
                        <span className="sidebar__subitem-dot" />
                        <span className="sidebar__label">{child.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )
        })}
      </nav>

      {/* Account 섹션 */}
      <div className="sidebar__section-label">
        {!collapsed && <span>Account</span>}
      </div>
      <nav className="sidebar__nav">
        {ACCOUNT_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`sidebar__item ${activePage === id ? 'sidebar__item--active' : ''}`}
            onClick={() => onNavigate(id)}
          >
            <Icon size={18} className="sidebar__icon" />
            {!collapsed && <span className="sidebar__label">{label}</span>}
            {/* 접힌 상태 커스텀 툴팁 */}
            <span className="sidebar__tooltip">{label}</span>
          </button>
        ))}
      </nav>

      {/* 접힌 상태 플라이아웃 패널 */}
      {collapsed && flyoutGroupData && (
        <>
          {/* 백드롭 — 콘텐츠 영역 진입(hover) 또는 클릭 시 닫기 */}
          <div
            className="sidebar__flyout-backdrop"
            onClick={closeFlyout}
            onMouseEnter={closeFlyout}
          />

          {/* 패널 */}
          <div className="sidebar__flyout" style={{ top: flyout.y }}>
            <div className="sidebar__flyout-title">{flyoutGroupData.label}</div>
            {flyoutGroupData.children.map((child) => (
              <button
                key={child.id}
                className={`sidebar__flyout-item ${
                  activePage === child.id ? 'sidebar__flyout-item--active' : ''
                }`}
                onClick={() => {
                  if (child.special === 'reset') {
                    setShowResetModal(true)
                  } else {
                    onNavigate(child.id)
                  }
                  closeFlyout()
                }}
              >
                <span className="sidebar__subitem-dot" />
                {child.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* 대시보드 초기화 비밀번호 확인 */}
      {showResetModal && (
        <AdminPasswordModal
          title="대시보드 초기화"
          description={
            <>
              대시보드를 초기화 하시겠습니까?<br />
              설정된 위젯 레이아웃이 모두 초기화됩니다.
            </>
          }
          confirmLabel="초기화"
          onConfirm={() => { setShowResetModal(false); onResetDashboard?.() }}
          onCancel={() => setShowResetModal(false)}
        />
      )}

    </aside>
  )
}
