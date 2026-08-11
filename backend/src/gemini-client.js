/**
 * Python 대응:
 *   import google.generativeai as genai
 *   genai.configure(api_key="발급받으신_API_KEY")
 *   model = genai.GenerativeModel('gemini-3.5-flash-lite')
 */
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { getGeminiApiKey, getGeminiModel } = require("./gemini-config");

/** 최소 비용 Flash-Lite (google.generativeai GenerativeModel 기본값) */
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

const FALLBACK_MODELS = ["gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-2.5-flash"];

function createGenAI(apiKey = getGeminiApiKey()) {
  const key = String(apiKey || "").trim();
  if (!key) {
    const err = new Error(
      "Gemini API Key가 없습니다. .env의 GEMINI_API_KEY 또는 Best Practice에서 Key를 등록하세요."
    );
    err.status = 503;
    throw err;
  }
  return new GoogleGenerativeAI(key);
}

function getGenerativeModel(modelName, apiKey) {
  const genai = createGenAI(apiKey);
  return genai.getGenerativeModel({
    model: modelName || getGeminiModel() || DEFAULT_GEMINI_MODEL
  });
}

function isUnavailableModelError(err) {
  const msg = String(err?.message || err || "");
  return /404 Not Found/i.test(msg) && /no longer available/i.test(msg);
}

function modelCandidates(preferred) {
  return [
    ...new Set(
      [preferred, getGeminiModel(), DEFAULT_GEMINI_MODEL, ...FALLBACK_MODELS].filter(Boolean)
    )
  ];
}

/**
 * generateContent with 최소비용 모델 우선, 미지원 시 Flash-Lite latest로 폴백
 */
async function generateContent(parts, options = {}) {
  const candidates = modelCandidates(options.model);
  const generationConfig = options.generationConfig || { temperature: 0.2 };
  const genai = createGenAI(options.apiKey);
  let lastErr;
  for (const modelName of candidates) {
    try {
      const model = genai.getGenerativeModel({ model: modelName, generationConfig });
      const result = await model.generateContent(parts);
      return {
        model: modelName,
        text: result.response?.text?.() || ""
      };
    } catch (err) {
      lastErr = err;
      if (!isUnavailableModelError(err)) throw err;
    }
  }
  throw lastErr;
}

module.exports = {
  DEFAULT_GEMINI_MODEL,
  FALLBACK_MODELS,
  createGenAI,
  getGenerativeModel,
  generateContent,
  isUnavailableModelError
};
