# 07. 배포 & 운영 가이드

> 버전: v2.2.3 | 작성일: 2026-03-30

---

## 1. 서버 정보

| 항목 | 값 |
|------|-----|
| 서버 IP | `223.130.138.59` |
| 배포 경로 | `/var/www/dashboard/` |
| 정적 파일 | `/var/www/dashboard/dist/` |
| Python 가상환경 | `/var/www/dashboard/venv/` |
| 운영 DB | `/var/www/dashboard/data_log.db` |
| 설정 파일 | `/var/www/dashboard/zone_config.json` 등 |

---

## 2. systemd 서비스: dashboard-api.service

```ini
[Unit]
Description=Dashboard FastAPI Server
After=network.target

[Service]
User=root
WorkingDirectory=/var/www/dashboard
ExecStartPre=/bin/bash -c 'fuser -k 8000/tcp || true'
ExecStart=/var/www/dashboard/venv/bin/uvicorn mock_data_server:app \
          --host 0.0.0.0 --port 8000 --workers 1
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

> `ExecStartPre`: 포트 8000 선점 프로세스 자동 종료 포함.

**서비스 관리 명령어:**
```bash
systemctl status dashboard-api
systemctl restart dashboard-api
systemctl stop dashboard-api
journalctl -u dashboard-api -f   # 실시간 로그
```

---

## 3. 충돌 서비스 목록 (stop + disable 필수)

포트 8000을 선점하는 레거시 서비스들:

```bash
systemctl stop    mock_data_server mock-data-server smartfarm smartfarm-api
systemctl disable mock_data_server mock-data-server smartfarm smartfarm-api
```

| 서비스명 | venv 경로 | 비고 |
|---------|----------|------|
| `mock_data_server.service` | `/root/v/bin/uvicorn` | 레거시 |
| `mock-data-server.service` | `/var/www/venv/bin/uvicorn` | 레거시 |
| `smartfarm.service` | `/root/v/bin/uvicorn` | 레거시 |
| `smartfarm-api.service` | `/root/v/bin/uvicorn` | 레거시 |

---

## 4. nginx 리버스 프록시 설정

```nginx
server {
    listen 80;
    server_name 223.130.138.59;

    root /var/www/dashboard/dist;
    index index.html;

    # React SPA — 모든 경로를 index.html로 fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # FastAPI 리버스 프록시
    location /api/ {
        proxy_pass         http://localhost:8000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_read_timeout 30s;
    }
}
```

**nginx 명령어:**
```bash
nginx -t                      # 설정 문법 검사
systemctl reload nginx        # 무중단 설정 적용
systemctl restart nginx       # 강제 재시작
```

---

## 5. 배포 흐름

```
[로컬 개발 PC]
  1. git push origin main
       → 로컬 변경사항 Git 저장소에 push

  2. npm run build
       → /dashboard/dist/ 빌드 생성

  3. SCP dist/ 전송
       scp -i C:\sshkeys\key.pem -r dist/ root@223.130.138.59:/var/www/dashboard/

  4. 권한 설정 + nginx reload
       ssh -i C:\sshkeys\key.pem root@223.130.138.59 \
         "chmod -R 755 /var/www/dashboard/dist && systemctl reload nginx"
```

**전체 1-liner (PowerShell):**
```powershell
# C:\sshkeys\key.pem 경로 사용 (한글 경로 우회)
cd "C:\Users\박찬형\Desktop\플랫폼 mock-up\dashboard"
npm run build
scp -i C:\sshkeys\key.pem -r dist/ root@223.130.138.59:/var/www/dashboard/
ssh -i C:\sshkeys\key.pem root@223.130.138.59 "chmod -R 755 /var/www/dashboard/dist && systemctl reload nginx"
```

> `/배포` 스킬을 사용하면 위 흐름이 자동으로 실행됨.

---

## 6. PEM 키 관리

| 항목 | 값 |
|------|-----|
| 키 파일 경로 | `C:\sshkeys\key.pem` |
| 이유 | 한글 경로 (`C:\Users\박찬형\...`)에 PEM 키 배치 시 SSH 클라이언트 오류 발생 |

**한글 경로 문제 우회 방법:**
- PEM 파일을 `C:\sshkeys\` 등 ASCII 경로에 보관
- 또는 `%USERPROFILE%\.ssh\` 사용 (OpenSSH 기본 위치)

---

## 7. 롤백 방법

```bash
# 1. 서버에서 이전 dist 백업 확인
ssh -i C:\sshkeys\key.pem root@223.130.138.59 "ls /var/www/dashboard/"

# 2. 로컬에서 이전 커밋 체크아웃 후 재빌드
git log --oneline -10
git checkout <이전 커밋 해시>
npm run build

# 3. 빌드된 dist 재배포
scp -i C:\sshkeys\key.pem -r dist/ root@223.130.138.59:/var/www/dashboard/
ssh -i C:\sshkeys\key.pem root@223.130.138.59 "systemctl reload nginx"

# 4. main 브랜치로 복귀
git checkout main
```

---

## 8. 서버 점검 체크리스트

```bash
# 서비스 상태
systemctl status dashboard-api
systemctl status nginx

# 포트 확인
ss -tlnp | grep 8000
ss -tlnp | grep 80

# API 응답 확인
curl http://localhost:8000/api/capabilities

# DB 크기 확인 (454MB 정상)
du -sh /var/www/dashboard/data_log.db

# nginx 에러 로그
tail -20 /var/log/nginx/error.log

# FastAPI 로그
journalctl -u dashboard-api --since "1 hour ago"
```

---

## 9. 개발 환경 (로컬)

```bash
# 백엔드 실행
cd "C:\Users\박찬형\Desktop\플랫폼 mock-up\dashboard"
python mock_data_server.py   # 또는 uvicorn mock_data_server:app --reload

# 프론트엔드 개발 서버
npm run dev   # http://localhost:5173
# vite.config.js의 proxy 설정으로 /api/ → localhost:8000 자동 중계

# 빌드
npm run build   # dist/ 생성
npm run preview # 빌드 결과 미리보기 (http://localhost:4173)
```
