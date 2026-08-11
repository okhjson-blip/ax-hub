const { getSupabaseAdmin } = require("./supabase");
const { uid } = require("./uid");

const SECTION_KEYS = ["readme", "planDoc", "uxScenario", "uiDesign", "otherDoc"];
const SECTION_DB = {
  readme: "readme",
  planDoc: "plan_doc",
  uxScenario: "ux_scenario",
  uiDesign: "ui_design",
  otherDoc: "other_doc"
};
const SECTION_LABEL = {
  readme: "readme.md",
  planDoc: "개발 계획서",
  uxScenario: "UX 시나리오 설계서",
  uiDesign: "UI 디자인 설계서",
  otherDoc: "기타"
};

function normalizeStatik(input) {
  const s = input && typeof input === "object" ? input : {};
  return {
    l1: String(s.l1 || "").trim(),
    l2: String(s.l2 || "").trim(),
    l3: String(s.l3 || "").trim(),
    l4: String(s.l4 || "").trim()
  };
}

function splitList(value, text) {
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  return String(text || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeSourceFiles(input) {
  const s = input && typeof input === "object" ? input : {};
  return {
    readme: String(s.readme || "").trim(),
    planDoc: String(s.planDoc || s.plan_doc || "").trim(),
    uxScenario: String(s.uxScenario || s.ux_scenario || "").trim(),
    uiDesign: String(s.uiDesign || s.ui_design || "").trim(),
    otherDoc: String(s.otherDoc || s.other_doc || "").trim()
  };
}

function mapDoc(row) {
  const statik = normalizeStatik(row.statik);
  const readme = row.readme || row.body || "";
  return {
    id: row.id,
    category: row.category || statik.l1 || "일반",
    docType: row.doc_type || "md",
    title: row.title,
    description: row.description || "",
    author: row.author || "",
    body: readme,
    readme,
    planDoc: row.plan_doc || "",
    uxScenario: row.ux_scenario || "",
    uiDesign: row.ui_design || "",
    otherDoc: row.other_doc || "",
    sourceFiles: normalizeSourceFiles(row.source_files),
    storagePath: row.storage_path || "",
    tags: row.tags || [],
    statik,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function listVibeDocs(category) {
  const sb = getSupabaseAdmin();
  let q = sb.from("hub_vibe_docs").select("*").order("created_at", { ascending: false });
  if (category && category !== "all") q = q.eq("category", category);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapDoc);
}

async function getVibeDoc(id) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("hub_vibe_docs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) {
    const err = new Error("Vibe Coding 문서를 찾을 수 없습니다.");
    err.status = 404;
    throw err;
  }
  return mapDoc(data);
}

function buildVibeRow(body, existing) {
  const statik = normalizeStatik(body.statik != null ? body.statik : existing?.statik);
  const category =
    body.category != null
      ? String(body.category).trim() || "일반"
      : statik.l1 || existing?.category || "일반";
  const hasTags = body.tags != null || body.tagsText != null;
  const sourceFiles = normalizeSourceFiles(
    body.sourceFiles != null ? body.sourceFiles : existing?.sourceFiles
  );

  const readme =
    body.readme != null
      ? String(body.readme)
      : body.body != null
        ? String(body.body)
        : existing?.readme || "";
  const planDoc = body.planDoc != null ? String(body.planDoc) : existing?.planDoc || "";
  const uxScenario =
    body.uxScenario != null ? String(body.uxScenario) : existing?.uxScenario || "";
  const uiDesign = body.uiDesign != null ? String(body.uiDesign) : existing?.uiDesign || "";
  const otherDoc = body.otherDoc != null ? String(body.otherDoc) : existing?.otherDoc || "";

  return {
    category,
    doc_type: "md",
    title: body.title != null ? String(body.title).trim() : existing?.title || "",
    description:
      body.description != null ? String(body.description) : existing?.description || "",
    author: body.author != null ? String(body.author).trim() : existing?.author || "",
    body: readme,
    readme,
    plan_doc: planDoc,
    ux_scenario: uxScenario,
    ui_design: uiDesign,
    other_doc: otherDoc,
    source_files: sourceFiles,
    tags: hasTags ? splitList(body.tags, body.tagsText) : existing?.tags || [],
    storage_path:
      body.storagePath != null ? String(body.storagePath) : existing?.storagePath || "",
    statik
  };
}

function hasAnySection(row) {
  return Boolean(
    String(row.readme || "").trim() ||
      String(row.plan_doc || "").trim() ||
      String(row.ux_scenario || "").trim() ||
      String(row.ui_design || "").trim() ||
      String(row.other_doc || "").trim()
  );
}

async function createVibeDoc(body) {
  const sb = getSupabaseAdmin();
  const built = buildVibeRow(body || {}, null);
  if (!built.title) {
    const err = new Error("제목이 필요합니다.");
    err.status = 400;
    throw err;
  }
  if (!hasAnySection(built)) {
    const err = new Error("문서 내용이 최소 1개 필요합니다.");
    err.status = 400;
    throw err;
  }
  const row = { id: uid("vb"), ...built };
  const { data, error } = await sb.from("hub_vibe_docs").insert(row).select("*").single();
  if (error) throw error;
  return mapDoc(data);
}

async function updateVibeDoc(id, body) {
  const existing = await getVibeDoc(id);
  const built = buildVibeRow(body || {}, existing);
  if (!built.title) {
    const err = new Error("제목이 필요합니다.");
    err.status = 400;
    throw err;
  }
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("hub_vibe_docs").update(built).eq("id", id).select("*").single();
  if (error) throw error;
  return mapDoc(data);
}

async function createVibeDocFromTxt({ buffer, filename, section, body }) {
  const text = Buffer.from(buffer || []).toString("utf8");
  if (!text.trim()) {
    const err = new Error("TXT 파일 내용이 비어 있습니다.");
    err.status = 400;
    throw err;
  }
  const key = SECTION_KEYS.includes(section) ? section : "readme";
  const titleFromFile = String(filename || "")
    .replace(/\.txt$/i, "")
    .trim();
  const payload = {
    ...(body || {}),
    title: body?.title || titleFromFile || "무제 Vibe 문서",
    sourceFiles: {
      ...(body?.sourceFiles || {}),
      [key]: filename || ""
    }
  };
  payload[key] = body?.[key] || text;
  return createVibeDoc(payload);
}

async function deleteVibeDoc(id) {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("hub_vibe_docs").delete().eq("id", id);
  if (error) throw error;
  return { ok: true };
}

module.exports = {
  listVibeDocs,
  getVibeDoc,
  createVibeDoc,
  updateVibeDoc,
  createVibeDocFromTxt,
  deleteVibeDoc,
  SECTION_KEYS,
  SECTION_LABEL,
  SECTION_DB
};
