# 스마트팜 관제 대시보드 — 프로젝트 현황 총괄

> **버전**: 2.1.0
> **최종 업데이트**: 2026-03-27
> **서버**: http://223.130.138.59
> **기술 스택**: React 19 + Vite 8 + FastAPI (Python) + SQLite

---

## 1. 프로젝트 개요

스마트팜 환경 데이터(온도·습도·CO₂ 등)를 실시간 모니터링하는 관제 대시보드.
구역(Zone) 단위 KPI 관리, 임계치 이탈 알림, Teams 연동, 위젯 그리드 커스터마이징을 핵심 기능으로 한다.

### 데이터 카테고리

| 카테고리 | 필드 수 | 주요 내용 |
|---|---|---|
| 환경 (Climate) | 67개 (001–067) | 온도·습도·CO₂·광량·EC/pH 등 |
| 생육 (Growth) | 10개 (068–078) | 초장·경경·엽수·화방·과실 등 |
| 메타데이터 | 21개 (201–221) | 농장·구역 설정 정보 |
| 경영 (Farm Managing) | 35개 (100–134) | 매출·출하·인건비 등 |
| 노동 (Labor) | 308개 (301–608) | 작업별 투입 인원·시간 |

---

## 2. 기술 스택

### 프론트엔드
| 항목 | 버전 | 용도 |
|---|---|---|
| React | 19.2.4 | UI 프레임워크 |
| Vite | 8.0 | 빌드·개발서버 |
| react-grid-layout | 2.2.2 | 위젯 드래그 그리드 |
| Recharts | 3.8.0 | 차트 (멀티라인) |
| lucide-react | 0.577.0 | 아이콘 |

### 백엔드 (Mock)
- **FastAPI** + Uvicorn — `/api/*` 엔드포인트 제공
- **SQLite** (`data_log.db`) — KPI 로그 5분 주기 저장
- **단일 인스턴스 잠금** — `.server.lock` 파일 (fcntl)

### 상태관리
- React Context API (Redux/Zustand 없음)
- localStorage — 농장 설정(`farm:config`), TopBanner 슬롯(`topbanner:slots`), 이탈 누적(`deviation:{slotId}:{YYYY-MM-DD}`)

---

## 3. 아키텍처 — 데이터 흐름

```
구역 등록 (FarmSettingsPage)
  → localStorage 저장 (farm:config)
  → CapabilitiesContext.updateZoneAvailable
  → DashboardPage: firstZoneId 결정
  → useKpiPolling → /api/zone/{id}/climate · controller
  → buildSlot → resolveKpiStatus
  → Widget / TopBanner KPI 카드 렌더
```

### 레이아웃 구조
```
App.jsx
├── Sidebar (56px 접힘 / 200px 펼침 토글)
├── Header (56px 고정)
└── Page Content
    ├── DashboardPage    → react-grid-layout 20컬럼 그리드
    ├── FarmSettingsPage → 농장·구역 설정
    ├── GrowthDataInputPage → 생육 수동 입력
    └── GuidelineSettingsPage → 임계치·알림 설정
```

---

## 4. 위젯 시스템

### 위젯 타입 (5종)

| 타입 | 기본 크기 | 내용 |
|---|---|---|
| `chart-main` | 4×3 | 스파크라인 + 수치값 (9개 KPI) |
| `stat` | 5×4 | 통계값 3개 |
| `chart` | 5×4 | Recharts 멀티라인 차트 |
| `gauge-set` | 5×4 | 액추에이터 제어 (창/커튼/밸브) |
| `status-panel` | 5×4 | On/Off 상태 표시 (장치/보조/냉난방) |

### KPI 상태 표시 (Traffic Light)
| 색상 | 상태 코드 | 의미 |
|---|---|---|
| 회색 | `SENSOR_LOST`, `NO_API` | 미설정 / 미연동 |
| 초록 | `OK` | 정상 |
| 주황 | `WARN` | 경고 |
| 빨강 | `CRIT` | 위험 |

### 스파크라인 SVG
- Catmull-Rom 스플라인 → Bézier 곡선 변환
- 이전 버전 참고: `_작업노트/대시보드위젯/202603251710_대시보드위젯.md`

---

## 5. TopBanner (헤드 위젯)

- **구역 탭** (ZoneTabs): 등록된 구역 전환
- **고정 카드** (FixedMetricCard): 날씨 등 고정 지표
- **가변 카드** (VariableMetricCard): 사용자 선택 KPI 5슬롯
- **localStorage 키**: `topbanner:slots`
- **기본 KPI**: `xintemp1`, `xinhum1`, `xco2`, `xinsunadd`, `xhumlack`
- **날씨 배경** (WeatherBackground): 기상 상태 기반 배경 렌더

---

## 6. 알림 시스템 — 최종 확정 (2026-03-27)

> 상세 스펙: `_작업노트/Teams알림/202603271830_Teams알림.md`

### 알림 정책 플로우
```
이탈 감지 → 딜레이 타이머 시작
  ├─ 딜레이 내 복귀 → flapCount++
  │     flapCount < flapThreshold  → 타이머 리셋, 알림 없음
  │     flapCount >= flapThreshold → FLAPPING 발송 (인앱 + Teams)
  └─ 딜레이 경과 유지
        쿨다운 중    → 알림 없음
        쿨다운 아님  → 경고 발송 (인앱 + Teams)

정상 복귀
  ├─ cd키 있음 + 쿨다운 내 → Teams RECOVERED만 발송 (인앱 표시 없음)
  └─ cd키 없음 or 쿨다운 아님 → 알림 없음
```

### 알림 타입
| 타입 | 인앱 | Teams |
|---|---|---|
| `OUT_OF_RANGE` | ✅ | ✅ |
| `FLAPPING` | ✅ | ✅ |
| `RECOVERED` | ❌ (억제) | ✅ |
| `SENSOR_FAULT` | ✅ | ✅ |
| `SENSOR_LOST` | ✅ | ✅ |
| `NULL_DATA` | ✅ | ✅ |
| `STALE_WARN/CRIT` | ✅ | ✅ |

### FLAP_THRESHOLD 설정 위치
- GuidelineSettingsPage → 알림 섹션 → 공통 탭
- 범위: 2~10회, 기본값: 3
- `fallback: glAlertConfig?.flapThreshold ?? 3`

---

## 7. 이탈 패널 (DeviationPanel)

> 상세 스펙: `_작업노트/이탈패널/202603271500_이탈패널.md`

### 색상 정책
| 상태 | 조건 | 색상 |
|---|---|---|
| 기본 | - | 주황 (`var(--accent)` = #E5401A) |
| 위험 | 오늘 누적 ≥ 10분 OR 이탈범위 10% 초과 | 빨강 (`var(--danger)` = #e05c5c) |

**이탈범위 10% 계산식**: `이탈량 / (yMax - yMin) >= 0.1`

### 기능
- 개별 카드 닫기 (✕ 버튼) — 마지막 닫으면 패널 전체 소멸
- 오늘 누적 이탈 시간 표시 (`종료된 누적 + 현재 진행중`)
- 시간 표시: "12분", "1분 미만" (초 단위 없음)
- 자정 자동 초기화
- **localStorage 키**: `deviation:{slotId}:{YYYY-MM-DD}`

---

## 8. 버그 현황 (BUGFIX_PLAN.md 기준)

> 상세: `BUGFIX_PLAN.md`

| 우선순위 | 버그 ID | 내용 | 상태 | 수정 파일 |
|---|---|---|---|---|
| **P0** | BUG-03 | `availableFields` 대소문자 불일치 → SENSOR_LOST | ⏳ 미구현 | `ZoneApiModal.jsx` |
| **P0** | BUG-02 | 구역 삭제 시 localStorage / capabilities 미갱신 | ⏳ 미구현 | `FarmSettingsPage.jsx`, `CapabilitiesContext.jsx` |
| **P1** | BUG-01 | TopBanner farmConfig mount 스냅샷 문제 | ⏳ 미구현 | `App.jsx`, `TopBanner.jsx`, `FarmSettingsPage.jsx` |
| **P2** | BUG-04 | fetchKpi null 반환 시 NO_API → API_TIMEOUT 오표시 | ⏳ 미구현 | `useKpiPolling.js` |

### P0 BUG-03 핵심 수정 (1줄)
```js
// ZoneApiModal.jsx — allF 생성 직후 추가
const allF = [...new Set([...ctrlF, ...nutF])].map(f => f.trim().toLowerCase())
```

---

## 9. 백엔드 변경사항 (2026-03-27 확정)

> 상세: `_작업노트/확정/202603271430_mock_data_server_변경사항.md`

| 변경 | 내용 |
|---|---|
| 단일 인스턴스 잠금 | `fcntl.LOCK_EX` — 중복 실행 방지 |
| `DEFAULT_ALERT_CONFIG` | `webhookUrl` 필드 추가 |
| `_log_single_zone()` | 양액기 데이터도 SQLite 저장 |
| `_send_teams_alert()` | Teams MessageCard 비동기 POST (httpx → requests fallback) |
| `_check_zone_alert()` | 양액기 데이터 merge 후 1회 push |
| nutrient 타임아웃 | 10s → **4s** |

### 배포 전 필수 작업
```bash
# 충돌 서비스 4개 비활성화
systemctl stop mock_data_server.service mock-data-server.service smartfarm.service smartfarm-api.service
systemctl disable mock_data_server.service mock-data-server.service smartfarm.service smartfarm-api.service

# dashboard-api 서비스 하드닝
sed -i 's/Restart=always/Restart=on-failure/' /etc/systemd/system/dashboard-api.service
systemctl daemon-reload && systemctl restart dashboard-api
```

---

## 10. 페이지 구성

| 페이지 | 경로 | 주요 기능 |
|---|---|---|
| DashboardPage | `/` | 위젯 그리드, TopBanner, 이탈 패널 |
| FarmSettingsPage | `/settings` | 농장·구역 등록/수정/삭제, 알림 설정 |
| GrowthDataInputPage | `/growth-input` | 생육 데이터 수동 입력 |
| GuidelineSettingsPage | `/guidelines` | 임계치 설정, FLAP_THRESHOLD 설정 |

---

## 11. 주요 문서 위치

| 문서 | 경로 | 내용 |
|---|---|---|
| **버그 수정 기획** | `BUGFIX_PLAN.md` | 4개 버그 원인·수정 방법·검증 기준 |
| **카드 디자인 스펙** | `CARD_DESIGN_SPEC.md` | 위젯 UI/UX 전체 스펙 |
| **배포 가이드** | `배포 문서.md` | Nginx 설정, deploy.sh |
| **레이아웃 스펙** | `_작업노트/레이아웃/202603171700_레이아웃.md` | 그리드 구조, 다크테마 토큰 |
| **위젯 스펙 (최신)** | `_작업노트/대시보드위젯/202603251710_대시보드위젯.md` | 5종 위젯, 스파크라인 알고리즘 |
| **알림 정책 (최종)** | `_작업노트/Teams알림/202603271830_Teams알림.md` | FLAPPING·RECOVERED 최종 확정 |
| **이탈 패널 스펙 (최신)** | `_작업노트/이탈패널/202603271500_이탈패널.md` | 색상·글씨·개별닫기 스펙 |
| **FarmSettingsPage 확정본** | `_작업노트/확정/202603271430_FarmSettingsPage.jsx` | 406줄 완성 컴포넌트 |
| **서버 변경사항** | `_작업노트/확정/202603271430_mock_data_server_변경사항.md` | 백엔드 수정 내역 + 배포 체크리스트 |
| **데이터 스키마** | `01. DATA SCHEME/` | 각 카테고리 입력 스펙 PDF + CSV 샘플 |
| **이슈 트래킹** | `issue/` | 날짜별 스크린샷 |

---

## 12. 다음 구현 우선순위

1. **[P0] BUG-03** — `ZoneApiModal.jsx` availableFields lowercase 정규화 (1줄 수정)
2. **[P0] BUG-02** — 구역 삭제 시 `saveFarmConfig` + `removeZoneCapability` 추가
3. **[P1] BUG-01** — `App.jsx`에서 `farmConfig` state 중앙 관리 → TopBanner prop 전달
4. **[미구현] 이탈패널 v2** — 색상·글씨 개편 + 개별 닫기 + formatDuration 분 단위
5. **[미구현] BUG-04** — fetchKpi sentinel 반환으로 NO_API/API_TIMEOUT 구분
6. **[배포] 서버 반영** — mock_data_server.py 변경사항 (`_작업노트/확정/` 참고)
