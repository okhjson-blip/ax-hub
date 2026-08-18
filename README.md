# AX Hub — Consulting OS

AX 컨설팅 지식운영체제. 홈에서 과제 현황을 보고, 과제·프롬프트·Vibe Coding·Best Practice를 라이브러리로 축적한다.

- 로컬: http://127.0.0.1:3090
- 프로덕션: https://ax-hub-share.vercel.app
- 기본 모드는 **공유(읽기)**. 사이트 진입 시 접근 비밀번호(`ax2026h2`)가 필요하고, 쓰기는 관리자 로그인 후만 가능.

관련 문서: [개발 계획서](docs/개발-계획서.md) · [UX 시나리오 설계서](docs/UX-시나리오-설계서.md) · [UI 디자인 설계서](docs/UI-디자인-설계서.md) · [배포 가이드](docs/DEPLOY.md)

## 무엇을 하는가

| 화면 | 역할 |
|------|------|
| 홈 | ax-pjt-dashboard 과제 KPI·요약·정체 리스크. 관리자는 현황 업데이트·과제 Library 이관 |
| 과제 Library | STATIK L1~L4, AX 성과지표, As-Is/To-Be 프로세스 |
| 프롬프트 Library | 템플릿·변수·TXT 업로드, STATIK 분류 |
| Vibe Coding Library | readme / 개발 계획서 / UX 시나리오 / UI 디자인 / 기타 문서 묶음 |
| Best Practice Library | PDF·PNG를 Gemini가 개조식 요약. 분야 11개 택일, 핵심 키워드 태그 5개 |

## 아키텍처

```
브라우저 (public/) ──Express──► API (backend/src, Vercel api/index.js)
                                  │
                                  ├─ SUPABASE_*            ax-hub Library (hub_*)
                                  ├─ DASHBOARD_SUPABASE_*  ax-pjt-dashboard 소스
                                  ├─ Storage hub-assets    PDF/PNG
                                  └─ Gemini                Best Practice 분석
```

홈 KPI는 대시보드 DB를 **읽고**, `GET /api/hub-summary` 때 ax-hub 대시보드 테이블에 **미러링**한다. 라이브러리 CRUD는 ax-hub `hub_*`만 사용한다. 프론트에는 anon/publishable key를 넣지 않고, 서버 service role만 쓴다.

## 스택

- UI: 정적 HTML/CSS/JS (`public/`), Pretendard
- API: Node 18+, Express 4, Multer
- DB: Supabase Postgres + RLS (anon 정책 없음)
- AI: `@google/generative-ai`, 기본 `gemini-3.5-flash-lite`
- 배포: Vercel Serverless (`api/index.js`, Framework Other)

## 디렉터리

```
api/index.js              Vercel 엔트리
backend/src/              Express 앱·라우트·도메인
public/                   SPA (index.html, css, js)
supabase/migrations/      hub_* + 대시보드 소스 스키마
docs/                     계획·UX·UI·배포
```

## 로컬 실행

```bash
cp .env.example .env
# SUPABASE_URL, SUPABASE_SECRET_KEY
# DASHBOARD_SUPABASE_URL, DASHBOARD_SUPABASE_SECRET_KEY
# ADMIN_PASSWORD, DATABASE_URL (마이그레이션용)

npm install
npm run db:migrate
npm run db:verify
npm start
# http://127.0.0.1:3090
```

`GET /api/health` → `db: "supabase"`, `supabaseConfigured: true`.

관리자 비밀번호 기본값은 `admin2026` (`.env`의 `ADMIN_PASSWORD`). 프로덕션에서는 반드시 변경한다.

## 환경변수

| 변수 | 용도 |
|------|------|
| `SUPABASE_URL` / `SUPABASE_SECRET_KEY` | ax-hub Library |
| `DASHBOARD_SUPABASE_URL` / `DASHBOARD_SUPABASE_SECRET_KEY` | 홈 대시보드 소스 |
| `ADMIN_PASSWORD` / `ADMIN_TOKEN_SECRET` | 관리자 로그인·토큰 서명 |
| `ACCESS_PASSWORD` | 홈 진입 전 접근 비밀번호 (기본 `ax2026h2`) |
| `DATABASE_URL` | 로컬 마이그레이션만 |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Best Practice 분석 (UI에서도 등록 가능) |

별칭: `SUPABASE_SERVICE_ROLE_KEY` ↔ `SUPABASE_SECRET_KEY`. 상세는 `.env.example`, 배포는 [docs/DEPLOY.md](docs/DEPLOY.md).

## API 요약

읽기(공유 가능): `GET /api/health`, `/hub-summary`, `/task-assets`, `/prompts`, `/vibe-docs`, `/cases`, `/cases/:id/pdf`

쓰기(관리자 Bearer): 각 라이브러리 POST/PATCH/DELETE, `POST /api/task-assets/import`, `POST /api/cases/analyze`, `POST /api/gemini/key`

`POST /api/cases/analyze`는 PDF 또는 PNG(≤15MB). Gemini가 개조식 요약·분야 택일·태그 5개를 채운 뒤 `published`로 저장한다.

## 데이터

Library: `hub_task_assets`, `hub_prompts`, `hub_vibe_docs`, `hub_cases`, `hub_settings`

홈 미러: `companies`, `participants`, `tasks`, `app_meta`, `task_weekly_reports`

Storage: private 버킷 `hub-assets` (`application/pdf`, `image/png`)
