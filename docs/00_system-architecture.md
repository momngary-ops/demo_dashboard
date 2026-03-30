# 00. 전체 시스템 아키텍처

> 버전: v2.2.3 | 작성일: 2026-03-30 | 대상 환경: 베어메탈 서버 + 클라우드 이전 계획

---

## 1. 현재 운영 환경 (베어메탈)

```
[클라이언트 브라우저]
  http://223.130.138.59
         |
         | HTTP :80
         v
[nginx / 223.130.138.59:80]
  location /        -> /var/www/dashboard/dist/  (React SPA 정적 파일)
  location /api/    -> proxy_pass localhost:8000
         |
         | HTTP :8000 (localhost only)
         v
[FastAPI / uvicorn / dashboard-api.service]
  /var/www/dashboard/mock_data_server.py
  venv: /var/www/dashboard/venv/
  |
  |-- 백그라운드 루프: _log_zone_data_loop (5분 주기)
  |-- 백그라운드 루프: _alert_check_loop  (1분 주기)
  |-- SQLite: data_log.db (454MB, 운영 누적 데이터)
  |-- zone_config.json       (구역 API 설정)
  |-- guidelines.json        (월별 KPI 기준선 + 알림 설정)
  |-- dashboard_settings.json (대시보드 UI 설정)
         |
         | HTTP (외부망 요청)
    -----+-----
    |         |
    v         v
[제어기 API]  [양액기 API]
(controllerUrl per zone)
(nutrientUrl per zone)
```

---

## 2. 클라우드 이전 후 목표 구성 (NCP / AWS / GCP VM)

```
[클라이언트 브라우저]
  https://도메인명 (:443)
         |
         | HTTPS (SSL: Let's Encrypt + certbot)
         v
[nginx / 클라우드 VM :80 → :443]
  location /        -> /var/www/dashboard/dist/
  location /api/    -> proxy_pass localhost:8000
         |
         | HTTP :8000 (localhost only)
         v
[FastAPI / uvicorn / dashboard-api.service]
  (동일 구조 유지 — 코드 변경 없음)
  |
  |-- SQLite: data_log.db
  |       └─ 클라우드 Object Storage에 일 1회 백업 (cron)
  |-- 설정 파일: zone_config.json / guidelines.json 등
         |
         | HTTP (외부망)
    -----+-----
    |         |
    v         v
[제어기 API]  [양액기 API]

[CI/CD: GitHub Actions]
  push main → npm run build → SCP dist/ → SSH systemctl reload
```

---

## 3. 포트 매핑 & 서비스 의존성

| 포트 | 서비스 | 설명 |
|------|--------|------|
| `:80` | nginx | 정적 파일 서빙 + `/api/` 리버스 프록시 |
| `:443` | nginx (클라우드 이전 후) | SSL 종단 |
| `:8000` | FastAPI / uvicorn | REST API 서버 (localhost only) |

**서비스 의존성:**
```
nginx (active)
  └── depends on: dashboard-api.service (active)
        └── depends on: data_log.db (SQLite, /var/www/dashboard/)
              └── depends on: zone_config.json, guidelines.json
```

**충돌 서비스 (stop + disable 필수):**
```
mock_data_server.service   ← venv: /root/v/bin/uvicorn      (port 8000 충돌)
mock-data-server.service   ← venv: /var/www/venv/bin/uvicorn (port 8000 충돌)
smartfarm.service          ← venv: /root/v/bin/uvicorn      (port 8000 충돌)
smartfarm-api.service      ← venv: /root/v/bin/uvicorn      (port 8000 충돌)
```

---

## 4. 데이터 저장소 위치

| 파일 | 경로 | 용도 |
|------|------|------|
| `data_log.db` | `/var/www/dashboard/data_log.db` | SQLite KPI 로그 (5분 주기, 누적) |
| `zone_config.json` | `/var/www/dashboard/zone_config.json` | 구역별 API URL + 발견 필드 목록 |
| `guidelines.json` | `/var/www/dashboard/guidelines.json` | 월별 KPI 기준선 12×24 매트릭스 |
| `dashboard_settings.json` | `/var/www/dashboard/dashboard_settings.json` | 대시보드 UI 설정 |

> **주의:** `data_log.db`는 `.gitignore`에 포함됨. 배포 시 `git pull` 또는 SCP로 덮어쓰이지 않도록 주의.
> 운영 서버 파일 크기 454MB — 비정상적으로 작을 경우 덮어쓰기 사고를 의심할 것.

---

## 5. 기술 스택 버전

| 구분 | 기술 | 버전 |
|------|------|------|
| Frontend 번들러 | Vite | 8.0.0 |
| Frontend 프레임워크 | React | 19.2.4 |
| 그리드 레이아웃 | react-grid-layout | 2.2.2 |
| 차트 | recharts | 3.8.0 |
| 아이콘 | lucide-react | 0.577.0 |
| Backend 프레임워크 | FastAPI | - |
| ASGI 서버 | uvicorn | - |
| 데이터베이스 | SQLite3 | - |
| 웹 서버 | nginx | - |
| Python | - | 3.11 (권장) |
| Node.js | nvm 관리 | v24 (권장) |

---

## 6. 마이그레이션 체크리스트

```
[ 이전 전 ]
  [ ] data_log.db SCP 백업 (로컬 + 신규 서버로 이전)
        scp -i C:\sshkeys\key.pem root@223.130.138.59:/var/www/dashboard/data_log.db ./
  [ ] zone_config.json 백업
  [ ] guidelines.json 백업
  [ ] dashboard_settings.json 백업
  [ ] Teams Webhook URL 메모 (guidelines.json 내 alertConfig.webhookUrl)

[ 신규 서버 설정 ]
  [ ] Node.js (nvm v24) 설치
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
        nvm install 24
  [ ] Python 3.11 + venv 구성
        python3.11 -m venv /var/www/dashboard/venv
        /var/www/dashboard/venv/bin/pip install fastapi uvicorn aiohttp aiofiles
  [ ] /var/www/dashboard/ 디렉토리 구성 및 파일 배치
  [ ] dashboard-api.service 등록 및 활성화
        systemctl enable --now dashboard-api
  [ ] nginx 설치 + 리버스 프록시 설정
  [ ] certbot SSL 인증서 발급 (도메인 연결 후)
        certbot --nginx -d 도메인명
  [ ] GitHub Actions SSH Key 등록 (배포 자동화 시)

[ 이전 후 확인 ]
  [ ] data_log.db 무결성 확인 (파일 크기 MB 단위 확인)
  [ ] Teams Webhook URL 재설정 (가이드라인 설정 페이지)
  [ ] 각 구역 API URL 접근 가능 여부 확인 (FarmSettings → 연결 테스트)
  [ ] KPI 폴링 정상 수신 확인 (대시보드 데이터 상태 표시)
  [ ] 배포 파이프라인 테스트 (main push → 자동 반영)
```
