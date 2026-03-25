import { useState } from 'react'
import { CROP_SCHEMA, DEFAULT_FARM_CONFIG, loadFarmConfig, saveFarmConfig } from '../constants/farmSchema'
import { useCapabilities } from '../contexts/CapabilitiesContext'
import { KPI_CANDIDATES } from '../constants/kpiCandidates'
import { clearZoneCache } from '../hooks/useKpiPolling'
import AdminPasswordModal from '../components/AdminPasswordModal'
import ZoneApiModal from '../components/ZoneApiModal'
import './FarmSettingsPage.css'

// TODO: 농장 관리자 비밀번호 설정/변경 — 현재는 평문 localStorage 저장.
//       추후 해시 처리 및 서버 인증으로 교체 필요.

const CAT_LABEL = { '환경·제어': '환경·제어', '경영': '경영', '생육': '생육', '노동': '노동' }

/** 구역 API 상태 배지 */
function ApiStatusBadge({ status, loading }) {
  if (loading) return <span className="zone-badge zone-badge--loading">🔄 확인 중</span>
  switch (status) {
    case 'connected':    return <span className="zone-badge zone-badge--ok">✅ 연결됨</span>
    case 'error':        return <span className="zone-badge zone-badge--error">❌ 오류</span>
    default:             return <span className="zone-badge zone-badge--pending">⚠ 미연결</span>
  }
}

/** 연결된 필드를 카테고리별로 칩으로 표시 */
function FieldChips({ fields }) {
  if (!fields?.length) return null
  const kpiMap = Object.fromEntries(KPI_CANDIDATES.map(c => [c.id, c]))
  const groups = {}
  for (const f of fields) {
    const kpi = kpiMap[f]
    const cat = kpi?.category ?? '기타'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push({ id: f, icon: kpi?.icon ?? '', title: kpi?.title ?? f })
  }
  return (
    <div className="zone-fields">
      {Object.entries(groups).map(([cat, items]) => (
        <div key={cat} className="zone-fields__group">
          <span className="zone-fields__cat">{CAT_LABEL[cat] ?? cat} {items.length}개</span>
          <div className="zone-fields__chips">
            {items.map(f => (
              <span key={f.id} className="zone-fields__chip">{f.icon} {f.title}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** 구역 행 컴포넌트 */
function ZoneRow({ zone, index, zoneCapState, onEdit, onDelete, onReconnect }) {
  const { status, lastConnected, availableFields } = zone.apiConfig ?? {}
  const capLoading = zoneCapState?.loading ?? false
  const lastTime   = lastConnected ? new Date(lastConnected).toLocaleTimeString() : null

  return (
    <div className="fsp__zone-card">
      <div className="fsp__zone-card-top">
        <span className="fsp__zone-index">{index + 1}</span>
        <span className="fsp__zone-label">{zone.label}</span>
        <ApiStatusBadge status={status} loading={capLoading} />
        {lastTime && <span className="fsp__zone-time">마지막 확인: {lastTime}</span>}
        <div className="fsp__zone-actions">
          {status === 'connected'
            ? (
              <>
                <button className="fsp-btn" onClick={onEdit}>수정</button>
                <button className="fsp-btn" onClick={onReconnect} disabled={capLoading}>재연결</button>
              </>
            ) : (
              <button className="fsp-btn fsp-btn--primary" onClick={onEdit}>
                API 연동
              </button>
            )
          }
          <button className="fsp-btn fsp-btn--danger" onClick={onDelete}>삭제</button>
        </div>
      </div>

      {status === 'connected' && availableFields?.length > 0 && (
        <FieldChips fields={availableFields} />
      )}
      {status !== 'connected' && (
        <p className="fsp__zone-notice">구역 등록 완료를 위해 API 연동이 필요합니다.</p>
      )}
    </div>
  )
}

export default function FarmSettingsPage() {
  const [config, setConfig] = useState(loadFarmConfig)
  const [saved,  setSaved]  = useState(false)
  const [pendingDeleteId,  setPendingDeleteId]  = useState(null)
  const [zoneModalTarget,  setZoneModalTarget]  = useState(undefined) // undefined=닫힘, null=신규, zone=수정
  const { zoneCapabilities, refetchZone, updateZoneAvailable } = useCapabilities()

  const update = (key, value) => { setSaved(false); setConfig(prev => ({ ...prev, [key]: value })) }

  // ─── 구역 핸들러 ───────────────────────────────────────────────────────────
  const handleZoneSave = (updatedZone) => {
    setSaved(false)
    setConfig(prev => {
      const exists = prev.zones.some(z => z.id === updatedZone.id)
      const next = {
        ...prev,
        zones: exists
          ? prev.zones.map(z => z.id === updatedZone.id ? updatedZone : z)
          : [...prev.zones, updatedZone],
      }
      saveFarmConfig(next)  // 구역 변경은 즉시 localStorage에 반영
      return next
    })
    setZoneModalTarget(undefined)
    // 모듈 캐시 무효화 → 다음 폴링에서 제어기+양액기 데이터 즉시 재조회
    clearZoneCache(updatedZone.id)
    // zoneCapabilities 즉시 동기화 → KPI 모달 isAvailable 반영
    updateZoneAvailable(updatedZone.id, updatedZone.apiConfig?.availableFields ?? [])
  }

  const handleZoneDeleteConfirm = () => {
    setSaved(false)
    setConfig(prev => ({ ...prev, zones: prev.zones.filter(z => z.id !== pendingDeleteId) }))
    // 서버 zone_config.json에서도 제거
    fetch(`/api/admin/zone/${pendingDeleteId}`, { method: 'DELETE' }).catch(() => {})
    setPendingDeleteId(null)
  }

  const handleReconnect = async (zone) => {
    const result = await refetchZone(zone)
    if (result.success) {
      // capabilities 재확인 성공 → apiConfig 업데이트
      setConfig(prev => ({
        ...prev,
        zones: prev.zones.map(z =>
          z.id === zone.id
            ? { ...z, apiConfig: { ...z.apiConfig, status: 'connected', lastConnected: new Date().toISOString(), availableFields: result.fields } }
            : z
        ),
      }))
    }
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

      {/* 구역 등록 / API 연동 모달 */}
      {zoneModalTarget !== undefined && (
        <ZoneApiModal
          zone={zoneModalTarget}
          onSave={handleZoneSave}
          onClose={() => setZoneModalTarget(undefined)}
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

        {/* 구역 설정 — API 연동 포함 */}
        <section className="fsp__section">
          <h2 className="fsp__section-title">
            구역 설정
            <span className="fsp__section-count">{config.zones.length}개</span>
          </h2>

          <div className="fsp__zones">
            {config.zones.length === 0 && (
              <p className="fsp__zone-empty">등록된 구역이 없습니다. 구역을 추가하고 API를 연동해주세요.</p>
            )}
            {config.zones.map((zone, i) => (
              <ZoneRow
                key={zone.id}
                zone={zone}
                index={i}
                zoneCapState={zoneCapabilities[zone.id]}
                onEdit={() => setZoneModalTarget(zone)}
                onDelete={() => setPendingDeleteId(zone.id)}
                onReconnect={() => handleReconnect(zone)}
              />
            ))}
          </div>

          <button className="fsp-btn fsp-btn--add" onClick={() => setZoneModalTarget(null)}>
            + 구역 추가
          </button>
        </section>

        {/* 보안 설정 */}
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
