require("./env");
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const { createRouter } = require("./routes");
const { isSupabaseConfigured } = require("./env");

const PUBLIC_DIR = path.join(__dirname, "..", "..", "public");

function isVercelRuntime() {
  return Boolean(process.env.VERCEL);
}

/**
 * Express 앱 팩토리 (listen 없음).
 * - 로컬: server.js에서 listen
 * - Vercel: api/index.js 가 핸들러로 export
 */
function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  if (isVercelRuntime() && !isSupabaseConfigured()) {
    app.use("/api", (req, res, next) => {
      if (req.path === "/health" || req.path.endsWith("/health")) return next();
      return res.status(503).json({
        error:
          "Supabase 환경변수가 없습니다. Vercel Project Settings → Environment Variables에 SUPABASE_URL, SUPABASE_SECRET_KEY를 등록하세요."
      });
    });
  }

  app.use("/api", createRouter());

  if (fs.existsSync(PUBLIC_DIR)) {
    app.use(express.static(PUBLIC_DIR));
  }

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    const indexPath = path.join(PUBLIC_DIR, "index.html");
    if (!fs.existsSync(indexPath)) {
      return res.status(404).send("index.html not found");
    }
    res.sendFile(indexPath);
  });

  app.use((err, _req, res, _next) => {
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
      return res.status(400).json({ error: "요청 JSON 형식이 올바르지 않습니다." });
    }
    if (err?.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "파일 크기는 15MB 이하여야 합니다." });
    }
    const status = Number(err.status || err.statusCode) || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.message || "서버 오류가 발생했습니다." });
  });

  return app;
}

module.exports = {
  createApp,
  PUBLIC_DIR,
  isVercelRuntime,
  isSupabaseConfigured
};
