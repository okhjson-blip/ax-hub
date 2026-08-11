const { getSupabaseAdmin, getDashboardSupabaseAdmin } = require("./supabase");
const { isDashboardSupabaseConfigured } = require("./env");

async function fetchAll(client, table) {
  const { data, error } = await client.from(table).select("*");
  if (error) throw error;
  return data || [];
}

async function upsertAll(client, table, rows, onConflict = "id") {
  if (!rows.length) return 0;
  const chunk = 200;
  let count = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const { error } = await client.from(table).upsert(part, { onConflict });
    if (error) throw error;
    count += part.length;
  }
  return count;
}

async function deleteMissing(client, table, keepIds, idColumn = "id") {
  const { data, error } = await client.from(table).select(idColumn);
  if (error) throw error;
  const toDelete = (data || [])
    .map((row) => row[idColumn])
    .filter((id) => id != null && !keepIds.has(id));
  if (!toDelete.length) return 0;
  const chunk = 200;
  let removed = 0;
  for (let i = 0; i < toDelete.length; i += chunk) {
    const part = toDelete.slice(i, i + chunk);
    const { error: delErr } = await client.from(table).delete().in(idColumn, part);
    if (delErr) throw delErr;
    removed += part.length;
  }
  return removed;
}

/**
 * ax-pjt-dashboard → ax-hub 대시보드 테이블 미러링
 */
async function syncDashboardToHub() {
  if (!isDashboardSupabaseConfigured()) {
    return { synced: false, reason: "dashboard-not-configured" };
  }

  const src = getDashboardSupabaseAdmin();
  const dst = getSupabaseAdmin();

  const sourceUrl = process.env.DASHBOARD_SUPABASE_URL || "";
  const hubUrl = process.env.SUPABASE_URL || "";
  if (sourceUrl && hubUrl && sourceUrl === hubUrl) {
    return { synced: false, reason: "same-project" };
  }

  const companies = await fetchAll(src, "companies");
  const participants = await fetchAll(src, "participants");
  const tasks = await fetchAll(src, "tasks");
  const appMeta = await fetchAll(src, "app_meta");
  let weekly = [];
  try {
    weekly = await fetchAll(src, "task_weekly_reports");
  } catch (err) {
    console.warn("[dashboard-sync] task_weekly_reports skip:", err.message);
  }

  const counts = {
    companies: await upsertAll(dst, "companies", companies),
    participants: await upsertAll(dst, "participants", participants),
    tasks: await upsertAll(dst, "tasks", tasks),
    app_meta: await upsertAll(dst, "app_meta", appMeta, "key"),
    task_weekly_reports: await upsertAll(dst, "task_weekly_reports", weekly)
  };

  const removed = {
    task_weekly_reports: await deleteMissing(
      dst,
      "task_weekly_reports",
      new Set(weekly.map((r) => r.id))
    ),
    tasks: await deleteMissing(dst, "tasks", new Set(tasks.map((r) => r.id))),
    participants: await deleteMissing(
      dst,
      "participants",
      new Set(participants.map((r) => r.id))
    ),
    companies: await deleteMissing(dst, "companies", new Set(companies.map((r) => r.id))),
    app_meta: await deleteMissing(dst, "app_meta", new Set(appMeta.map((r) => r.key)), "key")
  };

  return {
    synced: true,
    counts,
    removed,
    syncedAt: new Date().toISOString()
  };
}

module.exports = {
  syncDashboardToHub,
  fetchAll,
  upsertAll,
  deleteMissing
};
