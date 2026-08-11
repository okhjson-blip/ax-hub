const { getDashboardSupabaseAdmin } = require("./supabase");
const { normalizeDifficulty, collectStalledParticipants } = require("./schedule");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientJwtError(err) {
  const msg = String(err?.message || err || "");
  return /JWT issued at future/i.test(msg);
}

async function withSupabaseRetry(fn, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientJwtError(err) || i === attempts - 1) throw err;
      await sleep(400 * (i + 1));
    }
  }
  throw lastErr;
}

function formatPeriod(startDate, endDate) {
  const start = String(startDate || "").trim();
  const end = String(endDate || "").trim();
  if (start && end) return `${start} ~ ${end}`;
  if (start) return `${start} ~`;
  if (end) return `~ ${end}`;
  return "기간 미정";
}

function mapTask(row) {
  const extras = row.extras && typeof row.extras === "object" ? row.extras : {};
  return {
    id: row.id,
    participantId: row.participant_id,
    name: row.name,
    progress: Math.round(Number(row.progress || 0)),
    reportCompleted: Boolean(row.report_completed),
    startDate: extras.startDate || "",
    endDate: extras.endDate || "",
    difficulty: normalizeDifficulty(extras.difficulty || "중"),
    createdAt: row.created_at || ""
  };
}

/**
 * companies / participants / tasks → 홈 KPI·과제 요약·일정 정체
 */
async function buildHubSummary() {
  return withSupabaseRetry(async () => {
    const sb = getDashboardSupabaseAdmin();

    const [
      { data: companies, error: cErr },
      { data: participants, error: pErr },
      { data: tasks, error: tErr }
    ] = await Promise.all([
      sb
        .from("companies")
        .select("id,name,start_date,end_date,created_at")
        .order("name", { ascending: true }),
      sb.from("participants").select("id,company_id,name,dept,status").order("created_at", { ascending: true }),
      sb
        .from("tasks")
        .select("id,participant_id,name,progress,report_completed,extras,created_at")
        .order("created_at", { ascending: false })
    ]);

    if (cErr) throw cErr;
    if (pErr) throw pErr;
    if (tErr) throw tErr;

    const companyList = companies || [];
    const participantList = participants || [];
    const rawTasks = tasks || [];
    const mappedTasks = rawTasks.map(mapTask);

    const mappedByParticipant = new Map();
    for (const task of mappedTasks) {
      if (!mappedByParticipant.has(task.participantId)) mappedByParticipant.set(task.participantId, []);
      mappedByParticipant.get(task.participantId).push(task);
    }

    const nestedCompanies = companyList.map((company) => {
      const companyParticipants = participantList
        .filter((p) => p.company_id === company.id)
        .map((p) => ({
          id: p.id,
          name: p.name,
          dept: p.dept || "",
          status: p.status || "정상",
          tasks: mappedByParticipant.get(p.id) || []
        }));
      return {
        id: company.id,
        name: company.name,
        createdAt: company.created_at || "",
        schedule: {
          startDate: company.start_date || "",
          endDate: company.end_date || ""
        },
        participants: companyParticipants
      };
    });

    const avgProgressValue =
      mappedTasks.length === 0
        ? 0
        : Math.round(
            mappedTasks.reduce((sum, t) => sum + Number(t.progress || 0), 0) / mappedTasks.length
          );

    const kpis = [
      {
        label: "총 협력사",
        value: String(companyList.length),
        hint: "등록된 협력사"
      },
      {
        label: "총 참여자",
        value: String(participantList.length),
        hint: "등록된 참여자"
      },
      {
        label: "총 과제수",
        value: String(mappedTasks.length),
        hint: `완료 보고 ${mappedTasks.filter((t) => t.reportCompleted).length}건`
      },
      {
        label: "평균 진척도",
        value: `${avgProgressValue}%`,
        hint: "전체 과제 기준"
      }
    ];

    const companyById = new Map(nestedCompanies.map((c) => [c.id, c]));
    const participantById = new Map();
    for (const company of nestedCompanies) {
      for (const p of company.participants) {
        participantById.set(p.id, { ...p, companyId: company.id });
      }
    }

    const taskSummaries = mappedTasks
      .map((task) => {
        const participant = participantById.get(task.participantId);
        const company = participant ? companyById.get(participant.companyId) : null;
        return {
          id: task.id,
          name: task.name,
          companyId: company?.id || "",
          companyName: company?.name || "미지정 협력사",
          companyCreatedAt: company?.createdAt || "",
          taskCreatedAt: task.createdAt,
          period: formatPeriod(task.startDate, task.endDate),
          startDate: task.startDate,
          endDate: task.endDate,
          difficulty: task.difficulty,
          progress: task.progress
        };
      })
      .sort((a, b) => {
        const byCompany = String(a.companyName || "").localeCompare(String(b.companyName || ""), "ko");
        if (byCompany !== 0) return byCompany;
        return String(a.name || "").localeCompare(String(b.name || ""), "ko");
      });

    const stalled = collectStalledParticipants(nestedCompanies);
    const risks = stalled.map((row) => ({
      code: "정체",
      label: row.label,
      text: `${row.companyName} · ${row.participantName}${row.dept ? ` (${row.dept})` : ""} · 실적 ${row.actual}% / 기대 ${row.target}% (${row.diff}%p)`,
      companyName: row.companyName,
      participantName: row.participantName,
      dept: row.dept,
      actual: row.actual,
      target: row.target,
      diff: row.diff
    }));

    return {
      kpis,
      tasks: taskSummaries,
      risks,
      meta: {
        companyCount: companyList.length,
        participantCount: participantList.length,
        taskCount: mappedTasks.length,
        avgProgress: avgProgressValue,
        stalledCount: risks.length,
        generatedAt: new Date().toISOString()
      }
    };
  });
}

module.exports = { buildHubSummary };
