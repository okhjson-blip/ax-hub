const express = require("express");
const multer = require("multer");
const { isSupabaseConfigured, isDashboardSupabaseConfigured } = require("./env");
const { buildHubSummary } = require("./hub-summary");
const {
  adminPassword,
  accessPassword,
  createAdminToken,
  createAccessToken,
  verifyAccessToken,
  readAccessToken,
  setAccessCookie,
  requireAccess,
  requireAdmin,
  timingSafeEqualString
} = require("./auth");
const { listTaskAssets, listImportedSourceIds, importTasks, deleteTaskAsset, getTaskAsset, createTaskAsset, updateTaskAsset } = require("./task-assets");
const {
  listPrompts,
  getPrompt,
  createPrompt,
  updatePrompt,
  createPromptFromTxt,
  deletePrompt
} = require("./prompts");
const {
  listVibeDocs,
  getVibeDoc,
  createVibeDoc,
  updateVibeDoc,
  createVibeDocFromTxt,
  deleteVibeDoc,
  SECTION_KEYS
} = require("./vibe-docs");
const {
  listCases,
  getCase,
  getCasePdfBuffer,
  analyzePdfAndCreateDraft,
  createCaseManual,
  updateCase,
  publishCase,
  deleteCase
} = require("./cases");
const { syncDashboardToHub } = require("./dashboard-sync");
const { loadGeminiConfig, getGeminiStatus, saveGeminiApiKey } = require("./gemini-config");

loadGeminiConfig().catch((err) => console.warn("gemini config load:", err.message));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function createRouter() {
  const router = express.Router();

  router.get("/health", (_req, res) => {
    const db = isSupabaseConfigured() ? "supabase" : "unconfigured";
    const gemini = getGeminiStatus();
    res.json({
      ok: true,
      service: "ax-hub",
      db,
      runtime: process.env.VERCEL ? "vercel" : "node",
      supabaseConfigured: isSupabaseConfigured(),
      dashboardSupabaseConfigured: isDashboardSupabaseConfigured(),
      dashboardSource: isDashboardSupabaseConfigured()
        ? "ax-pjt-dashboard"
        : isSupabaseConfigured()
          ? "hub-fallback"
          : "none",
      geminiConfigured: gemini.configured,
      geminiModel: gemini.model,
      time: new Date().toISOString(),
      ...(process.env.VERCEL && !isSupabaseConfigured()
        ? {
            warning:
              "Vercel Environment Variables에 SUPABASE_URL, SUPABASE_SECRET_KEY를 설정하세요."
          }
        : {})
    });
  });

  router.get("/auth/access", (req, res) => {
    const ok = verifyAccessToken(readAccessToken(req));
    res.status(ok ? 200 : 401).json({ ok, access: ok });
  });

  router.post("/auth/access", (req, res) => {
    const password = String(req.body?.password || "");
    if (!timingSafeEqualString(password, accessPassword())) {
      return res.status(401).json({ error: "비밀번호가 올바르지 않습니다." });
    }
    const token = createAccessToken();
    setAccessCookie(res, token);
    res.json({ ok: true, role: "access", token });
  });

  router.use(requireAccess);

  router.post("/auth/admin", (req, res) => {
    const password = String(req.body?.password || "");
    if (password !== adminPassword()) {
      return res.status(401).json({ error: "비밀번호가 올바르지 않습니다." });
    }
    const token = createAdminToken();
    res.json({ role: "admin", name: "관리자", token });
  });

  router.get(
    "/gemini/status",
    asyncHandler(async (_req, res) => {
      await loadGeminiConfig();
      res.json(getGeminiStatus());
    })
  );

  router.post(
    "/gemini/key",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const status = await saveGeminiApiKey({
        apiKey: req.body?.apiKey,
        model: req.body?.model
      });
      res.json({ ok: true, ...status });
    })
  );

  router.get(
    "/hub-summary",
    asyncHandler(async (_req, res) => {
      if (!isSupabaseConfigured()) {
        return res.status(503).json({
          error:
            "Supabase 환경변수가 없습니다. .env에 SUPABASE_URL, SUPABASE_SECRET_KEY를 설정하세요."
        });
      }
      if (!isDashboardSupabaseConfigured()) {
        console.warn(
          "[hub-summary] DASHBOARD_SUPABASE_* 없음 → hub 프로젝트 테이블로 폴백합니다."
        );
      }

      let syncResult = { synced: false, reason: "skipped" };
      try {
        syncResult = await syncDashboardToHub();
      } catch (err) {
        console.error("[hub-summary] dashboard sync failed:", err.message);
        syncResult = { synced: false, reason: "sync-error", error: err.message };
      }

      const summary = await buildHubSummary();
      const imported = await listImportedSourceIds();
      summary.importedTaskIds = [...imported];
      summary.source = isDashboardSupabaseConfigured() ? "ax-pjt-dashboard" : "hub-fallback";
      summary.hubSync = syncResult;
      res.json(summary);
    })
  );

  router.get(
    "/task-assets",
    asyncHandler(async (_req, res) => {
      res.json({ items: await listTaskAssets() });
    })
  );

  router.get(
    "/task-assets/:id",
    asyncHandler(async (req, res) => {
      res.json(await getTaskAsset(req.params.id));
    })
  );

  router.post(
    "/task-assets",
    requireAdmin,
    asyncHandler(async (req, res) => {
      res.status(201).json(await createTaskAsset(req.body || {}));
    })
  );

  router.patch(
    "/task-assets/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      res.json(await updateTaskAsset(req.params.id, req.body || {}));
    })
  );

  router.post(
    "/task-assets/import",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await importTasks(req.body?.taskIds || []);
      res.status(result.imported.length ? 201 : 200).json(result);
    })
  );

  router.delete(
    "/task-assets/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      res.json(await deleteTaskAsset(req.params.id));
    })
  );

  router.get(
    "/prompts",
    asyncHandler(async (req, res) => {
      res.json({ items: await listPrompts(req.query.category) });
    })
  );

  router.get(
    "/prompts/:id",
    asyncHandler(async (req, res) => {
      res.json(await getPrompt(req.params.id));
    })
  );

  router.post(
    "/prompts",
    requireAdmin,
    asyncHandler(async (req, res) => {
      res.status(201).json(await createPrompt(req.body || {}));
    })
  );

  router.post(
    "/prompts/from-txt",
    requireAdmin,
    upload.single("txt"),
    asyncHandler(async (req, res) => {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "TXT 파일이 필요합니다." });
      }
      const name = String(file.originalname || "").toLowerCase();
      if (!name.endsWith(".txt") && file.mimetype && !String(file.mimetype).includes("text")) {
        return res.status(400).json({ error: "TXT 파일만 업로드할 수 있습니다." });
      }
      let meta = {};
      if (req.body?.meta) {
        try {
          meta = JSON.parse(req.body.meta);
        } catch {
          meta = {};
        }
      } else {
        meta = {
          title: req.body?.title,
          author: req.body?.author,
          description: req.body?.description,
          variablesText: req.body?.variablesText,
          tagsText: req.body?.tagsText,
          statik: {
            l1: req.body?.l1,
            l2: req.body?.l2,
            l3: req.body?.l3,
            l4: req.body?.l4
          }
        };
      }
      const created = await createPromptFromTxt({
        buffer: file.buffer,
        filename: file.originalname,
        body: meta
      });
      res.status(201).json(created);
    })
  );

  router.patch(
    "/prompts/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      res.json(await updatePrompt(req.params.id, req.body || {}));
    })
  );

  router.delete(
    "/prompts/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      res.json(await deletePrompt(req.params.id));
    })
  );

  router.get(
    "/vibe-docs",
    asyncHandler(async (req, res) => {
      res.json({ items: await listVibeDocs(req.query.category) });
    })
  );

  router.get(
    "/vibe-docs/:id",
    asyncHandler(async (req, res) => {
      res.json(await getVibeDoc(req.params.id));
    })
  );

  router.post(
    "/vibe-docs",
    requireAdmin,
    asyncHandler(async (req, res) => {
      res.status(201).json(await createVibeDoc(req.body || {}));
    })
  );

  router.post(
    "/vibe-docs/from-txt",
    requireAdmin,
    upload.single("txt"),
    asyncHandler(async (req, res) => {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "TXT 파일이 필요합니다." });
      }
      const name = String(file.originalname || "").toLowerCase();
      if (!name.endsWith(".txt") && file.mimetype && !String(file.mimetype).includes("text")) {
        return res.status(400).json({ error: "TXT 파일만 업로드할 수 있습니다." });
      }
      let meta = {};
      if (req.body?.meta) {
        try {
          meta = JSON.parse(req.body.meta);
        } catch {
          meta = {};
        }
      } else {
        meta = {
          title: req.body?.title,
          author: req.body?.author,
          description: req.body?.description,
          tagsText: req.body?.tagsText,
          statik: {
            l1: req.body?.l1,
            l2: req.body?.l2,
            l3: req.body?.l3,
            l4: req.body?.l4
          }
        };
      }
      const section = SECTION_KEYS.includes(req.body?.section) ? req.body.section : "readme";
      const created = await createVibeDocFromTxt({
        buffer: file.buffer,
        filename: file.originalname,
        section,
        body: meta
      });
      res.status(201).json(created);
    })
  );

  router.patch(
    "/vibe-docs/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      res.json(await updateVibeDoc(req.params.id, req.body || {}));
    })
  );

  router.delete(
    "/vibe-docs/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      res.json(await deleteVibeDoc(req.params.id));
    })
  );

  router.get(
    "/cases",
    asyncHandler(async (req, res) => {
      res.json({ items: await listCases(req.query.status) });
    })
  );

  router.get(
    "/cases/:id/pdf",
    asyncHandler(async (req, res) => {
      const file = await getCasePdfBuffer(req.params.id);
      res.setHeader("Content-Type", file.contentType || "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename*=UTF-8''${encodeURIComponent(file.filename || "document.pdf")}`
      );
      res.setHeader("Cache-Control", "private, max-age=60");
      res.send(file.buffer);
    })
  );

  router.get(
    "/cases/:id",
    asyncHandler(async (req, res) => {
      res.json(await getCase(req.params.id));
    })
  );

  router.post(
    "/cases",
    requireAdmin,
    asyncHandler(async (req, res) => {
      res.status(201).json(await createCaseManual(req.body || {}));
    })
  );

  router.post(
    "/cases/analyze",
    requireAdmin,
    upload.single("pdf"),
    asyncHandler(async (req, res) => {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "PDF 또는 PNG 파일이 필요합니다." });
      }
      const name = String(file.originalname || "").toLowerCase();
      const mime = String(file.mimetype || "").toLowerCase();
      const isPdf = name.endsWith(".pdf") || mime === "application/pdf";
      const isPng = name.endsWith(".png") || mime === "image/png";
      if (!isPdf && !isPng) {
        return res.status(400).json({ error: "PDF 또는 PNG 파일만 업로드할 수 있습니다." });
      }
      const draft = await analyzePdfAndCreateDraft({
        buffer: file.buffer,
        filename: file.originalname,
        mimeType: isPng ? "image/png" : file.mimetype || "application/pdf"
      });
      res.status(201).json(draft);
    })
  );

  router.patch(
    "/cases/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      res.json(await updateCase(req.params.id, req.body || {}));
    })
  );

  router.post(
    "/cases/:id/publish",
    requireAdmin,
    asyncHandler(async (req, res) => {
      res.json(await publishCase(req.params.id));
    })
  );

  router.delete(
    "/cases/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      res.json(await deleteCase(req.params.id));
    })
  );

  return router;
}

module.exports = { createRouter };
