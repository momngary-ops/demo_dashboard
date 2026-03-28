# 헤드 위젯 — KPI 카드 시스템

> 작성일: 2026-03-17

---

## 1. 카드 종류

| 카드 | 컴포넌트 | 수량 | 설명 |
|---|---|---|---|
| 외부온도 고정 카드 | `FixedMetricCard` | 1개 | 항상 표시, 항목 변경 불가 |
| KPI 가변 카드 | `VariableMetricCard` | 5개 | 사용자 선택 가능 |

---

## 2. KPI 데이터 상태 (dataStatus) — 9가지

`utils/kpiStatusResolver.js`에서 판정.

| status | 카드 배경 | 표시 내용 | 부가 요소 |
|---|---|---|---|
| `OK` | 정상 bgColor | 값 + 단위 + 스파크라인 | — |
| `LOADING` | bgColor 유지 | Skeleton pulse 3줄 | — |
| `NULL_DATA` | 회색 반투명 | "유효 데이터가 없습니다" | — |
| `SENSOR_FAULT` | 회색 반투명 | "센서 오류" | ⚠️ |
| `STALE_WARN` | 정상 bgColor | 마지막값 + 스파크라인 | 타임스탬프 🟠 |
| `STALE_CRIT` | bgColor + opacity 0.6 | 마지막값 + 스파크라인 | 🔴 타임스탬프 빨강 |
| `API_TIMEOUT` | 회색 반투명 | "연결 재시도 중..." | 로딩 스피너 |
| `NO_API` | 회색 반투명 | "준비 중" | 🔒 |
| `OUT_OF_RANGE` | 정상 bgColor | 값(빨강) + 스파크라인 | 빨간 outline |

### 판정 우선순위 (kpiStatusResolver.js)

```
1. apiId 없음          → NO_API
2. 응답 미수신         → LOADING
3. 10분 초과 미수신    → STALE_CRIT
4. 5분 초과 미수신     → STALE_WARN
5. 값이 null           → NULL_DATA
6. 물리적 불가 범위    → SENSOR_FAULT  (-999 ~ 9999 외)
7. yMin/yMax 이탈      → OUT_OF_RANGE
8. 정상                → OK
```

---

## 3. KPI 후보 풀 — 15개 (constants/kpiCandidates.js)

### 환경·제어 (6개)

| 지표 | apiId | 단위 | yMin | yMax | 색상 |
|---|---|---|---|---|---|
| 내부 온도 | `xintemp1` | °C | 10 | 40 | 🟢 #10b981 |
| 외부 온도 | `xouttemp` | °C | -15 | 40 | 🟠 #f59e0b |
| 내부 습도 | `xinhum1` | % | 0 | 100 | 🟠 #f59e0b |
| CO2 농도 | `xco2` | ppm | 300 | 1500 | 🟢 #10b981 |
| 급액 EC | `now_ec` | dS/m | 0 | 5 | 🔵 #3b82f6 |
| 급액 pH | `now_ph` | pH | 4 | 8 | 🔵 #3b82f6 |

### 생산·작업 (5개)

| 지표 | apiId | 단위 |
|---|---|---|
| 누적일사량 | `xsunadd` | MJ/m² |
| 수확량 | `daily_shipment_kg` | kg |
| 출하량 | `allocated_volume` | kg |
| 작업 완수율 | `task_rate` | % |
| 수확량 예측 | `projected_yield` | kg |

### 재무·시장 (4개)

| 지표 | apiId | 비고 |
|---|---|---|
| 도매시장가격 | `market_price_kg` | |
| 원가(단가) | `null` | 🔒 NO_API |
| 에너지비용 | `cost_electricity` | |
| 인건비 | `null` | 🔒 NO_API |

---

## 4. 기본 슬롯 구성

| 슬롯 | 지표 | 초기 status |
|---|---|---|
| Var1 | 내부 온도 | OK (24.3°C) |
| Var2 | 내부 습도 | STALE_WARN (7분 전, 주황) |
| Var3 | CO2 농도 | OK (412ppm) |
| Var4 | 출하량 | OK (1,250kg) |
| Var5 | 인건비 | NO_API (🔒) |

---

## 5. 스파크라인 (Sparkline.jsx)

- 순수 SVG `<path>` — 외부 차트 라이브러리 없음
- **Catmull-Rom → cubic bezier** 변환으로 실제 곡선 렌더링
- **현재값 중심 자동 스케일**: 마지막 데이터 포인트가 항상 수직 중앙 근처

```js
// 현재값 기준 대칭 진폭 계산
const amplitude = Math.max(
  Math.abs(current - dataMin),
  Math.abs(dataMax - current),
  Math.abs(current) * 0.04,
  0.1
) * 1.15
```

- 선 색상: 흰색 `#ffffff`, strokeWidth: 1.8
- STALE_CRIT 시 opacity: 0.4
- data 길이 < 2이면 렌더링 skip

---

## 6. KPI 선택 모달 (KpiSelectorModal.jsx)

1. 상단: 현재 활성 5개 슬롯 → `×` 버튼으로 제거
2. 하단: 15개 후보를 카테고리별 3열 그리드로 표시
3. 후보 클릭 → 빈 슬롯에 추가 (없으면 첫 슬롯 교체)
4. NO_API 항목: 회색 반투명 + 🔒, 선택은 허용
5. **적용** 버튼 → `slotConfigs` 업데이트 → useKpiPolling 재실행 (LOADING → 데이터)
