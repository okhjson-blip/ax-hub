/**
 * Seed hub_task_assets from Desktop 11.pdf (UX 시나리오 기획 자동화 AX 분석)
 * Usage: node backend/src/seed-from-pdf11.js
 */
require("./env");
const { getSupabaseAdmin } = require("./supabase");

const SOURCE_ID = "pdf-11-ux-scenario-ax";

const asIsSteps = [
  { name: "시나리오 아이디어를 구상한다", method: "수작업", tool: "기타도구", minutes: 120 },
  { name: "기획서 초안을 작성한다", method: "수작업", tool: "문서", minutes: 240 },
  { name: "기획서 파일을 송부한다", method: "수작업", tool: "이메일", minutes: 10 },
  { name: "협의 회의 일정을 수립한다", method: "수작업", tool: "이메일", minutes: 60 },
  { name: "회의실을 예약한다", method: "시스템", tool: "ERP", minutes: 10 },
  { name: "부서별 피드백을 수렴한다", method: "수작업", tool: "이메일", minutes: 60 },
  { name: "회의록을 작성한다", method: "수작업", tool: "문서", minutes: 30 },
  { name: "회의록을 내부 보고한다", method: "수작업", tool: "기타도구", minutes: 30 },
  { name: "회의록을 배포한다", method: "수작업", tool: "이메일", minutes: 10 },
  { name: "승인 신청서를 상신한다", method: "시스템", tool: "ERP", minutes: 20 },
  { name: "완료된 기획서를 발행한다", method: "시스템", tool: "문서", minutes: 30 }
];

const toBeSteps = [
  { name: "시나리오 아이디어를 구상한다", method: "AI 자동화", tool: "LLM 아이디어 생성", minutes: 60, difficulty: "하" },
  { name: "기획서 초안을 작성한다", method: "AI 자동화", tool: "문서 자동 생성 AI", minutes: 120, difficulty: "하" },
  { name: "기획서 파일을 송부한다", method: "AI 자동화", tool: "이메일 자동화·알림", minutes: 5, difficulty: "하" },
  { name: "협의 회의 일정을 수립한다", method: "AI 자동화", tool: "AI 일정 조율", minutes: 20, difficulty: "하" },
  { name: "회의실을 예약한다", method: "시스템", tool: "ERP", minutes: 10, difficulty: "-" },
  { name: "부서별 피드백을 수렴한다", method: "AI 자동화", tool: "피드백 요약 AI", minutes: 30, difficulty: "하" },
  { name: "회의록을 작성한다", method: "AI 자동화", tool: "AI STT·요약", minutes: 10, difficulty: "하" },
  { name: "회의록을 내부 보고한다", method: "AI 자동화", tool: "보고서 포맷팅", minutes: 20, difficulty: "하" },
  { name: "회의록을 배포한다", method: "AI 자동화", tool: "메일링 봇", minutes: 5, difficulty: "하" },
  { name: "승인 신청서를 상신한다", method: "시스템", tool: "ERP", minutes: 20, difficulty: "-" },
  { name: "완료된 기획서를 발행한다", method: "AI 자동화", tool: "문서 발행 스크립트", minutes: 20, difficulty: "중" }
];

function stepsToText(steps) {
  return steps
    .map((s, i) => `${i + 1}. ${s.name} — ${s.method} / ${s.tool} / ${s.minutes}분`)
    .join("\n");
}

const row = {
  id: "ta_pdf11_ux_scenario",
  source_task_id: SOURCE_ID,
  source_company_id: null,
  source_participant_id: null,
  title: "UX 시나리오 기획 자동화",
  company_name: "프론트엔드 개발",
  participant_name: "가가가 / 나나나",
  dept: "연구개발 · 서비스 앱 개발",
  difficulty: "하",
  progress: 0,
  start_date: "2026-07-01",
  end_date: "2026-09-30",
  goal: "UX 시나리오 기획 작업시간 50% 단축 (건당 300분·연간 260시간 절감, 자동화율 82%)",
  as_is_process: stepsToText(asIsSteps),
  to_be_process: stepsToText(toBeSteps),
  body: "출처: 11.pdf (ax-bpa-tool AX 분석 결과)",
  tags: ["UX", "시나리오기획", "프론트엔드", "AX분석", "BPA", "STATIK", "AI-FIT"],
  extras: {
    source: "11.pdf",
    sourceUrl: "https://ax-bpa-tool.vercel.app",
    generatedAt: "2026-08-10T16:12:47+09:00",
    assigneeCount: 1,
    asIsSteps,
    toBeSteps,
    statik: {
      l1: "연구개발",
      l2: "서비스 앱 개발",
      l3: "프론트엔드 개발",
      l4: "UX 시나리오 기획"
    },
    participants: [
      { name: "가가가", role: "팀장", responsibility: "과제 리더", email: "aaa@aaa.com" },
      { name: "나나나", role: "부장", responsibility: "과제 담당자", email: "bbb@bbb.com" }
    ],
    kpis: {
      asIsMinutes: 620,
      toBeMinutes: 320,
      savedMinutes: 300,
      savingRatePct: 48,
      automationRatePct: 82,
      aiDifficulty: "하",
      frequency: "주 1회 (연간 52회)",
      annualSavedHours: 260,
      fte: 0.116,
      estimatedDevCostKrw: 74893500
    }
  }
};

async function main() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("hub_task_assets").upsert(row, { onConflict: "source_task_id" }).select("*").single();
  if (error) throw error;
  console.log("upserted:", data.id, data.title, "assignees=", data.extras?.assigneeCount);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
