const DIFFICULTY_WEIGHT = { 상: 3, 중: 2, 하: 1 };

function normalizeDifficulty(value) {
  const raw = String(value || "중").trim().toLowerCase();
  if (raw === "상" || raw === "high" || raw === "h") return "상";
  if (raw === "하" || raw === "low" || raw === "l") return "하";
  if (raw === "중" || raw === "mid" || raw === "medium" || raw === "m") return "중";
  return "중";
}

function difficultyWeight(value) {
  return DIFFICULTY_WEIGHT[normalizeDifficulty(value)] || 2;
}

function elapsedRateFromDates(startDate, endDate, now = new Date()) {
  if (!startDate || !endDate) return null;
  const start = new Date(`${startDate}T00:00:00+09:00`);
  const end = new Date(`${endDate}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  if (now < start) return 0;
  const total = end - start;
  const elapsed = Math.min(Math.max(now - start, 0), total);
  return Math.round((elapsed / total) * 100);
}

function companyElapsedRate(company) {
  return elapsedRateFromDates(company?.schedule?.startDate, company?.schedule?.endDate);
}

function taskExpectedProgress(task, company) {
  const own = elapsedRateFromDates(task.startDate, task.endDate);
  if (own !== null) return own;
  return companyElapsedRate(company);
}

function avgProgress(participant) {
  const tasks = participant?.tasks || [];
  if (!tasks.length) return 0;
  let weightSum = 0;
  let progressSum = 0;
  tasks.forEach((task) => {
    const w = difficultyWeight(task.difficulty);
    weightSum += w;
    progressSum += Number(task.progress || 0) * w;
  });
  return weightSum ? Math.round(progressSum / weightSum) : 0;
}

function expectedProgressAvg(participant, company) {
  const tasks = participant?.tasks || [];
  if (!tasks.length) return null;
  let weightSum = 0;
  let expectedSum = 0;
  let hasValue = false;
  tasks.forEach((task) => {
    const expected = taskExpectedProgress(task, company);
    if (expected === null) return;
    hasValue = true;
    const w = difficultyWeight(task.difficulty);
    weightSum += w;
    expectedSum += expected * w;
  });
  if (!hasValue || !weightSum) return null;
  return Math.round(expectedSum / weightSum);
}

/**
 * ax-pjt-dashboard scheduleStatus와 동일:
 * 전체 진척 − 기대 진척 ≥0 양호 / ≥−15 정상 / <−15 정체
 */
function scheduleStatus(company, participant) {
  if (!participant?.tasks?.length) {
    return {
      label: "과제없음",
      diff: 0,
      target: 0,
      actual: 0,
      reason: "no-tasks"
    };
  }
  const actual = avgProgress(participant);
  const expected = expectedProgressAvg(participant, company);
  if (expected === null) {
    return {
      label: "일정미설정",
      diff: 0,
      target: 0,
      actual,
      reason: "no-schedule"
    };
  }
  const diff = actual - expected;
  const base = { diff, target: expected, actual };
  if (diff >= 0) return { label: "양호", reason: "ok", ...base };
  if (diff >= -15) return { label: "정상", reason: "watch", ...base };
  return { label: "정체", reason: "stalled", ...base };
}

/** 운영 체크 P1: 일정 정체 참여자만 */
function collectStalledParticipants(companies) {
  const rows = [];
  for (const company of companies || []) {
    for (const participant of company.participants || []) {
      const schedule = scheduleStatus(company, participant);
      if (schedule.reason !== "stalled") continue;
      rows.push({
        companyId: company.id,
        companyName: company.name,
        participantId: participant.id,
        participantName: participant.name,
        dept: participant.dept || "",
        actual: schedule.actual,
        target: schedule.target,
        diff: schedule.diff,
        label: "일정 정체"
      });
    }
  }
  return rows.sort((a, b) => (a.diff || 0) - (b.diff || 0));
}

module.exports = {
  normalizeDifficulty,
  scheduleStatus,
  collectStalledParticipants
};
