로컬 변경사항을 git push한 뒤, 서버에 SSH로 접속해서 배포 명령어를 순서대로 안내해줘.

⚠️ 절대 금지: data_log.db, data_log.db-shm, data_log.db-wal 파일은 SCP로 서버에 전송하지 말 것.
서버의 data_log.db는 실제 운영 데이터 누적 파일이며, 로컬 파일로 덮어쓰면 데이터 전체 손실 발생.

배포 순서:

1. 먼저 `git status`로 커밋되지 않은 변경사항이 있는지 확인하고, 있으면 커밋 여부를 물어봐.
2. `git push origin main`으로 푸시해줘.
3. 서버에서 아래 명령어를 순서대로 실행하라고 안내해줘. (한 번에 복붙 가능하도록 각각 별도 코드블록으로 출력)

Step 1. DB 보호 확인
```
ssh root@223.130.138.59 "python3 -c \"import os; p='/var/www/dashboard/data_log.db'; mb=os.path.getsize(p)/1024/1024 if os.path.exists(p) else 0; print(f'[OK] data_log.db {mb:.0f} MB' if mb > 1 else '[경고] DB 크기 이상')\""
```

Step 2. 코드 업데이트 + 프론트엔드 빌드
```
ssh root@223.130.138.59 'export PATH=/root/.nvm/versions/node/v24.14.0/bin:$PATH && cd /var/www/dashboard && git pull && npm run build'
```

Step 3. 서비스 재시작
```
ssh root@223.130.138.59 "systemctl restart dashboard-api && systemctl reload nginx && echo 'Deploy complete'"
```

4. 모든 단계 완료 후 브라우저에서 Ctrl+Shift+R로 강력 새로고침하라고 안내해줘.
