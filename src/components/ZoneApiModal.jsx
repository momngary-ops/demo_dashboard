/**
 * ZoneApiModal — 구역 등록 / API 연동 모달
 *
 * 사용처: FarmSettingsPage "+ 구역 추가" 또는 구역 행 "API 연동" 버튼
 *
 * Props:
 *   zone      : 수정 대상 구역 객체 (신규면 null)
 *   onSave    : (updatedZone) => void — 저장 완료 콜백
 *   onClose   : () => void
 */
import { useState } from 'react'
import { defaultApiConfig } from '../constants/farmSchema'
import { KPI_CANDIDATES } from '../constants/kpiCandidates'
import './ZoneApiModal.css'

const CAT_LABEL = {
  '환경·제어': '환경·제어',
  '경영':      '경영',
  '생육':      '생육',
  '노동':      '노동',
}

function groupFields(fields) {
  const kpiMap = Object.fromEntries(KPI_CANDIDATES.map(c => [c.id, c]))
  const groups = {}
  for (const f of fields) {
    const kpi = kpiMap[f]
    const cat = kpi?.category ?? '기타'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push({ id: f, icon: kpi?.icon ?? '', title: kpi?.title ?? f })
  }
  return groups
}

export default function ZoneApiModal({ zone, onSave, onClose }) {
  const isNew = !zone

  const [label, setLabel] = useState(zone?.label ?? '')
  const [controllerUrl, setControllerUrl] = useState(zone?.apiConfig?.controllerUrl ?? '')
  const [nutrientUrl,   setNutrientUrl]   = useState(zone?.apiConfig?.nutrientUrl ?? '')

  // 테스트 상태
  const [testing,    setTesting]    = useState(false)
  const [testResult, setTestResult] = useState(null)  // { controller, nutrient } | null
  const [testError,  setTestError]  = useState(null)

  // 저장 완료 조건: 이름 입력 + 제어기 테스트 성공
  const canSave = label.trim() && testResult?.controller?.success

  const handleTest = async () => {
    if (!controllerUrl.trim()) return
    setTesting(true)
    setTestResult(null)
    setTestError(null)
    try {
      const res = await fetch('/api/admin/zone/test', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          controllerUrl: controllerUrl.trim(),
          nutrientUrl:   nutrientUrl.trim() || null,
        }),
      })
      const data = await res.json()
      setTestResult(data)
    } catch (e) {
      setTestError('서버 연결 실패: ' + e.message)
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (!canSave) return

    // zone ID: 기존이면 유지, 신규면 타임스탬프 기반
    const zoneId = zone?.id ?? `Z-${Date.now()}`

    // 제어기 + 양액기 필드 합집합
    const ctrlF = testResult?.controller?.success ? (testResult.controller.fields ?? []) : []
    const nutF  = testResult?.nutrient?.success   ? (testResult.nutrient.fields   ?? []) : []
    const allF  = [...new Set([...ctrlF, ...nutF])]

    // 서버 zone_config.json에 저장
    try {
      await fetch('/api/admin/zone', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          zoneId,
          name:            label.trim(),
          controllerUrl:   controllerUrl.trim() || null,
          nutrientUrl:     nutrientUrl.trim()   || null,
          availableFields: allF,
        }),
      })
    } catch (e) {
      console.warn('[ZoneApiModal] zone_config 저장 실패 (서버 미응답)', e)
    }

    // farmSchema의 zone 객체 반환 (부모가 state에 반영)
    const updatedZone = {
      ...(zone ?? {}),
      id:    zoneId,
      label: label.trim(),
      apiConfig: {
        ...defaultApiConfig(),
        ...(zone?.apiConfig ?? {}),
        controllerUrl:   controllerUrl.trim(),
        nutrientUrl:     nutrientUrl.trim(),
        status:          testResult?.controller?.success ? 'connected' : 'disconnected',
        lastConnected:   testResult?.controller?.success ? new Date().toISOString() : null,
        availableFields: allF,
        errorMessage:    testResult?.controller?.success ? null : (testResult?.controller?.error ?? null),
      },
    }
    onSave(updatedZone)
  }

  const ctrlFields  = testResult?.controller?.success ? testResult.controller.fields  : []
  const nutriFields = testResult?.nutrient?.success   ? testResult.nutrient.fields    : []
  const allFields   = [...new Set([...ctrlFields, ...nutriFields])]
  const grouped     = allFields.length ? groupFields(allFields) : null

  return (
    <div className="zam-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="zam">
        {/* 헤더 */}
        <div className="zam__header">
          <span className="zam__title">{isNew ? '구역 추가' : `${zone.label} 수정`}</span>
          <button className="zam__close" onClick={onClose}>✕</button>
        </div>

        <div className="zam__body">
          {/* 구역 이름 */}
          <div className="zam__field">
            <label className="zam__label">구역 이름 <span className="zam__required">*</span></label>
            <input
              className="zam__input"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="예: 1구역"
              autoFocus
            />
          </div>

          {/* 제어기 URL */}
          <div className="zam__field">
            <label className="zam__label">
              제어기 URL <span className="zam__required">*</span>
            </label>
            <input
              className="zam__input zam__input--url"
              value={controllerUrl}
              onChange={e => { setControllerUrl(e.target.value); setTestResult(null) }}
              placeholder="예: http://api.gcsmagma.com/gcs_my_api.php/Get_GCS_Data/tasmart/1"
              spellCheck={false}
            />
            <span className="zam__hint">구역 제어기의 데이터 API 주소를 입력하세요.</span>
          </div>

          {/* 양액기 URL */}
          <div className="zam__field">
            <label className="zam__label">양액기 URL <span className="zam__optional">(선택)</span></label>
            <input
              className="zam__input zam__input--url"
              value={nutrientUrl}
              onChange={e => { setNutrientUrl(e.target.value); setTestResult(null) }}
              placeholder="예: http://api.gcsmagma.com/gcs_my_api.php/Get_GCS_Data/nutrient/1"
              spellCheck={false}
            />
            <span className="zam__hint">여러 구역이 같은 양액기를 공유하면 동일한 URL을 입력하세요.</span>
          </div>

          {/* 연결 테스트 버튼 */}
          <button
            className={`zam__test-btn ${testing ? 'zam__test-btn--loading' : ''}`}
            onClick={handleTest}
            disabled={!controllerUrl.trim() || testing}
          >
            {testing ? '연결 확인 중...' : '연결 테스트'}
          </button>

          {/* 테스트 결과 */}
          {testError && (
            <div className="zam__result zam__result--error">
              ❌ {testError}
            </div>
          )}

          {testResult && (
            <div className={`zam__result ${testResult.controller?.success ? 'zam__result--ok' : 'zam__result--error'}`}>
              {testResult.controller?.success ? (
                <>
                  <div className="zam__result-head">
                    ✅ 제어기 연결 성공 — {testResult.controller.fieldCount}개 필드 확인됨
                    {testResult.nutrient?.success && (
                      <span className="zam__result-sub"> · 양액기 {testResult.nutrient.fieldCount}개 필드</span>
                    )}
                  </div>
                  {grouped && (
                    <div className="zam__result-groups">
                      {Object.entries(grouped).map(([cat, items]) => (
                        <div key={cat} className="zam__result-group">
                          <span className="zam__result-cat">{CAT_LABEL[cat] ?? cat} {items.length}개</span>
                          <div className="zam__result-chips">
                            {items.map(f => (
                              <span key={f.id} className="zam__result-chip">
                                {f.icon} {f.title}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <span>❌ 제어기 연결 실패: {testResult.controller?.error}</span>
              )}
              {testResult.nutrient && !testResult.nutrient.success && (
                <div className="zam__result-sub-err">⚠ 양액기 연결 실패: {testResult.nutrient.error}</div>
              )}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="zam__footer">
          <button className="zam__btn zam__btn--cancel" onClick={onClose}>취소</button>
          <button
            className="zam__btn zam__btn--save"
            onClick={handleSave}
            disabled={!canSave}
            title={!canSave ? '구역 이름 입력 후 연결 테스트를 통과해야 등록이 완료됩니다.' : undefined}
          >
            {isNew ? '구역 등록 완료' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
