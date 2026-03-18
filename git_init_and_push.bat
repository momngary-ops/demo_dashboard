@echo off
chcp 65001 > nul
echo ====================================
echo  스마트팜 대시보드 Git 초기화 및 업로드
echo ====================================

cd /d "E:\2026\플랫폼 기획 mockup\dashboard"

:: Git 초기화
git init
git branch -M main

:: .gitignore 확인 (node_modules 제외)
echo node_modules/ > .gitignore
echo dist/ >> .gitignore
echo .env >> .gitignore
echo .env.local >> .gitignore

:: 스테이징
git add .
git status

:: 커밋
git commit -m "feat: 스마트팜 관제 대시보드 초기 구현

- react-grid-layout 기반 20컬럼 드래그/리사이즈 위젯 그리드
- 6방향 리사이즈 핸들 (legacy API 적용)
- TopBanner 헤드위젯: 날씨 배경 + 구역탭 + KPI 카드 5슬롯
- WeatherBackground: 8가지 날씨 조건별 동적 배경
- VariableMetricCard: 9가지 dataStatus 분기 렌더링
- Sparkline: 순수 SVG Catmull-Rom 곡선
- KpiSelectorModal: 15개 후보 중 5개 슬롯 선택
- 계층별 작업 문서 (docs/) 추가"

echo.
echo ====================================
echo  원격 저장소 주소를 입력하세요.
echo  예: https://github.com/username/repo.git
echo ====================================
set /p REMOTE_URL="GitHub URL: "

git remote add origin %REMOTE_URL%
git push -u origin main

echo.
echo 완료!
pause
