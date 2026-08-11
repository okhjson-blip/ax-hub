# AX Hub UI 디자인 설계서

기준: `public/css/app.css`, `public/index.html`. 날짜: 2026-08-11. 초기 목업(`app.html`)의 토큰·셸을 구현에 그대로 옮겼다.

## 1. 원칙

- **Consulting OS**: 장식보다 밀도. 흰 패널, 얇은 보더, 낮은 그림자.
- **읽기 우선**: 공유 모드가 기본. 쓰기 컨트롤은 관리자일 때만 나타난다.
- **한 뎁스 상세**: 모달 편집이 아니라 목록→상세 패널 전환.
- **분류는 경로로**: STATIK 브레드크럼·필터로 업무 위치를 보여 준다.

## 2. 토큰

파일: `public/css/app.css` `:root`.

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--bg` | `#f5f6f8` | 캔버스 |
| `--panel` | `#ffffff` | 패널 |
| `--panel-soft` | `#f8f9fb` | 카드·빈 상태 |
| `--ink` | `#1c2128` | 본문 |
| `--ink-soft` | `#4b525e` | 보조 본문 |
| `--muted` | `#868d99` | 캡션·경로 |
| `--line` | `#e6e8ec` | 보더 |
| `--line-strong` | `#d6dae1` | 버튼 보더·점선 패널 |
| `--blue` | `#3f6392` | Primary, 액센트 |
| `--blue-soft` | `#eef2f8` | 호버, 브레드크럼 |
| `--green` / `--yellow` / `--red` | `#2f8265` / `#9a6b1e` / `#b5473f` | 상태(리스크 등) |
| `--shadow` | `0 1px 2px …, 0 4px 16px …` | 패널·KPI |

사이드바는 토큰 밖 고정색: 배경 `#1e232b`, 보더 `#2a2f38`, 내비 텍스트 `#b7bcc6`, 액티브 `#2b313b` + inset 3px `--blue`.

## 3. 타이포

- 폰트: Pretendard Variable (jsDelivr), 폴백 Segoe UI / 맑은 고딕.
- body 14px / 1.6 / letter-spacing `-0.01em`.
- h1 25px / 700, h2 16px / 700, 카드 제목 15px.
- eyebrow 12px / 700 / uppercase / 자간 0.06em / `--blue`.
- helper·경로 12px `--muted`.
- KPI 숫자 27px / 700.

## 4. 레이아웃

```
┌────────────┬─────────────────────────────────┐
│ 248px      │ main padding 28px               │
│ sidebar    │ topbar (eyebrow+h1 | actions)   │
│ brand      │ view (home | tasks | …)         │
│ nav × 5    │                                 │
│ 로그인/상태 │                                 │
└────────────┴─────────────────────────────────┘
```

- `.app-shell`: `248px + 1fr`, 최소 높이 100vh.
- 사이드바 sticky 100vh.
- **960px 이하**: 1열, 사이드바 상대 배치, KPI·2열 폼·STATIK 그리드 1열.
- **640px 이하**: STATIK 필터 1열.

## 5. 컴포넌트

### 5.1 브랜드

42×42 라운드 10px `--blue` 위 흰 `AX`. 옆 `AX Hub` + `Consulting OS`.

### 5.2 내비

`.nav-item` 전체 너비, 패딩 10×12, 라운드 8. 액티브는 흰 글 + 왼쪽 블루 바.

### 5.3 버튼

| 종류 | 스타일 |
|------|--------|
| `.primary-button` | 흰 글, `--blue` 배경, 라운드 8, 13px/600 |
| `.text-button` | 블루 글, 흰 배경, 호버 `--blue-soft` |
| disabled | opacity 0.55, not-allowed |
| 공유 모드 `.admin-only` | `display: none` |

### 5.4 패널·카드

- `.panel`: 패딩 20, 라운드 12, 보더+그림자.
- `.metric` KPI: 패딩 18, 4열 그리드 gap 14.
- `.asset-card`: 소프트 배경, 라운드 8, 패딩 16. 목록 클릭 영역.
- `.project-row`: 홈 과제 행. 관리자만 체크 열.

### 5.5 폼

- 라벨 + input/select/textarea inherit 폰트.
- `.form-row.ratio-2-1-1`, `.ratio-1-1-1`, `.two-column`, `.statik-grid-4`, `.kpi-row-4`.
- 포커스: 보더 `--blue`, ring `rgba(63,99,146,.1~12)`.
- `.section-label`: 섹션 구분, 상단 20px.
- `.statik-breadcrumb`: `--blue-soft` 라운드 8.

### 5.6 필터·검색

- STATIK: 행마다 `L1`~`L4` 라벨 + 셀렉트.
- Best Practice 검색: 보더 `--ink`, 라운드 10, 우측 건수.

### 5.7 탭 (Vibe)

`.doc-tabs` 가로. `.doc-tab.active`는 블루 하단/배경으로 현재 문서 표시. 비활성 패널 `.hidden`.

### 5.8 프로세스

`.flow-compare` 2열. 세로 `.process-flow` + `.flow-arrow-vertical` 블루.

### 5.9 모달

딤 `rgba(20,25,35,.35)`. 카드 최대 420px. 취소 text / 확인 primary.

### 5.10 원본 뷰어

PDF iframe `.pdf-frame`, PNG `.case-source-image`. 없으면 `.status-msg`.

### 5.11 분석 패널

`.editor-panel`: 점선 `--line-strong`, 등록 시에만 펼침.

## 6. 화면별 스펙

### 홈

- KPI 4장 → 아래 과제 요약(정렬 셀렉트 min-width 160) + 병목 리스트.
- 관리자 상단: primary 「과제 현황 업데이트」.
- 공유: 체크열·이관 버튼·업데이트 버튼 없음.

### 과제·프롬프트·Vibe 목록

패널 헤드: 제목 | 건수 + 등록 버튼. 그 아래 STATIK 필터, 카드 리스트.

### 과제 상세

기본 정보 그리드 → STATIK 4 → KPI 8 → As-Is | To-Be. 저장은 헤더 primary.

### Vibe 상세

메타 + 탭 5. 탭 콘텐츠는 textarea 12행 + TXT/파일명 2열.

### Best Practice 목록

헤드 우측에 검색+건수, 「전체 리스트 보기」, 관리자 「문서 분석 등록」.

카드 메타 한 줄: `{분야} · {태그, 최대 5}` — **이미지/PDF 라벨 없음**.

### Best Practice 상세

분야 helper → 제목|태그 → 주요 내용 textarea → Before|After 2열 → 개선효과 → 원본. 헤더에 저장·삭제(관리자).

## 7. 상태

| 상태 | 표현 |
|------|------|
| 공유 | `body.mode-share` — 관리 버튼 숨김, 인풋 배경 `#f7f8fb`, cursor default |
| 관리 | `body.mode-admin` |
| 로딩/빈 | `.status-msg` 소프트 패널 |
| 오류 | `.status-msg.error` `--red-soft` |
| 내비 액티브 | inset 블루 |
| Primary 호버 | `#35547e` |

## 8. 접근성

- `lang="ko"`, 뷰포트 meta.
- 내비 `aria-label`, 정렬·검색·STATIK·Vibe 탭 `aria-label`/`role="tablist"`.
- 모달 `role="dialog"` `aria-modal`.
- PDF iframe title, 원본 이미지 alt.
- 아이콘 폰트 대신 텍스트 버튼(← 목록으로 등).

키보드: 기본 포커스 링(블루). 카드 클릭은 마우스/탭 중심(버튼이 아닌 article).

## 9. 에셋·구현 위치

| 항목 | 경로 |
|------|------|
| 마크업 | `public/index.html` |
| 스타일 | `public/css/app.css` |
| 동작 | `public/js/app.js` |
| 목업 원본 | `app.html`, `ui mokup/app.html` |

새 화면은 기존 토큰·패널·버튼만 재사용한다. 포인트 컬러를 늘리거나 사이드바를 라이트 테마로 바꾸지 않는다.
