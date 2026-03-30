로컬 변경사항을 git push한 뒤, 서버 배포 명령어를 순서대로 안내해줘.

⚠️ 절대 금지: data_log.db, data_log.db-shm, data_log.db-wal 파일은 SCP로 서버에 전송하지 말 것.
서버의 data_log.db는 실제 운영 데이터 누적 파일이며, 로컬 파일로 덮어쓰면 데이터 전체 손실 발생.
배포 전 반드시 아래 확인 단계를 포함할 것.

1. 먼저 `git status`로 커밋되지 않은 변경사항이 있는지 확인하고, 있으면 커밋 여부를 물어봐.
2. `git push origin main`으로 푸시해줘.
3. 그 다음 서버(223.130.138.59)에서 실행할 명령어를 순서대로 출력해줘:

```
# DB 보호 확인 (배포 전 반드시 실행)
python3 -c "
import os
p = '/var/www/dashboard/data_log.db'
if os.path.exists(p):
    mb = os.path.getsize(p) / 1024 / 1024
    print(f'[OK] data_log.db 크기: {mb:.1f} MB — 보호됨')
else:
    print('[경고] data_log.db 없음')
"

cd /var/www/dashboard
git pull
npm run build
```

4. 서버 명령어 실행 후 브라우저에서 Ctrl+Shift+R로 강력 새로고침하라고 안내해줘.
