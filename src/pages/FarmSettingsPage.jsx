import { useState } from 'react'
import { CROP_SCHEMA, DEFAULT_FARM_CONFIG, loadFarmConfig, saveFarmConfig } from '../constants/farmSchema'
import { useCapabilities } from '../contexts/CapabilitiesContext'
import { API_SOURCE } from '../constants/pollingConfig'
import { KPI_CANDIDATES } from '../constants/kpiCandidates'
import AdminPasswordModal from '../components/AdminPasswordModal'
import './FarmSettingsPage.css'

// TODO: 농장 관리자 비밀번호 설정/변경 — 현재는 평문 localStorage 저장.
//       추후 해시 처리 및 서버 인증으로 교체 필요.

export default function FarmSettingsPage() {
  const [config, setConfig] = useState(loadFarmConfig)
  const [saved,  setSaved]  = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const { capabilities, loading: capLoading, lastFetched, refetch: refetchCapabilities } = useCapabilities()

  const update = (key, value) => { setSaved(false); setConfig(prev => ({ ...prev, [key]: value })) }

  // ─── 구역 핸들러 ───────────────────────────────────────────────────────────
  const handleZoneLabel = (id, label) => {
    setSaved(false)
    setConfig(prev => ({ ...prev, zones: prev.zones.map(z => z.id === id ? { ...z, label } : z) }))
  }

  const handleZoneAdd = () => {
    setSaved(false)
    setConfig(prev => ({
      ...prev,
      zones: [...prev.zones, { id: String(Date.now()), label: `${prev.zones.length + 1}구역` }],
    }))
  }

  const handleZoneDeleteConfirm = () => {
    setSaved(false)
    setConfig(prev => ({ ...prev, zones: prev.zones.filter(z => z.id !== pendingDeleteId) }))
    setPendingDeleteId(null)
  }

  // ─── 저장 ────────────────────────────────────────────────────────────────
  const handleSave  = () => { saveFarmConfig(config); setSaved(true) }
  const handleReset = () => { setConfig(DEFAULT_FARM_CONFIG); setSaved(false) }

  const pendingZone = config.zones.find(z => z.id === pendingDeleteId)

  return (
    <div className="fsp">
      {/* 구역 삭제 비밀번호 확인 */}
      {pendingDeleteId && pendingZone && (
        <AdminPasswordModal
          title="구역 삭제"
          description={
            <>
              <strong style={{ color: 'var(--danger)' }}>{pendingZone.label}</strong>을(를) 삭제합니다.<br />
              이 구역의 기존 입력 데이터가 있을 경우 조회가 불가능해질 수 있습니다.
            </>
          }
          confirmLabel="삭제 확인"
          onConfirm={handleZoneDeleteConfirm}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}

      {/* 툴바 */}
      <div className="fsp__toolbar">
        <span className="fsp__title">농장 등록 / 설정</span>
        <div className="fsp__toolbar-actions">
          {saved && <span className="fsp__saved-badge">저장됨 ✓</span>}
          <button className="fsp-btn" onClick={handleReset}>기본값 복원</button>
          <button className="fsp-btn fsp-btn--primary" onClick={handleSave}>저장</button>
        </div>
      </div>

      <div className="fsp__body">
        {/* 기본 정보 */}
        <section className="fsp__section">
          <h2 className="fsp__section-title">기본 정보</h2>
          <div className="fsp__fields">
            <div className="fsp__field">
              <label className="fsp__label">농장명</label>
              <input className="fsp__input" type="text" value={config.farmName}
                onChange={e => update('farmName', e.target.value)} />
            </div>
            <div className="fsp__field">
              <label className="fsp__label">면적 (ha)</label>
              <input className="fsp__input fsp__input--short" type="number" min="0" step="0.1"
                value={config.hectares}
                onChange={e => update('hectares', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="fsp__field">
              <label className="fsp__label">대표 작물</label>
              <select className="fsp__input" value={config.cropId}
                onChange={e => update('cropId', e.target.value)}>
                {Object.entries(CROP_SCHEMA).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div className="fsp__field">
              <label className="fsp__label">Sub 작물</label>
              <select className="fsp__input" value={config.subCropId ?? ''}
                onChange={e => update('subCropId', e.target.value || null)}>
                <option value="">없음</option>
                {Object.entries(CROP_SCHEMA)
                  .filter(([k]) => k !== config.cropId)
                  .map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* 구역 설정 */}
        <section className="fsp__section">
          <h2 className="fsp__section-title">
            구역 설정
            <span className="fsp__section-count">{config.zones.length}개</span>
          </h2>
          <div className="fsp__zones">
            {config.zones.map((zone, i) => (
              <div key={zone.id} className="fsp__zone-row">
                <span className="fsp__zone-index">{i + 1}</span>
                <input className="fsp__input fsp__input--zone" type="text"
                  value={zone.label} placeholder="구역 이름"
                  onChange={e => handleZoneLabel(zone.id, e.target.value)} />
                <button className="fsp-btn fsp-btn--danger"
                  onClick={() => setPendingDeleteId(zone.id)}
                  disabled={config.zones.length <= 1}>
                  삭제
                </button>
              </div>
            ))}
          </div>
          <button className="fsp-btn fsp-btn--add" onClick={handleZoneAdd}>
            + 구역 추가
          </button>
        </section>

        {/* API 신규/재연결 */}
        <section className="fsp__section">
          <h2 className="fsp__section-title">API 신규/재연결</h2>
          <div className="fsp__api-row">
            <button
              className={`fsp-btn ${!capLoading ? 'fsp-btn--primary' : ''}`}
              onClick={refetchCapabilities}
              disabled={capLoading}
            >
              {capLoading ? '연결 확인 중...' : capabilities ? '재연결' : '연결 확인'}
            </button>
            {lastFetched && !capLoading && (
              <span className="fsp__field-hint">마지막 확인: {lastFetched.toLocaleTimeString()}</span>
            )}
          </div>

          {capabilities && !capLoading && (() => {
            const CAT_LABEL = { CLIMATE: '환경·제어', FARM_MANAGING: '경영', GROWTH: '생육', LABOR: '노동' }
            const grouped = Object.entries(API_SOURCE).reduce((acc, [cat, ids]) => {
              const matched = (capabilities.available['Z-1'] ?? []).filter(f => ids.includes(f))
              if (matched.length > 0) acc[cat] = matched
              return acc
            }, {})
            return (
              <div className="fsp__api-result">
                {Object.entries(grouped).map(([cat, fields]) => (
                  <div key={cat} className="fsp__api-group">
                    <div className="fsp__api-group-label">
                      {CAT_LABEL[cat] ?? cat}
                      <span>{fields.length}개</span>
                    </div>
                    <div className="fsp__api-chips">
                      {fields.map(f => {
                        const c = KPI_CANDIDATES.find(k => k.id === f)
                        return (
                          <span key={f} className="fsp__api-chip">
                            {c ? `${c.icon} ${c.title}` : f}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </section>

        {/* 보안 설정 */}
        {/* TODO: 농장 관리자 비밀번호 설정/변경 구현 필요
                  - 현재: 평문 저장, 단순 일치 비교
                  - 개선: bcrypt 해시 처리 + 서버 인증으로 교체
                  - UI: 현재 비밀번호 확인 → 새 비밀번호 → 확인 입력 3단계 */}
        <section className="fsp__section">
          <h2 className="fsp__section-title">
            보안
            <span className="fsp__section-todo">⚠ TODO: 비밀번호 설정/변경 기능 구현 필요</span>
          </h2>
          <div className="fsp__fields">
            <div className="fsp__field">
              <label className="fsp__label">관리자 비밀번호</label>
              <input className="fsp__input fsp__input--short" type="password"
                value={config.adminPassword ?? ''} placeholder="비밀번호"
                autoComplete="new-password"
                onChange={e => update('adminPassword', e.target.value)} />
              <span className="fsp__field-hint">구역 삭제 · 위젯 제거 · 데이터 삭제 시 확인에 사용됩니다.</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
