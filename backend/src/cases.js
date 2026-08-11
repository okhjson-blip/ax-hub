const fs = require("fs");
const path = require("path");
const { getSupabaseAdmin } = require("./supabase");
const { uid } = require("./uid");
const { getGeminiApiKey } = require("./gemini-config");
const { generateContent } = require("./gemini-client");

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "uploads");
const BUCKET = "hub-assets";
const ALLOWED_SOURCE_MIMES = ["application/pdf", "image/png"];
const CASE_CATEGORIES = [
  "기획",
  "개발",
  "마케팅",
  "영업",
  "구매",
  "제조",
  "품질",
  "물류",
  "서비스",
  "재무/경리",
  "인사/총무"
];
const CATEGORY_ALIASES = {
  hr: "인사/총무",
  인사: "인사/총무",
  총무: "인사/총무",
  재무: "재무/경리",
  경리: "재무/경리",
  회계: "재무/경리",
  일반: "기획",
  생산: "제조",
  품질관리: "품질",
  물류관리: "물류",
  고객서비스: "서비스",
  cs: "서비스",
  it: "개발",
  개발: "개발",
  rnd: "개발",
  연구개발: "개발",
  영업관리: "영업",
  구매조달: "구매",
  마케팅: "마케팅",
  기획: "기획",
  제조: "제조",
  품질: "품질",
  물류: "물류",
  서비스: "서비스",
  영업: "영업",
  구매: "구매"
};

function normalizeCaseCategory(value) {
  const raw = String(value || "").trim();
  if (CASE_CATEGORIES.includes(raw)) return raw;
  const compact = raw.replace(/\s+/g, "");
  if (CASE_CATEGORIES.includes(compact)) return compact;
  const alias = CATEGORY_ALIASES[compact.toLowerCase()] || CATEGORY_ALIASES[compact];
  if (alias) return alias;
  const hit = CASE_CATEGORIES.find((c) => compact.includes(c) || c.includes(compact));
  return hit || "기획";
}

function detectSourceType(filename, mimeType) {
  const name = String(filename || "").toLowerCase();
  const mime = String(mimeType || "").toLowerCase();
  if (name.endsWith(".png") || mime === "image/png") {
    return { kind: "png", mime: "image/png", label: "이미지", defaultName: "source.png" };
  }
  if (name.endsWith(".pdf") || mime === "application/pdf") {
    return { kind: "pdf", mime: "application/pdf", label: "PDF", defaultName: "source.pdf" };
  }
  return null;
}

function mapCase(row) {
  const geminiRaw = row.gemini_raw && typeof row.gemini_raw === "object" ? row.gemini_raw : {};
  const tags = Array.isArray(row.tags)
    ? row.tags
    : Array.isArray(geminiRaw.tags)
      ? geminiRaw.tags
      : [];
  const mainContent = String(
    row.ai_summary || row.summary || geminiRaw.mainContent || geminiRaw.aiSummary || ""
  ).trim();
  const improvementEffect = String(
    row.outcome || geminiRaw.improvementEffect || geminiRaw.outcome || ""
  ).trim();
  const efficiency = String(row.efficiency || geminiRaw.efficiency || "").trim();
  return {
    id: row.id,
    category: row.category || "일반",
    title: row.title,
    summary: row.summary || mainContent,
    aiSummary: mainContent,
    mainContent,
    beforeText: row.before_text || "",
    afterText: row.after_text || "",
    outcome: improvementEffect,
    improvementEffect,
    efficiency,
    keyPoints: [],
    tags: tags.map((s) => String(s).trim()).filter(Boolean),
    pdfPath: row.pdf_path || "",
    pdfFilename: row.pdf_filename || "",
    hasPdf: Boolean(row.pdf_path),
    pdfUrl: row.pdf_path ? `/api/cases/${row.id}/pdf` : "",
    fileKind: (detectSourceType(row.pdf_filename || row.pdf_path, "") || { kind: "pdf" }).kind,
    fileLabel: (detectSourceType(row.pdf_filename || row.pdf_path, "") || { label: "PDF" }).label,
    geminiRaw,
    geminiSummary: {
      title: row.title,
      mainContent,
      beforeText: row.before_text || "",
      afterText: row.after_text || "",
      improvementEffect
    },
    status: row.status || "draft",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function ensureBucket() {
  const sb = getSupabaseAdmin();
  const { data: buckets } = await sb.storage.listBuckets();
  const exists = (buckets || []).some((b) => b.name === BUCKET);
  if (!exists) {
    await sb.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: 15 * 1024 * 1024,
      allowedMimeTypes: ALLOWED_SOURCE_MIMES
    });
    return;
  }
  await sb.storage
    .updateBucket(BUCKET, {
      fileSizeLimit: 15 * 1024 * 1024,
      allowedMimeTypes: ALLOWED_SOURCE_MIMES
    })
    .catch((err) => console.warn("hub-assets bucket update:", err.message));
}

function saveLocalPdf(id, filename, buffer) {
  const type = detectSourceType(filename, "") || { defaultName: "source.pdf" };
  const safeName = String(filename || type.defaultName).replace(/[^\w.\-가-힣() ]+/g, "_");
  const dir = path.join(UPLOAD_ROOT, "cases", id);
  fs.mkdirSync(dir, { recursive: true });
  const full = path.join(dir, safeName);
  fs.writeFileSync(full, buffer);
  return {
    pdfPath: `local:cases/${id}/${safeName}`,
    pdfFilename: safeName,
    absolutePath: full
  };
}

function resolveLocalPdfPath(pdfPath) {
  if (!String(pdfPath || "").startsWith("local:")) return null;
  const rel = String(pdfPath).slice("local:".length);
  const full = path.normalize(path.join(UPLOAD_ROOT, rel));
  if (!full.startsWith(path.normalize(UPLOAD_ROOT))) return null;
  return full;
}

async function storePdf({ id, buffer, filename, mimeType }) {
  const type = detectSourceType(filename, mimeType) || { mime: "application/pdf", defaultName: "source.pdf" };
  let pdfPath = "";
  let pdfFilename = String(filename || type.defaultName);
  try {
    await ensureBucket();
    const sb = getSupabaseAdmin();
    const storagePath = `cases/${id}/${pdfFilename}`;
    const { error: upErr } = await sb.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType: type.mime,
      upsert: true
    });
    if (upErr) throw upErr;
    pdfPath = storagePath;
  } catch (err) {
    console.warn("supabase storage upload failed, using local fallback:", err.message);
    const local = saveLocalPdf(id, pdfFilename, buffer);
    pdfPath = local.pdfPath;
    pdfFilename = local.pdfFilename;
  }
  return { pdfPath, pdfFilename };
}

const TAG_STOPWORDS = new Set([
  "및",
  "와",
  "과",
  "의",
  "을",
  "를",
  "이",
  "가",
  "은",
  "는",
  "로",
  "으로",
  "에서",
  "에",
  "한",
  "하는",
  "대한",
  "위한",
  "통한",
  "기반",
  "관련",
  "사례",
  "분석",
  "보고서",
  "일반",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "the",
  "a",
  "an"
]);

function extractTagsFromTitle(title) {
  const tokens = String(title || "")
    .replace(/[^\p{L}\p{N}\s/_+-]/gu, " ")
    .split(/[\s/_+-]+/)
    .map((s) => s.trim())
    .filter((s) => {
      if (s.length < 2 || s.length > 16) return false;
      if (/^\d+$/.test(s)) return false;
      return !TAG_STOPWORDS.has(s.toLowerCase());
    });
  return [...new Set(tokens)].slice(0, 5);
}

function normalizeCaseTags(value, fallbackText) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,;\n/|]+/)
      : [];
  const cleaned = [];
  const seen = new Set();
  for (const item of raw) {
    const tag = String(item || "")
      .trim()
      .replace(/^#/, "")
      .replace(/\s+/g, " ");
    if (!tag || tag.length < 2 || tag.length > 16) continue;
    if (TAG_STOPWORDS.has(tag.toLowerCase())) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(tag);
  }
  if (cleaned.length >= 5) return cleaned.slice(0, 5);
  for (const extra of extractTagsFromTitle(fallbackText)) {
    const key = extra.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(extra);
    if (cleaned.length >= 5) break;
  }
  return cleaned.slice(0, 5);
}

function formatOutline(value) {
  const lines = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      const text =
        item && typeof item === "object"
          ? pickText(item)
          : String(item || "").trim();
      if (text) lines.push(text);
    }
  } else {
    const text = String(value || "").trim();
    if (text) {
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed) lines.push(trimmed);
      }
    }
  }
  return lines
    .map((line) => line.replace(/^[-•●○·*]+\s*/, "").replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join("\n");
}

function pickOutline(...values) {
  for (const value of values) {
    if (value == null || value === "") continue;
    const formatted = formatOutline(value);
    if (formatted) return formatted;
  }
  return "";
}

function pickText(...values) {
  for (const value of values) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      const joined = value.map((v) => String(v || "").trim()).filter(Boolean).join("\n");
      if (joined) return joined;
      continue;
    }
    if (typeof value === "object") {
      const nested =
        value.text ||
        value.content ||
        value.description ||
        value.summary ||
        value.value ||
        "";
      const text = String(nested || "").trim();
      if (text) return text;
      continue;
    }
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function normalizeGeminiSummaryResult(parsed, fallbacks = {}) {
  const src = parsed && typeof parsed === "object" ? parsed : {};
  const beforeAfter =
    src.beforeAfter && typeof src.beforeAfter === "object" ? src.beforeAfter : {};
  const ba =
    src["Before/After"] && typeof src["Before/After"] === "object" ? src["Before/After"] : {};

  const title = pickText(
    src.title,
    src["제목"],
    src.caseTitle,
    src.name,
    fallbacks.title,
    fallbacks.filename,
    "PDF Best Practice"
  );
  const mainContent = pickOutline(
    src.mainContent,
    src["주요 내용"],
    src["주요내용"],
    src.aiSummary,
    src.summary,
    src.content,
    src.description,
    fallbacks.mainContent
  );
  const beforeText = pickOutline(
    src.beforeText,
    src.before,
    src["Before"],
    src["before"],
    src["도입 전"],
    src["도입전"],
    beforeAfter.before,
    beforeAfter.Before,
    ba.before,
    ba.Before,
    fallbacks.beforeText
  );
  const afterText = pickOutline(
    src.afterText,
    src.after,
    src["After"],
    src["after"],
    src["도입 후"],
    src["도입후"],
    beforeAfter.after,
    beforeAfter.After,
    ba.after,
    ba.After,
    fallbacks.afterText
  );
  const improvementEffect = pickOutline(
    src.improvementEffect,
    src["개선효과"],
    src["개선 효과"],
    src.outcome,
    src.effect,
    src.efficiency,
    src.benefits,
    src.result,
    fallbacks.improvementEffect
  );
  const tags = normalizeCaseTags(
    src.tags || src["태그"] || src.keywords || src["키워드"],
    [title, mainContent, improvementEffect].filter(Boolean).join(" ")
  );
  const category = normalizeCaseCategory(
    pickText(src.category, src["분야"], src["카테고리"], fallbacks.category, "기획")
  );

  return {
    title,
    mainContent,
    beforeText,
    afterText,
    improvementEffect,
    tags,
    category,
    geminiSummary: {
      title,
      mainContent,
      beforeText,
      afterText,
      improvementEffect
    }
  };
}

function extractJson(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("Gemini 응답에서 JSON을 파싱하지 못했습니다.");
  }
}

async function analyzeWithGemini({ buffer, filename, mimeType, category }) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    const err = new Error(
      "Gemini API Key가 없습니다. Best Practice Library에서 API Key를 등록하세요."
    );
    err.status = 503;
    throw err;
  }

  const prompt = `당신은 AX(AI Transformation) Best Practice 아키비스트입니다.
업로드된 PDF(또는 이미지) 사례 문서를 분석하고, JSON 객체만 반환하세요.
다른 설명/마크다운/코드펜스는 출력하지 않습니다.

작성 원칙(개조식 필수):
- title을 제외한 모든 본문 필드는 서술형 문장(합니다/했다/이다) 금지
- 각 항목은 "- "로 시작하는 한 줄, 줄바꿈으로만 구분
- 명사구·동사구 중심, 핵심 키워드와 수치만 남김
- 한 줄에 한 사실만, 수식어·접속어 최소화
- 문서에 없는 내용은 추측하지 않음

분야(category) 택일 규칙:
- 아래 11개 중 문서 업무 성격에 가장 가까운 것 하나만 선택
- 목록 밖 값, 복수 선택, "일반" 사용 금지
- 기획 | 개발 | 마케팅 | 영업 | 구매 | 제조 | 품질 | 물류 | 서비스 | 재무/경리 | 인사/총무

태그(tags) 규칙:
- 문서의 핵심 키워드를 정확히 5개 배열로 반환
- 명사/복합명사 위주, 2~12자, 검색에 쓸 실무 용어
- 분야명(기획/개발 등), 일반어(사례/분석/보고서/AI/AX)만으로 채우지 말 것
- 문서에 등장하거나 주제를 대표하는 용어만, 중복·유사어 금지

필드별 분량:
- mainContent: 5~8개 항목 (배경, 적용 기술, 추진 방식, 핵심 포인트)
- beforeText: 3~5개 항목 (도입 전 업무/문제)
- afterText: 3~5개 항목 (도입 후 변화)
- improvementEffect: 3~5개 항목 (정량 수치 우선, 없으면 정성 효과)
- tags: 핵심 키워드 5개

스키마:
{
  "title": "사례 제목",
  "mainContent": "- 항목\\n- 항목",
  "beforeText": "- 항목\\n- 항목",
  "afterText": "- 항목\\n- 항목",
  "improvementEffect": "- 항목\\n- 항목",
  "category": "기획|개발|마케팅|영업|구매|제조|품질|물류|서비스|재무/경리|인사/총무 중 택일",
  "tags": ["키워드1", "키워드2", "키워드3", "키워드4", "키워드5"]
}`;

  const parts = [
    { text: prompt },
    {
      inlineData: {
        data: buffer.toString("base64"),
        mimeType: detectSourceType(filename, mimeType)?.mime || mimeType || "application/pdf"
      }
    }
  ];

  let text;
  try {
    ({ text } = await generateContent(parts, {
      apiKey,
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
    }));
  } catch {
    ({ text } = await generateContent(parts, {
      apiKey,
      generationConfig: { temperature: 0.2 }
    }));
  }

  const parsed = extractJson(text);
  return normalizeGeminiSummaryResult(parsed, {
    filename,
    category
  });
}

async function listCases(status) {
  const sb = getSupabaseAdmin();
  let q = sb.from("hub_cases").select("*").order("created_at", { ascending: false });
  if (status && status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapCase);
}

async function getCase(id) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("hub_cases").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) {
    const err = new Error("Best Practice를 찾을 수 없습니다.");
    err.status = 404;
    throw err;
  }
  return mapCase(data);
}

async function getCasePdfBuffer(id) {
  const item = await getCase(id);
  if (!item.pdfPath) {
    const err = new Error("업로드된 원본 파일이 없습니다.");
    err.status = 404;
    throw err;
  }

  const type = detectSourceType(item.pdfFilename || item.pdfPath, "") || {
    mime: "application/pdf"
  };
  const localPath = resolveLocalPdfPath(item.pdfPath);
  if (localPath) {
    if (!fs.existsSync(localPath)) {
      const err = new Error("로컬 원본 파일을 찾을 수 없습니다.");
      err.status = 404;
      throw err;
    }
    return {
      buffer: fs.readFileSync(localPath),
      filename: item.pdfFilename || path.basename(localPath),
      contentType: type.mime
    };
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb.storage.from(BUCKET).download(item.pdfPath);
  if (error || !data) {
    const err = new Error(error?.message || "원본 파일을 다운로드하지 못했습니다.");
    err.status = 404;
    throw err;
  }
  const ab = await data.arrayBuffer();
  return {
    buffer: Buffer.from(ab),
    filename: item.pdfFilename || path.basename(item.pdfPath),
    contentType: type.mime
  };
}

async function analyzePdfAndCreateDraft({ buffer, filename, category, mimeType }) {
  if (!buffer?.length) {
    const err = new Error("PDF 또는 PNG 파일이 필요합니다.");
    err.status = 400;
    throw err;
  }
  if (!detectSourceType(filename, mimeType)) {
    const err = new Error("PDF 또는 PNG 파일만 업로드할 수 있습니다.");
    err.status = 400;
    throw err;
  }

  const id = uid("cs");
  const parsed = await analyzeWithGemini({ buffer, filename, mimeType, category });
  const stored = await storePdf({ id, buffer, filename, mimeType });

  const {
    title,
    mainContent,
    beforeText,
    afterText,
    improvementEffect,
    tags,
    category: parsedCategory,
    geminiSummary
  } = parsed;

  if (!title || !mainContent || !beforeText || !afterText || !improvementEffect) {
    const missing = [
      !title && "제목",
      !mainContent && "주요 내용",
      !beforeText && "Before",
      !afterText && "After",
      !improvementEffect && "개선효과"
    ].filter(Boolean);
    const err = new Error(`Gemini 결과에 필수 항목이 없습니다: ${missing.join(", ")}`);
    err.status = 502;
    throw err;
  }

  const row = {
    id,
    category: normalizeCaseCategory(parsedCategory || category),
    title,
    summary: mainContent,
    ai_summary: mainContent,
    before_text: beforeText,
    after_text: afterText,
    outcome: improvementEffect,
    efficiency: improvementEffect,
    key_points: [],
    tags,
    pdf_path: stored.pdfPath,
    pdf_filename: stored.pdfFilename,
    gemini_raw: {
      ...parsed,
      ...geminiSummary,
      tags
    },
    status: "published"
  };

  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("hub_cases").insert(row).select("*").single();
  if (error) throw error;
  const mapped = mapCase(data);
  return {
    ...mapped,
    title: mapped.title,
    mainContent: mapped.mainContent,
    beforeText: mapped.beforeText,
    afterText: mapped.afterText,
    improvementEffect: mapped.improvementEffect,
    geminiSummary: {
      title: mapped.title,
      mainContent: mapped.mainContent,
      beforeText: mapped.beforeText,
      afterText: mapped.afterText,
      improvementEffect: mapped.improvementEffect
    }
  };
}

async function createCaseManual(body) {
  const sb = getSupabaseAdmin();
  const title = String(body.title || "").trim();
  const mainContent = String(body.mainContent || body.aiSummary || body.summary || "");
  const improvementEffect = String(body.improvementEffect || body.outcome || body.efficiency || "");
  const tags =
    Array.isArray(body.tags) && body.tags.length
      ? normalizeCaseTags(body.tags, title)
      : extractTagsFromTitle(title);
  const row = {
    id: uid("cs"),
    category: normalizeCaseCategory(body.category),
    title,
    summary: mainContent,
    ai_summary: mainContent,
    before_text: String(body.beforeText || ""),
    after_text: String(body.afterText || ""),
    outcome: improvementEffect,
    efficiency: improvementEffect,
    key_points: Array.isArray(body.keyPoints) ? body.keyPoints : [],
    tags,
    pdf_path: "",
    pdf_filename: "",
    gemini_raw: {
      title,
      mainContent,
      beforeText: String(body.beforeText || ""),
      afterText: String(body.afterText || ""),
      improvementEffect,
      tags
    },
    status: "published"
  };
  if (!row.title) {
    const err = new Error("제목이 필요합니다.");
    err.status = 400;
    throw err;
  }
  const { data, error } = await sb.from("hub_cases").insert(row).select("*").single();
  if (error) throw error;
  return mapCase(data);
}

async function updateCase(id, body) {
  const sb = getSupabaseAdmin();
  const patch = {};
  if (body.category != null) patch.category = normalizeCaseCategory(body.category);
  if (body.title != null) patch.title = String(body.title).trim();
  if (body.mainContent != null || body.aiSummary != null || body.summary != null) {
    const mainContent = String(body.mainContent ?? body.aiSummary ?? body.summary ?? "");
    patch.summary = mainContent;
    patch.ai_summary = mainContent;
  }
  if (body.beforeText != null) patch.before_text = String(body.beforeText);
  if (body.afterText != null) patch.after_text = String(body.afterText);
  if (body.improvementEffect != null || body.outcome != null || body.efficiency != null) {
    const improvementEffect = String(
      body.improvementEffect ?? body.outcome ?? body.efficiency ?? ""
    );
    patch.outcome = improvementEffect;
    patch.efficiency = improvementEffect;
  }
  if (body.tags != null || body.tagsText != null) {
    const incoming = Array.isArray(body.tags)
      ? body.tags.map((s) => String(s).trim()).filter(Boolean)
      : String(body.tagsText || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
    patch.tags = incoming;
  }
  if (body.status === "draft" || body.status === "published") patch.status = body.status;
  const { data, error } = await sb.from("hub_cases").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return mapCase(data);
}

async function publishCase(id) {
  return updateCase(id, { status: "published" });
}

async function deleteCase(id) {
  const item = await getCase(id).catch(() => null);
  const sb = getSupabaseAdmin();
  if (item?.pdfPath) {
    const localPath = resolveLocalPdfPath(item.pdfPath);
    if (localPath && fs.existsSync(localPath)) {
      try {
        fs.unlinkSync(localPath);
      } catch {
        /* ignore */
      }
    } else if (!String(item.pdfPath).startsWith("local:")) {
      await sb.storage.from(BUCKET).remove([item.pdfPath]).catch(() => null);
    }
  }
  const { error } = await sb.from("hub_cases").delete().eq("id", id);
  if (error) throw error;
  return { ok: true };
}

module.exports = {
  detectSourceType,
  CASE_CATEGORIES,
  ALLOWED_SOURCE_MIMES,
  listCases,
  getCase,
  getCasePdfBuffer,
  analyzePdfAndCreateDraft,
  createCaseManual,
  updateCase,
  publishCase,
  deleteCase
};
