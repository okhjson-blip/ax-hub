const fs = require("fs");
const path = require("path");
const { isSupabaseConfigured } = require("./env");
const { getSupabaseAdmin } = require("./supabase");

const SETTINGS_KEY = "gemini_api_key";
const MODEL_KEY = "gemini_model";
/** python: genai.GenerativeModel('gemini-3.5-flash-lite') */
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const CONFIG_PATH = path.join(DATA_DIR, "gemini-config.json");

let memoryKey = "";
let memoryModel = "";

function readFileConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8") || "{}");
  } catch {
    return {};
  }
}

function writeFileConfig(config) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
    return true;
  } catch (err) {
    console.warn("gemini config file write failed:", err.message);
    return false;
  }
}

async function readDbSetting(key) {
  if (!isSupabaseConfigured()) return "";
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("hub_settings").select("value").eq("key", key).maybeSingle();
    if (error) throw error;
    return String(data?.value || "").trim();
  } catch (err) {
    console.warn("hub_settings read failed:", err.message);
    return "";
  }
}

async function writeDbSetting(key, value) {
  if (!isSupabaseConfigured()) return false;
  try {
    const sb = getSupabaseAdmin();
    const { error } = await sb.from("hub_settings").upsert(
      { key, value: String(value || ""), updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn("hub_settings write failed:", err.message);
    return false;
  }
}

async function loadGeminiConfig() {
  const file = readFileConfig();
  const dbKey = await readDbSetting(SETTINGS_KEY);
  const dbModel = await readDbSetting(MODEL_KEY);
  memoryKey =
    String(process.env.GEMINI_API_KEY || "").trim() ||
    dbKey ||
    String(file.apiKey || "").trim() ||
    memoryKey;
  memoryModel =
    String(process.env.GEMINI_MODEL || "").trim() ||
    dbModel ||
    String(file.model || "").trim() ||
    memoryModel ||
    DEFAULT_GEMINI_MODEL;
  if (memoryKey) process.env.GEMINI_API_KEY = memoryKey;
  if (memoryModel) process.env.GEMINI_MODEL = memoryModel;
  return getGeminiStatus();
}

function getGeminiApiKey() {
  return (
    String(memoryKey || "").trim() ||
    String(process.env.GEMINI_API_KEY || "").trim() ||
    String(readFileConfig().apiKey || "").trim()
  );
}

function getGeminiModel() {
  return (
    String(memoryModel || "").trim() ||
    String(process.env.GEMINI_MODEL || "").trim() ||
    DEFAULT_GEMINI_MODEL
  );
}

function getGeminiStatus() {
  const key = getGeminiApiKey();
  const masked = key ? `${key.slice(0, 4)}…${key.slice(-4)}` : "";
  return {
    configured: Boolean(key),
    model: getGeminiModel(),
    maskedKey: masked
  };
}

async function saveGeminiApiKey({ apiKey, model }) {
  const key = String(apiKey || "").trim();
  if (!key) {
    const err = new Error("Gemini API Key가 필요합니다.");
    err.status = 400;
    throw err;
  }
  const nextModel =
    String(model || getGeminiModel() || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
  memoryKey = key;
  memoryModel = nextModel;
  process.env.GEMINI_API_KEY = key;
  process.env.GEMINI_MODEL = nextModel;
  writeFileConfig({ apiKey: key, model: nextModel, updatedAt: new Date().toISOString() });
  await writeDbSetting(SETTINGS_KEY, key);
  await writeDbSetting(MODEL_KEY, nextModel);
  return getGeminiStatus();
}

module.exports = {
  DEFAULT_GEMINI_MODEL,
  loadGeminiConfig,
  getGeminiApiKey,
  getGeminiModel,
  getGeminiStatus,
  saveGeminiApiKey
};
