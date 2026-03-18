import { useState } from 'react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import DashboardPage from './pages/DashboardPage'
import './App.css'

const PAGES = {
  dashboard: <DashboardPage />,
}

export default function App() {
  const [activePage, setActivePage] = useState('dashboard')

  return (
    <div className="layout">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <div className="layout__body">
        <Header />
        <main style={{ flex: 1, overflow: 'hidden' }}>
          {PAGES[activePage] ?? (
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
