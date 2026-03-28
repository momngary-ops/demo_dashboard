import { useState } from 'react'
import { Bell, Mail, User } from 'lucide-react'
import { useNotification } from '../contexts/NotificationContext'
import NotificationPanel from './NotificationPanel'
import './Header.css'

// TODO: auth context 연동 시 userName prop으로 실제 사용자명 주입
export default function Header({ userName = '신연준 차장', collapsed = false }) {
  const [panelOpen, setPanelOpen] = useState(false)
  const { unreadCount, markAllRead } = useNotification()

  const handleBellClick = () => {
    const next = !panelOpen
    setPanelOpen(next)
    if (next) markAllRead()
  }

  return (
    <header className={`header ${collapsed ? 'header--hidden' : ''}`}>
      <div className="header__left" />
      <div className="header__right">
        <button className="header__icon-btn" title="메일">
          <Mail size={18} />
        </button>

        <div className="header__bell-wrap">
          <button className="header__icon-btn" title="알림" onClick={handleBellClick}>
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="header__badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>
          {panelOpen && (
            <NotificationPanel onClose={() => setPanelOpen(false)} />
          )}
        </div>

        <div className="header__user">
          <div className="header__avatar">
            <User size={16} />
          </div>
          <span className="header__username">{userName}</span>
        </div>
      </div>
    </header>
  )
}
