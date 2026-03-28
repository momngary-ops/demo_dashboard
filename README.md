# 스마트팜 관제 대시보드

## TODO

- [ ] **농장명 편집 기능 구현** — 현재 `src/components/TopBanner/TopBanner.jsx`의 `FARM_NAME` 상수로 하드코딩됨.
  설정 페이지 또는 인라인 편집(클릭 → input) UI를 통해 사용자가 변경할 수 있어야 하며, 변경값은 localStorage 또는 백엔드 API에 저장되어야 함.

---

# React + Vite (boilerplate)

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
