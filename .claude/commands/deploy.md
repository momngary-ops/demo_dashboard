로컬 변경사항을 git push한 뒤, 서버 배포 명령어를 순서대로 안내해줘.

1. 먼저 `git status`로 커밋되지 않은 변경사항이 있는지 확인하고, 있으면 커밋 여부를 물어봐.
2. `git push origin main`으로 푸시해줘.
3. 그 다음 서버(223.130.138.59)에서 실행할 명령어를 순서대로 출력해줘:

```
cd /var/www/dashboard
git pull
npm run build
```

4. 서버 명령어 실행 후 브라우저에서 Ctrl+Shift+R로 강력 새로고침하라고 안내해줘.
