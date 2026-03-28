import { createContext, useContext, useState, useCallback } from 'react'

const NotificationContext = createContext(null)

const MAX_HISTORY = 50
const MAX_TOASTS  = 3

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([])
  const [toasts,        setToasts]        = useState([])

  const addNotification = useCallback((item) => {
    const entry = { id: Date.now() + Math.random(), ...item, read: false, timestamp: new Date().toISOString() }
    setNotifications(prev => [entry, ...prev].slice(0, MAX_HISTORY))
    setToasts(prev => [...prev, entry].slice(-MAX_TOASTS))
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }, [])

  const clearAll = useCallback(() => {
    setNotifications([])
  }, [])

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <NotificationContext.Provider value={{ notifications, toasts, unreadCount, addNotification, dismissToast, markAllRead, clearAll }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotification() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotification must be used inside NotificationProvider')
  return ctx
}
