import { useState } from 'react'
import {
  LayoutDashboard, BarChart2, FileText, Search, ClipboardEdit,
  Users, User, Mail, LogOut, ChevronLeft, ChevronRight
} from 'lucide-react'
import './Sidebar.css'

const NAV_ITEMS = [
  { id: 'dashboard',  label: 'Dashboard',   icon: LayoutDashboard },
  { id: 'daesibo',    label: '대시보드',      icon: BarChart2 },
  { id: 'ai-report',  label: 'AI 레포트',    icon: FileText },
  { id: 'data-view',  label: '데이터 조회',   icon: Search },
  { id: 'data-input', label: '데이터 입력',   icon: ClipboardEdit },
]

const ACCOUNT_ITEMS = [
  { id: 'community', label: 'Our community', icon: Users },
  { id: 'profile',   label: 'Profile',       icon: User },
  { id: 'contact',   label: 'Contact Us',    icon: Mail },
  { id: 'logout',    label: 'Logout',        icon: LogOut },
]

export default function Sidebar({ activePage, onNavigate }) {
  const [collapsed, setCollapsed] = useState(false)

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
          onClick={() => setCollapsed(v => !v)}
          title={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* 네비게이션 */}
      <nav className="sidebar__nav">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`sidebar__item ${activePage === id ? 'sidebar__item--active' : ''}`}
            onClick={() => onNavigate(id)}
            title={collapsed ? label : undefined}
          >
            <Icon size={18} className="sidebar__icon" />
            {!collapsed && <span className="sidebar__label">{label}</span>}
          </button>
        ))}
      </nav>

      {/* 계정 */}
      <div className="sidebar__section-label">
        {!collapsed && <span>Account</span>}
      </div>
      <nav className="sidebar__nav">
        {ACCOUNT_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`sidebar__item ${activePage === id ? 'sidebar__item--active' : ''}`}
            onClick={() => onNavigate(id)}
            title={collapsed ? label : undefined}
          >
            <Icon size={18} className="sidebar__icon" />
            {!collapsed && <span className="sidebar__label">{label}</span>}
          </button>
        ))}
      </nav>
    </aside>
  )
}
