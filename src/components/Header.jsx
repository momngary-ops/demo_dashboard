import { Bell, Mail, User } from 'lucide-react'
import './Header.css'

export default function Header({ userName = '신연준 차장' }) {
  return (
    <header className="header">
      <div className="header__left" />
      <div className="header__right">
        <button className="header__icon-btn" title="메일">
          <Mail size={18} />
        </button>
        <button className="header__icon-btn" title="알림">
          <Bell size={18} />
        </button>
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
