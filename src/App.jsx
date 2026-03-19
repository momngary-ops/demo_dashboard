import { useState } from 'react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import DashboardPage from './pages/DashboardPage'
import { STORAGE_KEY_LAYOUT, STORAGE_KEY_WIDGETS } from './pages/DashboardPage'
import GrowthDataInputPage from './pages/GrowthDataInputPage'
import FarmSettingsPage from './pages/FarmSettingsPage'
import './App.css'

export default function App() {
  // 초기 화면 = 'dashboard' (로그인 랜딩 정책 고정)
  const [activePage,        setActivePage]        = useState('dashboard')
  const [sidebarCollapsed,  setSidebarCollapsed]  = useState(false)

  // 대시보드 초기화: localStorage 제거 후 key 증가로 DashboardPage 강제 리마운트
  const [dashboardResetKey, setDashboardResetKey] = useState(0)

  const handleResetDashboard = () => {
    localStorage.removeItem(STORAGE_KEY_LAYOUT)
    localStorage.removeItem(STORAGE_KEY_WIDGETS)
    setDashboardResetKey(k => k + 1)
    setActivePage('dashboard')
  }

  // 페이지 맵 — 추가 페이지는 여기에 등록
  // My Dashboard도 동일 패턴으로 별도 key + resetHandler 추가 예정
  const pages = {
    dashboard: <DashboardPage key={dashboardResetKey} />,
    'growth-data-input': <GrowthDataInputPage />,
    'farm-settings': <FarmSettingsPage />,
  }

  return (
    <div className="layout">
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        onResetDashboard={handleResetDashboard}
        collapsed={sidebarCollapsed}
        onCollapse={setSidebarCollapsed}
      />
      <div className="layout__body">
        <Header collapsed={sidebarCollapsed} />
        <main style={{ flex: 1, overflow: 'hidden' }}>
          {pages[activePage] ?? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', color: 'var(--text-muted)', fontSize: 13
            }}>
              준비 중인 페이지입니다
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
