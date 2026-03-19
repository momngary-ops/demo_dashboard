import { useState, useRef, useEffect } from 'react'
import { loadFarmConfig } from '../constants/farmSchema'
import './AdminPasswordModal.css'

/**
 * 관리자 비밀번호 확인 모달 (공유 컴포넌트)
 *
 * Props:
 *   title        - 모달 제목
 *   description  - 본문 설명 (JSX 또는 string)
 *   confirmLabel - 확인 버튼 텍스트 (기본: '확인')
 *   onConfirm    - 비밀번호 일치 시 호출
 *   onCancel     - 취소 / 닫기 시 호출
 */
export default function AdminPasswordModal({
  title,
  description,
  confirmLabel = '확인',
  onConfirm,
  onCancel,
}) {
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)
  const inputRef          = useRef(null)
  const adminPassword     = loadFarmConfig().adminPassword ?? ''

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleConfirm = () => {
    if (input === adminPassword) {
      onConfirm()
    } else {
      setError(true)
      setInput('')
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter')  handleConfirm()
    if (e.key === 'Escape') onCancel()
  }

  return (
    <div className="adm-backdrop" onClick={onCancel}>
      <div className="adm-modal" onClick={e => e.stopPropagation()}>
        <p className="adm-modal__title">{title}</p>
        {description && <div className="adm-modal__desc">{description}</div>}
        <div className="adm-modal__pw-wrap">
          <label className="adm-modal__pw-label">관리자 비밀번호</label>
          <input
            ref={inputRef}
            type="password"
            className={`adm-modal__pw-input ${error ? 'adm-modal__pw-input--error' : ''}`}
            value={input}
            placeholder="비밀번호 입력"
            autoComplete="off"
            onChange={e => { setInput(e.target.value); setError(false) }}
            onKeyDown={handleKeyDown}
          />
          {error && <span className="adm-modal__pw-error">비밀번호가 틀렸습니다.</span>}
        </div>
        <div className="adm-modal__actions">
          <button className="adm-modal__btn adm-modal__btn--cancel" onClick={onCancel}>
            취소
          </button>
          <button className="adm-modal__btn adm-modal__btn--confirm" onClick={handleConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
