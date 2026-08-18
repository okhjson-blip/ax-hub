# AX Hub 배포 가이드

## 구성

| 항목 | 경로 |
|------|------|
| UI | `public/` |
| API | `backend/src/` → Vercel `api/index.js` |
| 마이그레이션 | `supabase/migrations/*.sql` |
| env 예시 | `.env.example` |

홈은 ax-pjt-dashboard(`DASHBOARD_SUPABASE_*`)에서 **읽기** 후 ax-hub 대시보드 테이블에 **미러링**, Library는 `hub_*`에 **쓰기**(관리자 토큰).

`GET /api/hub-summary`(과제 현황 업데이트) 호출 시 소스 → hub upsert가 함께 수행됩니다.

## 필수 환경변수

| 변수 | 용도 | 비고 |
|------|------|------|
| `SUPABASE_URL` | ax-hub Library 저장소 | 서버 전용 |
| `SUPABASE_SECRET_KEY` | hub service role | 서버 전용. 프론트 노출 금지 |
| `DASHBOARD_SUPABASE_URL` | ax-pjt-dashboard 소스 | 홈 대시보드·과제 이관 읽기 |
| `DASHBOARD_SUPABASE_SECRET_KEY` | dashboard service role | 서버 전용 |
| `ADMIN_PASSWORD` | 관리자 로그인 | |
| `ACCESS_PASSWORD` | 홈 진입 전 접근 비밀번호 | 기본 `ax2026h2` |
| `ADMIN_TOKEN_SECRET` | 관리자·접근 토큰 서명 | 프로덕션에서 반드시 변경 |
| `DATABASE_URL` | 마이그레이션용 Postgres | 로컬 마이그레이션에만 필요 (Pooler 6543 권장) |
| `GEMINI_API_KEY` | Best Practice PDF 분석 | 선택. UI에서도 `hub_settings`에 저장 가능 |
| `GEMINI_MODEL` | Gemini 모델명 | 기본 `gemini-3.5-flash-lite`. 미지원 시 `gemini-flash-lite-latest` 폴백 |

별칭 지원: `SUPABASE_SERVICE_ROLE_KEY` ↔ `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY` ↔ anon.

## 로컬 실행

```bash
cp .env.example .env
# SUPABASE_URL, SUPABASE_SECRET_KEY, ADMIN_PASSWORD, DATABASE_URL 설정

node backend/src/apply-hub-migration.js
node backend/src/verify-hub-schema.js
npm install
npm start
# http://127.0.0.1:3090
```

확인: `GET /api/health` → `db: "supabase"`, `supabaseConfigured: true`

## Supabase 스키마

마이그레이션이 생성하는 테이블:

- `hub_task_assets` — 과제 Library
- `hub_prompts` — Prompt Library (+ STATIK)
- `hub_vibe_docs` — Vibe Coding Library (+ 문서 섹션)
- `hub_cases` — Best Practice (+ PDF·PNG/개조식 요약/분야 택일/태그 5)
- `hub_settings` — Gemini 키 등 앱 설정
- `companies` / `participants` / `tasks` / `app_meta` / `task_weekly_reports` — ax-pjt-dashboard 소스(홈 대시보드)

모든 `hub_*` 및 대시보드 테이블은 RLS 활성. 정책은 없음 → **anon 직접 접근 불가**, API(service role)만 사용.

대시보드 데이터 이관 (ax-pjt-dashboard `.env` → ax-hub `.env`):

```bash
npm run db:sync-dashboard
```

Storage 버킷: `hub-assets` (private, PDF·PNG). 업로드 시 없으면 생성 시도.

## Vercel

프로덕션 URL: https://ax-hub-share.vercel.app

1. 이 저장소를 Vercel에 Import (Framework Preset: **Other** — `requirements.txt` 있으면 FastAPI로 오인됨).
2. Region: `sin1` (`vercel.json`). 현재 배포 리전은 계정 기본값일 수 있음.
3. Environment Variables (Production / Preview / Development):

   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY`
   - `DASHBOARD_SUPABASE_URL`
   - `DASHBOARD_SUPABASE_SECRET_KEY`
   - `ADMIN_PASSWORD`
   - `ADMIN_TOKEN_SECRET`
   - (선택) `GEMINI_API_KEY`, `GEMINI_MODEL`

4. Deploy 후 `https://ax-hub-share.vercel.app/api/health` 확인 → `db:"supabase"`.

CLI 재배포:

```bash
npx vercel login
npx vercel link --yes --project ax-hub
npx vercel deploy --prod --yes
```

정적 UI는 Express가 `public/`을 서빙합니다. `vercel.json`의 `includeFiles`에 `public/**`이 포함되어 있어야 합니다.

### Vercel에서 주의할 점

- **에페메럴 FS**: 로컬 `uploads/`·`data/`는 배포 환경에서 유지되지 않음. PDF는 Supabase Storage, Gemini 키는 `hub_settings` 또는 env 사용.
- **PDF 분석**: `maxDuration` 300초. 대용량 PDF는 타임아웃 가능.
- `DATABASE_URL`은 Vercel에 넣지 않아도 됩니다(런타임은 supabase-js만 사용).

## API 요약

- `GET /api/health`, `GET/POST /api/auth/access`
- `GET /api/hub-summary` (접근 토큰 필요)
- `POST /api/auth/admin`
- `GET/POST /api/task-assets`, `POST /api/task-assets/import`
- CRUD `/api/prompts`, `/api/vibe-docs`, `/api/cases`
- `POST /api/cases/analyze` (multipart PDF 또는 PNG + Gemini)

## 확인 체크리스트

- [ ] `/api/health` → `db: "supabase"`
- [ ] 관리자 로그인 후 홈에서 과제 Library 이관
- [ ] 프롬프트 / Vibe 문서 등록
- [ ] (선택) PDF/PNG 분석 → Best Practice 등록·분야 택일·키워드 태그 5개
