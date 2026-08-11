const { getSupabaseAdmin } = require("./supabase");
const { uid } = require("./uid");

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

function extractVariables(template) {
  const found = String(template || "").match(/\[[^\[\]]+\]/g) || [];
  return [...new Set(found.map((s) => s.replace(/^\[|\]$/g, "").trim()).filter(Boolean))];
}

function mapPrompt(row) {
  const statik = normalizeStatik(row.statik);
  return {
    id: row.id,
    category: row.category || statik.l1 || "일반",
    title: row.title,
    description: row.description || "",
    template: row.template || "",
    variables: row.variables || [],
    tags: row.tags || [],
    author: row.author || "",
    sourceFilename: row.source_filename || "",
    likeCount: Number(row.like_count || 0),
    statik,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function listPrompts(category) {
  const sb = getSupabaseAdmin();
  let q = sb.from("hub_prompts").select("*").order("created_at", { ascending: false });
  if (category && category !== "all") q = q.eq("category", category);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapPrompt);
}

async function getPrompt(id) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("hub_prompts").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) {
    const err = new Error("프롬프트를 찾을 수 없습니다.");
    err.status = 404;
    throw err;
  }
  return mapPrompt(data);
}

function buildPromptRow(body, existing) {
  const statik = normalizeStatik(body.statik != null ? body.statik : existing?.statik);
  const template = body.template != null ? String(body.template) : existing?.template || "";
  const hasVariables = body.variables != null || body.variablesText != null;
  let variables = hasVariables
    ? splitList(body.variables, body.variablesText)
    : existing?.variables || [];
  if (!variables.length && template) variables = extractVariables(template);
  const category =
    body.category != null
      ? String(body.category).trim() || "일반"
      : statik.l1 || existing?.category || "일반";
  const hasTags = body.tags != null || body.tagsText != null;

  return {
    category,
    title: body.title != null ? String(body.title).trim() : existing?.title || "",
    description:
      body.description != null ? String(body.description) : existing?.description || "",
    template,
    variables,
    tags: hasTags ? splitList(body.tags, body.tagsText) : existing?.tags || [],
    author: body.author != null ? String(body.author).trim() : existing?.author || "",
    source_filename:
      body.sourceFilename != null
        ? String(body.sourceFilename).trim()
        : body.source_filename != null
          ? String(body.source_filename).trim()
          : existing?.sourceFilename || "",
    statik
  };
}

async function createPrompt(body) {
  const sb = getSupabaseAdmin();
  const built = buildPromptRow(body || {}, null);
  if (!built.title) {
    const err = new Error("제목이 필요합니다.");
    err.status = 400;
    throw err;
  }
  if (!built.template) {
    const err = new Error("프롬프트 내용이 필요합니다.");
    err.status = 400;
    throw err;
  }
  const row = {
    id: uid("pr"),
    ...built,
    like_count: 0
  };
  const { data, error } = await sb.from("hub_prompts").insert(row).select("*").single();
  if (error) throw error;
  return mapPrompt(data);
}

async function updatePrompt(id, body) {
  const sb = getSupabaseAdmin();
  const existing = await getPrompt(id);
  const built = buildPromptRow(body || {}, existing);
  if (!built.title) {
    const err = new Error("제목이 필요합니다.");
    err.status = 400;
    throw err;
  }
  const { data, error } = await sb.from("hub_prompts").update(built).eq("id", id).select("*").single();
  if (error) throw error;
  return mapPrompt(data);
}

async function createPromptFromTxt({ buffer, filename, body }) {
  const text = Buffer.from(buffer || []).toString("utf8");
  if (!text.trim()) {
    const err = new Error("TXT 파일 내용이 비어 있습니다.");
    err.status = 400;
    throw err;
  }
  const titleFromFile = String(filename || "")
    .replace(/\.txt$/i, "")
    .trim();
  return createPrompt({
    ...(body || {}),
    title: body?.title || titleFromFile || "무제 프롬프트",
    template: body?.template || text,
    sourceFilename: filename || ""
  });
}

async function deletePrompt(id) {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("hub_prompts").delete().eq("id", id);
  if (error) throw error;
  return { ok: true };
}

module.exports = {
  listPrompts,
  getPrompt,
  createPrompt,
  updatePrompt,
  createPromptFromTxt,
  deletePrompt
};
