const { getSupabaseAdmin, getDashboardSupabaseAdmin } = require("./supabase");
const { uid } = require("./uid");
const { normalizeDifficulty } = require("./schedule");

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumberOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").replace(/분/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function parseDifficultyToken(value, fallback = "") {
  const raw = String(value || "")
    .replace(/난이도/g, "")
    .trim();
  if (raw === "상" || raw === "중" || raw === "하" || raw === "-") return raw;
  return fallback;
}

function parseProcessSteps(text, kind = "asis") {
  const raw = String(text || "").trim();
  if (!raw) return [];
  return raw
    .split(/\s*>\s*|\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const cleaned = part.replace(/^\d+\.\s*/, "");
      const bracket = cleaned.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
      if (bracket) {
        const name = bracket[1].trim();
        const inner = bracket[2]
          .split(/[｜|]/)
          .map((s) => s.trim())
          .filter(Boolean);
        const method = inner[0] || "";
        const tool = inner[1] || "";
        const minutes = toNumberOrNull(inner[2]);
        const difficulty = kind === "tobe" ? parseDifficultyToken(inner[3], "-") : "";
        return { name, method, tool, minutes, difficulty };
      }
      const dash = cleaned.split(/\s*[—–]\s*/);
      if (dash.length > 1) {
        const name = dash[0].trim();
        const bits = dash
          .slice(1)
          .join(" — ")
          .split(/\s*\/\s*/)
          .map((s) => s.trim());
        return {
          name,
          method: bits[0] || "",
          tool: bits[1] || "",
          minutes: toNumberOrNull(bits[2]),
          difficulty: kind === "tobe" ? parseDifficultyToken(bits[3], "-") : ""
        };
      }
      return {
        name: cleaned,
        method: "",
        tool: "",
        minutes: null,
        difficulty: kind === "tobe" ? "-" : ""
      };
    })
    .filter((s) => s.name);
}

function mapStatik(extras) {
  const src =
    (extras.statik && typeof extras.statik === "object" && extras.statik) ||
    (extras.hierarchy && typeof extras.hierarchy === "object" && extras.hierarchy) ||
    {};
  return {
    l1: String(src.l1 || "").trim(),
    l2: String(src.l2 || "").trim(),
    l3: String(src.l3 || "").trim(),
    l4: String(src.l4 || "").trim(),
    l5: String(src.l5 || "").trim(),
    l6: String(src.l6 || "").trim()
  };
}

function formatFrequency(stats) {
  const unit = String(stats.frequencyUnit || "").trim();
  const count = stats.frequencyCount;
  const annual = stats.annualFrequency;
  const hasCount = count != null && count !== "";
  const hasAnnual = annual != null && annual !== "";
  if (unit && hasCount) {
    return hasAnnual ? `${unit} ${count}회 (연간 ${annual}회)` : `${unit} ${count}회`;
  }
  if (hasAnnual) return `연간 ${annual}회`;
  return String(stats.frequency || "").trim();
}

function mapKpis(extras) {
  const kpis = extras.kpis && typeof extras.kpis === "object" ? extras.kpis : {};
  const stats = extras.statistics && typeof extras.statistics === "object" ? extras.statistics : {};
  const pick = (...values) => {
    for (const value of values) {
      if (value == null || value === "") continue;
      const n = toNumberOrNull(value);
      if (n != null) return n;
      return value;
    }
    return "";
  };
  return {
    asIsMinutes: pick(kpis.asIsMinutes, stats.asIsTotalTime, stats.as_is_total_time),
    toBeMinutes: pick(kpis.toBeMinutes, stats.toBeTotalTime, stats.to_be_total_time),
    savedMinutes: pick(kpis.savedMinutes, stats.timeSavings, stats.time_savings),
    savingRatePct: pick(kpis.savingRatePct, stats.timeSavingsRate, stats.time_savings_rate),
    frequency: String(kpis.frequency || formatFrequency(stats) || "").trim(),
    annualSavedHours: pick(kpis.annualSavedHours, stats.annualSavingsHours, stats.annual_savings_hours),
    fte: pick(kpis.fte, stats.fteEquivalent, stats.fte_equivalent),
    automationRatePct: pick(kpis.automationRatePct, stats.automationRate, stats.automation_rate)
  };
}

function mapMembersAndAssignees(extras) {
  const fromParticipants = asArray(extras.participants)
    .map((p) => ({
      name: String(p?.name || "").trim(),
      role: String(p?.role || p?.position || "").trim(),
      email: String(p?.email || "").trim(),
      responsibility: String(p?.responsibility || "").trim() || (p?.isOwner ? "과제 리더" : "과제 담당자")
    }))
    .filter((p) => p.name);
  const fromMembers = asArray(extras.members)
    .map((m) => ({
      name: String(m?.name || "").trim(),
      role: String(m?.role || m?.position || "").trim(),
      email: String(m?.email || "").trim(),
      responsibility: m?.isOwner ? "과제 리더" : String(m?.responsibility || "").trim() || "과제 담당자"
    }))
    .filter((m) => m.name);
  const participants = fromParticipants.length ? fromParticipants : fromMembers;
  const nonLeaders = participants.filter((p) => p.responsibility !== "과제 리더");
  const fallback = Math.max(0, Number(extras.assigneeCount) || 0);
  const assigneeCount = participants.length ? nonLeaders.length || fallback || 1 : fallback;
  return { participants, assigneeCount };
}

function mapAssetRow(row) {
  const extras = row.extras && typeof row.extras === "object" ? row.extras : {};
  const { participants, assigneeCount } = mapMembersAndAssignees(extras);
  const statik = mapStatik(extras);
  const asIsSteps = asArray(extras.asIsSteps).length
    ? asArray(extras.asIsSteps)
    : parseProcessSteps(row.as_is_process, "asis");
  const toBeSteps = asArray(extras.toBeSteps).length
    ? asArray(extras.toBeSteps)
    : parseProcessSteps(row.to_be_process, "tobe");

  return {
    id: row.id,
    sourceTaskId: row.source_task_id,
    sourceCompanyId: row.source_company_id,
    sourceParticipantId: row.source_participant_id,
    title: row.title,
    companyName: row.company_name || "",
    participantName: row.participant_name || "",
    dept: row.dept || "",
    difficulty: normalizeDifficulty(row.difficulty || "중"),
    progress: Number(row.progress || 0),
    startDate: row.start_date || "",
    endDate: row.end_date || "",
    goal: row.goal || "",
    asIsProcess: row.as_is_process || "",
    toBeProcess: row.to_be_process || "",
    body: row.body || "",
    tags: row.tags || [],
    extras,
    assigneeCount,
    statik,
    kpis: mapKpis(extras),
    asIsSteps,
    toBeSteps,
    importedAt: row.imported_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function stepsToText(steps) {
  return asArray(steps)
    .map((s, i) => {
      const n = i + 1;
      const name = s.name || s.process || "";
      const method = s.method ? ` — ${s.method}` : "";
      const tool = s.tool ? ` / ${s.tool}` : "";
      const mins = s.minutes != null && s.minutes !== "" ? ` / ${s.minutes}분` : "";
      return `${n}. ${name}${method}${tool}${mins}`;
    })
    .filter((line) => !/^\d+\.\s*$/.test(line))
    .join("\n");
}

function normalizeSteps(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((s) => ({
      name: String(s?.name || s?.process || "").trim(),
      method: String(s?.method || "").trim(),
      tool: String(s?.tool || "").trim(),
      minutes: s?.minutes === "" || s?.minutes == null ? null : Number(s.minutes),
      difficulty: String(s?.difficulty || "").trim() || ""
    }))
    .filter((s) => s.name);
}

function buildRowFromBody(body, existing) {
  const asIsSteps = normalizeSteps(body.asIsSteps);
  const toBeSteps = normalizeSteps(body.toBeSteps);
  const kpis = body.kpis && typeof body.kpis === "object" ? body.kpis : existing?.extras?.kpis || {};
  const assigneeCount = Math.max(0, Number(body.assigneeCount ?? existing?.assigneeCount ?? 0) || 0);
  const prevStatik = existing?.statik || existing?.extras?.statik || {};
  const incomingStatik = body.statik && typeof body.statik === "object" ? body.statik : {};
  const statik = {
    l1: String(incomingStatik.l1 ?? prevStatik.l1 ?? "").trim(),
    l2: String(incomingStatik.l2 ?? prevStatik.l2 ?? "").trim(),
    l3: String(incomingStatik.l3 ?? prevStatik.l3 ?? "").trim(),
    l4: String(incomingStatik.l4 ?? prevStatik.l4 ?? "").trim(),
    l5: String(incomingStatik.l5 ?? prevStatik.l5 ?? "").trim(),
    l6: String(incomingStatik.l6 ?? prevStatik.l6 ?? "").trim()
  };
  const extras = {
    ...(existing?.extras || {}),
    ...(body.extras && typeof body.extras === "object" ? body.extras : {}),
    assigneeCount,
    kpis,
    asIsSteps,
    toBeSteps,
    statik
  };

  return {
    title: String(body.title || existing?.title || "").trim(),
    company_name: String(body.companyName ?? existing?.companyName ?? "").trim(),
    participant_name: String(body.participantName ?? existing?.participantName ?? "").trim(),
    dept: String(body.dept ?? existing?.dept ?? "").trim(),
    difficulty: normalizeDifficulty(body.difficulty ?? existing?.difficulty ?? "중"),
    progress: Math.min(100, Math.max(0, Number(body.progress ?? existing?.progress ?? 0) || 0)),
    start_date: String(body.startDate ?? existing?.startDate ?? "").trim(),
    end_date: String(body.endDate ?? existing?.endDate ?? "").trim(),
    goal: String(body.goal ?? existing?.goal ?? "").trim(),
    as_is_process: asIsSteps.length ? stepsToText(asIsSteps) : String(body.asIsProcess ?? existing?.asIsProcess ?? ""),
    to_be_process: toBeSteps.length ? stepsToText(toBeSteps) : String(body.toBeProcess ?? existing?.toBeProcess ?? ""),
    body: String(body.body ?? existing?.body ?? ""),
    tags: Array.isArray(body.tags) ? body.tags : existing?.tags || [],
    extras
  };
}

async function listTaskAssets() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("hub_task_assets")
    .select("*")
    .order("imported_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapAssetRow);
}

async function getTaskAsset(id) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("hub_task_assets").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) {
    const err = new Error("과제를 찾을 수 없습니다.");
    err.status = 404;
    throw err;
  }
  return mapAssetRow(data);
}

async function listImportedSourceIds() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("hub_task_assets").select("source_task_id");
  if (error) throw error;
  return new Set((data || []).map((r) => r.source_task_id));
}

async function createTaskAsset(body) {
  const row = buildRowFromBody(body, null);
  if (!row.title) {
    const err = new Error("과제명이 필요합니다.");
    err.status = 400;
    throw err;
  }
  const sb = getSupabaseAdmin();
  const insert = {
    id: uid("ta"),
    source_task_id: `manual_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    source_company_id: null,
    source_participant_id: null,
    ...row
  };
  const { data, error } = await sb.from("hub_task_assets").insert(insert).select("*").single();
  if (error) throw error;
  return mapAssetRow(data);
}

async function updateTaskAsset(id, body) {
  const existing = await getTaskAsset(id);
  const row = buildRowFromBody(body, existing);
  if (!row.title) {
    const err = new Error("과제명이 필요합니다.");
    err.status = 400;
    throw err;
  }
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("hub_task_assets").update(row).eq("id", id).select("*").single();
  if (error) throw error;
  return mapAssetRow(data);
}

async function importTasks(taskIds) {
  const ids = [...new Set((taskIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) {
    const err = new Error("이관할 과제를 선택해 주세요.");
    err.status = 400;
    throw err;
  }

  const dash = getDashboardSupabaseAdmin();
  const { data: tasks, error: tErr } = await dash.from("tasks").select("*").in("id", ids);
  if (tErr) throw tErr;
  if (!tasks?.length) {
    const err = new Error("선택한 과제를 찾을 수 없습니다.");
    err.status = 404;
    throw err;
  }

  const participantIds = [...new Set(tasks.map((t) => t.participant_id))];
  const { data: participants, error: pErr } = await dash
    .from("participants")
    .select("*")
    .in("id", participantIds);
  if (pErr) throw pErr;

  const companyIds = [...new Set((participants || []).map((p) => p.company_id))];
  const { data: companies, error: cErr } = await dash.from("companies").select("*").in("id", companyIds);
  if (cErr) throw cErr;

  const participantById = new Map((participants || []).map((p) => [p.id, p]));
  const companyById = new Map((companies || []).map((c) => [c.id, c]));

  const existing = await listImportedSourceIds();
  const skipped = [];
  const rows = [];

  for (const task of tasks) {
    if (existing.has(task.id)) {
      skipped.push(task.id);
      continue;
    }
    const participant = participantById.get(task.participant_id);
    const company = participant ? companyById.get(participant.company_id) : null;
    const extras = task.extras && typeof task.extras === "object" ? task.extras : {};
    const asIsSteps = asArray(extras.asIsSteps).length
      ? normalizeSteps(extras.asIsSteps)
      : parseProcessSteps(extras.asIsProcess, "asis");
    const toBeSteps = asArray(extras.toBeSteps).length
      ? normalizeSteps(extras.toBeSteps)
      : parseProcessSteps(extras.toBeProcess, "tobe");
    const { participants: taskParticipants, assigneeCount } = mapMembersAndAssignees(extras);
    const statik = mapStatik(extras);
    const kpis = mapKpis(extras);
    const startDate = extras.startDate || company?.start_date || "";
    const endDate = extras.endDate || company?.end_date || "";

    rows.push({
      id: uid("ta"),
      source_task_id: task.id,
      source_company_id: company?.id || null,
      source_participant_id: participant?.id || null,
      title: task.name,
      company_name: company?.name || "",
      participant_name: participant?.name || "",
      dept: participant?.dept || "",
      difficulty: normalizeDifficulty(extras.difficulty || "중"),
      progress: Number(task.progress || 0),
      start_date: startDate,
      end_date: endDate,
      goal: extras.goal || "",
      as_is_process: asIsSteps.length ? stepsToText(asIsSteps) : extras.asIsProcess || "",
      to_be_process: toBeSteps.length ? stepsToText(toBeSteps) : extras.toBeProcess || "",
      body: [
        extras.goal ? `목표: ${extras.goal}` : "",
        task.weekly_summary ? `주간요약: ${task.weekly_summary}` : ""
      ]
        .filter(Boolean)
        .join("\n"),
      tags: [],
      extras: {
        ...extras,
        reportCompleted: Boolean(task.report_completed),
        weeklySummary: task.weekly_summary || "",
        nextWeekPlan: task.next_week_plan || "",
        participants: taskParticipants,
        assigneeCount,
        statik,
        hierarchy: extras.hierarchy || statik,
        kpis,
        asIsSteps,
        toBeSteps
      }
    });
  }

  if (!rows.length) {
    return { imported: [], skipped, message: "선택한 과제는 이미 Library에 등록되어 있습니다." };
  }

  const sb = getSupabaseAdmin();
  const { data: inserted, error: iErr } = await sb.from("hub_task_assets").insert(rows).select("*");
  if (iErr) throw iErr;

  return {
    imported: (inserted || []).map(mapAssetRow),
    skipped,
    message: `${(inserted || []).length}건 이관 완료` + (skipped.length ? `, ${skipped.length}건 이미 등록됨` : "")
  };
}

async function deleteTaskAsset(id) {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("hub_task_assets").delete().eq("id", id);
  if (error) throw error;
  return { ok: true };
}

module.exports = {
  listTaskAssets,
  getTaskAsset,
  listImportedSourceIds,
  createTaskAsset,
  updateTaskAsset,
  importTasks,
  deleteTaskAsset
};
