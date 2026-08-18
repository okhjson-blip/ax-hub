(function () {
  const titles = {
    home: { eyebrow: "통합 현황", title: "메인 홈 / 통합 대시보드" },
    tasks: { eyebrow: "Knowledge", title: "과제 Library" },
    prompts: { eyebrow: "Knowledge", title: "프롬프트 Library" },
    vibe: { eyebrow: "Knowledge", title: "Vibe Coding Library" },
    cases: { eyebrow: "Knowledge", title: "Best Practice Library" }
  };

  const DIFFICULTY_RANK = { 상: 0, 중: 1, 하: 2 };
  const TOKEN_KEY = "axHubAdminToken";
  const ACCESS_TOKEN_KEY = "axHubAccessToken";
  const VIBE_SECTIONS = [
    { key: "readme", fieldId: "vd-readme", fileId: "vd-readme-file", filenameId: "vd-readme-filename", label: "readme.md" },
    { key: "planDoc", fieldId: "vd-plan", fileId: "vd-plan-file", filenameId: "vd-plan-filename", label: "개발 계획서" },
    { key: "uxScenario", fieldId: "vd-ux", fileId: "vd-ux-file", filenameId: "vd-ux-filename", label: "UX 시나리오 설계서" },
    { key: "uiDesign", fieldId: "vd-ui", fileId: "vd-ui-file", filenameId: "vd-ui-filename", label: "UI 디자인 설계서" },
    { key: "otherDoc", fieldId: "vd-other", fileId: "vd-other-file", filenameId: "vd-other-filename", label: "기타" }
  ];

  let cachedTasks = [];
  let importedTaskIds = new Set();
  let accessToken = sessionStorage.getItem(ACCESS_TOKEN_KEY) || "";
  let adminToken = localStorage.getItem(TOKEN_KEY) || "";
  let currentView = "home";
  let cachedTaskAssets = [];
  let cachedPrompts = [];
  let cachedVibeDocs = [];
  let cachedCases = [];
  let caseSearchQuery = "";
  let statikFilter = { l1: "all", l2: "all", l3: "all", l4: "all" };
  let promptStatikFilter = { l1: "all", l2: "all", l3: "all", l4: "all" };
  let vibeStatikFilter = { l1: "all", l2: "all", l3: "all", l4: "all" };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function isAdmin() {
    return Boolean(adminToken);
  }

  function authHeaders(json = true) {
    const headers = {};
    if (json) headers["Content-Type"] = "application/json";
    if (accessToken) headers["X-Access-Token"] = accessToken;
    if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
    return headers;
  }

  function unlockApp() {
    document.body.classList.remove("locked");
    document.getElementById("access-password")?.blur();
  }

  function showAccessError(message) {
    const el = document.getElementById("access-gate-error");
    if (!el) return;
    el.textContent = message || "비밀번호가 올바르지 않습니다.";
    el.classList.remove("hidden");
  }

  async function checkAccessSession() {
    try {
      const res = await fetch("/api/auth/access", {
        headers: accessToken ? { "X-Access-Token": accessToken } : {}
      });
      const body = await res.json().catch(() => ({}));
      return res.ok && body.access;
    } catch {
      return false;
    }
  }

  async function submitAccessPassword(event) {
    event.preventDefault();
    const input = document.getElementById("access-password");
    const password = String(input?.value || "").trim();
    const btn = document.getElementById("access-gate-submit");
    const prev = btn?.textContent;
    if (!password) {
      showAccessError("비밀번호를 입력하세요.");
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = "확인 중…";
    }
    try {
      const body = await api("/api/auth/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      accessToken = body.token || "";
      if (accessToken) sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      unlockApp();
      updateAdminUi();
      loadHubSummary();
    } catch (err) {
      showAccessError(err.message || "비밀번호가 올바르지 않습니다.");
      if (input) {
        input.value = "";
        input.focus();
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prev || "접속";
      }
    }
  }

  async function gateApp() {
    document.getElementById("access-gate-form")?.addEventListener("submit", submitAccessPassword);
    const allowed = await checkAccessSession();
    if (allowed) {
      unlockApp();
      updateAdminUi();
      loadHubSummary();
      return;
    }
    document.getElementById("access-password")?.focus();
  }

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (accessToken && !headers["X-Access-Token"]) headers["X-Access-Token"] = accessToken;
    const res = await fetch(path, { ...options, headers });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `요청 실패 (${res.status})`);
    return body;
  }

  function updateAdminUi() {
    const admin = isAdmin();
    document.body.classList.toggle("mode-admin", admin);
    document.body.classList.toggle("mode-share", !admin);

    const btn = document.getElementById("admin-auth-btn");
    const status = document.getElementById("admin-status");
    const importBtn = document.getElementById("import-tasks-btn");

    document.querySelectorAll(".admin-only").forEach((el) => {
      el.disabled = !admin;
      el.classList.toggle("is-hidden-share", !admin);
    });

    if (btn) btn.textContent = admin ? "관리자 로그아웃" : "관리자 로그인";
    if (status) status.textContent = admin ? "관리자 모드" : "공유 모드";
    if (importBtn) importBtn.disabled = !admin || !selectedTaskIds().length;

    document.querySelectorAll(".task-check").forEach((el) => {
      const imported = importedTaskIds.has(el.value);
      el.disabled = imported || !admin;
    });

    if (!document.getElementById("case-analyze-form")?.classList.contains("hidden") && !admin) {
      document.getElementById("case-analyze-form")?.classList.add("hidden");
    }

    applyOpenDetailEditLocks(admin);
    if (currentView === "home") renderHomeTopActions();
  }

  function applyOpenDetailEditLocks(admin) {
    const taskOpen = !document.getElementById("task-detail-panel")?.classList.contains("hidden");
    const promptOpen = !document.getElementById("prompt-detail-panel")?.classList.contains("hidden");
    const vibeOpen = !document.getElementById("vibe-detail-panel")?.classList.contains("hidden");
    const caseOpen = !document.getElementById("case-detail-panel")?.classList.contains("hidden");

    if (taskOpen) {
      const asIs = readSteps("asis-steps");
      const toBe = readSteps("tobe-steps");
      renderStepEditor("asis-steps", asIs, admin);
      renderStepEditor("tobe-steps", toBe, admin);
      setDetailEditable(admin);
    }
    if (promptOpen) setPromptDetailEditable(admin);
    if (vibeOpen) setVibeDetailEditable(admin);
    if (caseOpen) setCaseDetailEditable(admin);
  }

  function renderHomeTopActions() {
    const actions = document.getElementById("top-actions");
    if (!actions || currentView !== "home") return;
    if (!isAdmin()) {
      actions.innerHTML = "";
      return;
    }
    actions.innerHTML =
      '<button class="primary-button admin-only" id="refresh-dashboard" type="button">과제 현황 업데이트</button>';
    document.getElementById("refresh-dashboard")?.addEventListener("click", loadHubSummary);
  }

  function selectedTaskIds() {
    return [...document.querySelectorAll(".task-check:checked")].map((el) => el.value);
  }

  function showView(viewId) {
    currentView = viewId;
    document.querySelectorAll(".nav-item").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === viewId);
    });
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    document.getElementById(viewId)?.classList.add("active");
    const meta = titles[viewId] || titles.home;
    document.getElementById("view-eyebrow").textContent = meta.eyebrow;
    document.getElementById("view-title").textContent = meta.title;
    const actions = document.getElementById("top-actions");
    if (actions) {
      if (viewId === "home") {
        renderHomeTopActions();
      } else if (viewId === "cases") {
        actions.innerHTML = `
          <span class="gemini-key-status" id="gemini-key-status"></span>
          <button class="primary-button" id="gemini-key-btn" type="button">Gemini API Key 등록</button>
        `;
        document.getElementById("gemini-key-btn")?.addEventListener("click", registerGeminiApiKey);
        refreshGeminiKeyStatus();
      } else {
        actions.innerHTML = "";
      }
    }
    if (viewId === "tasks") {
      showTaskList();
      loadTaskAssets();
    }
    if (viewId === "prompts") {
      showPromptList();
      loadPrompts();
    }
    if (viewId === "vibe") {
      showVibeList();
      loadVibeDocs();
    }
    if (viewId === "cases") {
      showCaseList();
      loadCases();
    }
  }

  function setupNavigation() {
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => showView(btn.dataset.view));
    });
  }

  function renderKpis(kpis) {
    const root = document.getElementById("kpi-grid");
    if (!root) return;
    root.innerHTML = (kpis || [])
      .map(
        (kpi) => `
      <article class="metric">
        <span>${escapeHtml(kpi.label)}</span>
        <strong>${escapeHtml(kpi.value)}</strong>
        <small>${escapeHtml(kpi.hint || "")}</small>
      </article>`
      )
      .join("");
  }

  function getSelectedSort() {
    return document.getElementById("task-sort")?.value || "company";
  }

  function sortTasks(tasks, mode) {
    const list = [...(tasks || [])];
    if (mode === "difficulty") {
      return list.sort((a, b) => {
        const da = DIFFICULTY_RANK[a.difficulty] ?? 99;
        const db = DIFFICULTY_RANK[b.difficulty] ?? 99;
        if (da !== db) return da - db;
        return String(a.name || "").localeCompare(String(b.name || ""), "ko");
      });
    }
    if (mode === "name") {
      return list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko"));
    }
    return list.sort((a, b) => {
      const byCompany = String(a.companyName || "").localeCompare(String(b.companyName || ""), "ko");
      if (byCompany !== 0) return byCompany;
      return String(a.name || "").localeCompare(String(b.name || ""), "ko");
    });
  }

  function renderTasks(tasks) {
    const root = document.getElementById("task-list");
    if (!root) return;
    const sorted = sortTasks(tasks, getSelectedSort());
    if (!sorted.length) {
      root.innerHTML = '<p class="status-msg">등록된 과제가 없습니다.</p>';
      return;
    }
    root.innerHTML = sorted
      .map((task) => {
        const rate = Math.max(0, Math.min(100, Number(task.progress) || 0));
        const imported = importedTaskIds.has(task.id);
        return `
      <article class="project-row task-row">
        <label class="task-select">
          <input class="task-check" type="checkbox" value="${escapeHtml(task.id)}" ${imported || !isAdmin() ? "disabled" : ""}>
        </label>
        <div class="task-main">
          <strong>${escapeHtml(task.name)}</strong>
          <span class="task-company">(${escapeHtml(task.companyName)})</span>
          ${imported ? '<span class="badge">Library 등록됨</span>' : ""}
          <div class="task-meta">
            <span>기간 ${escapeHtml(task.period || "기간 미정")}</span>
            <span class="badge difficulty">난이도 ${escapeHtml(task.difficulty || "중")}</span>
          </div>
        </div>
        <div class="task-progress">
          <div class="progress-label">${rate}%</div>
          <div class="progress"><span style="width:${rate}%"></span></div>
        </div>
      </article>`;
      })
      .join("");

    root.querySelectorAll(".task-check").forEach((el) => {
      el.addEventListener("change", updateAdminUi);
    });
    updateAdminUi();
  }

  function renderRisks(risks) {
    const root = document.getElementById("alert-list");
    const countEl = document.getElementById("risk-count");
    if (countEl) {
      countEl.textContent = Array.isArray(risks) && risks.length ? `일정 정체 ${risks.length}명` : "";
    }
    if (!root) return;
    if (!risks?.length) {
      root.innerHTML = "<li><span>일정 정체 참여자가 없습니다.</span></li>";
      return;
    }
    root.innerHTML = risks
      .map(
        (r) => `
      <li><b>${escapeHtml(r.code || "정체")}</b><span>${escapeHtml(r.text)}</span></li>`
      )
      .join("");
  }

  function showDashboardError(message) {
    const msg = `<p class="status-msg error">${escapeHtml(message)}</p>`;
    const kpi = document.getElementById("kpi-grid");
    const tasks = document.getElementById("task-list");
    const alerts = document.getElementById("alert-list");
    if (kpi) kpi.innerHTML = msg;
    if (tasks) tasks.innerHTML = msg;
    if (alerts) alerts.innerHTML = `<li class="status-msg error">${escapeHtml(message)}</li>`;
  }

  async function loadHubSummary() {
    const btn = document.getElementById("refresh-dashboard");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "업데이트 중…";
    }
    try {
      const body = await api(`/api/hub-summary?_=${Date.now()}`, { cache: "no-store" });
      cachedTasks = body.tasks || [];
      importedTaskIds = new Set(body.importedTaskIds || []);
      renderKpis(body.kpis);
      renderTasks(cachedTasks);
      renderRisks(body.risks);
      if (body.hubSync?.synced) {
        const c = body.hubSync.counts || {};
        console.info(
          `[hub-sync] companies=${c.companies || 0}, participants=${c.participants || 0}, tasks=${c.tasks || 0}`
        );
      } else if (body.hubSync?.reason === "sync-error") {
        console.warn("[hub-sync] failed:", body.hubSync.error || body.hubSync.reason);
      }
    } catch (err) {
      showDashboardError(err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "과제 현황 업데이트";
      }
    }
  }

  function uniqueStatikValues(items, level, parentFilter) {
    const set = new Set();
    for (const item of items || []) {
      const s = item.statik || {};
      if (parentFilter.l1 !== "all" && s.l1 !== parentFilter.l1) continue;
      if (level !== "l1" && level !== "l2" && parentFilter.l2 !== "all" && s.l2 !== parentFilter.l2) continue;
      if (level === "l2" && parentFilter.l1 !== "all" && s.l1 !== parentFilter.l1) continue;
      if (level === "l4" && parentFilter.l3 !== "all" && s.l3 !== parentFilter.l3) continue;
      if (level === "l3" && parentFilter.l2 !== "all" && s.l2 !== parentFilter.l2) continue;
      const value = String(s[level] || "").trim();
      if (value) set.add(value);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ko"));
  }

  function renderStatikFilterRow(level, values, opts) {
    const {
      rootIdPrefix = "filter",
      filterState,
      onChange
    } = opts;
    const root = document.getElementById(`${rootIdPrefix}-${level}`);
    if (!root) return;
    const selected = filterState[level] || "all";
    const options = [
      `<option value="all"${selected === "all" ? " selected" : ""}>전체</option>`
    ];
    for (const value of values) {
      options.push(
        `<option value="${escapeHtml(value)}"${selected === value ? " selected" : ""}>${escapeHtml(value)}</option>`
      );
    }
    root.innerHTML = `<select class="filter-select" data-level="${level}" aria-label="STATIK ${level.toUpperCase()}">${options.join("")}</select>`;
    root.querySelector("select")?.addEventListener("change", (e) => {
      const lvl = e.target.dataset.level;
      filterState[lvl] = e.target.value || "all";
      if (lvl === "l1") {
        filterState.l2 = "all";
        filterState.l3 = "all";
        filterState.l4 = "all";
      } else if (lvl === "l2") {
        filterState.l3 = "all";
        filterState.l4 = "all";
      } else if (lvl === "l3") {
        filterState.l4 = "all";
      }
      onChange();
    });
  }

  function renderStatikFilters() {
    const items = cachedTaskAssets;
    const opts = {
      rootIdPrefix: "filter",
      filterState: statikFilter,
      onChange: () => {
        renderStatikFilters();
        renderTaskAssetList(filterByStatik(cachedTaskAssets, statikFilter));
      }
    };
    renderStatikFilterRow("l1", uniqueStatikValues(items, "l1", { l1: "all", l2: "all", l3: "all", l4: "all" }), opts);
    renderStatikFilterRow("l2", uniqueStatikValues(items, "l2", statikFilter), opts);
    renderStatikFilterRow("l3", uniqueStatikValues(items, "l3", statikFilter), opts);
    renderStatikFilterRow("l4", uniqueStatikValues(items, "l4", statikFilter), opts);
  }

  function renderPromptStatikFilters() {
    const items = cachedPrompts;
    const opts = {
      rootIdPrefix: "prompt-filter",
      filterState: promptStatikFilter,
      onChange: () => {
        renderPromptStatikFilters();
        renderPromptList(filterByStatik(cachedPrompts, promptStatikFilter));
      }
    };
    renderStatikFilterRow("l1", uniqueStatikValues(items, "l1", { l1: "all", l2: "all", l3: "all", l4: "all" }), opts);
    renderStatikFilterRow("l2", uniqueStatikValues(items, "l2", promptStatikFilter), opts);
    renderStatikFilterRow("l3", uniqueStatikValues(items, "l3", promptStatikFilter), opts);
    renderStatikFilterRow("l4", uniqueStatikValues(items, "l4", promptStatikFilter), opts);
  }

  function renderVibeStatikFilters() {
    const items = cachedVibeDocs;
    const opts = {
      rootIdPrefix: "vibe-filter",
      filterState: vibeStatikFilter,
      onChange: () => {
        renderVibeStatikFilters();
        renderVibeList(filterByStatik(cachedVibeDocs, vibeStatikFilter));
      }
    };
    renderStatikFilterRow("l1", uniqueStatikValues(items, "l1", { l1: "all", l2: "all", l3: "all", l4: "all" }), opts);
    renderStatikFilterRow("l2", uniqueStatikValues(items, "l2", vibeStatikFilter), opts);
    renderStatikFilterRow("l3", uniqueStatikValues(items, "l3", vibeStatikFilter), opts);
    renderStatikFilterRow("l4", uniqueStatikValues(items, "l4", vibeStatikFilter), opts);
  }

  function filterByStatik(items, filter) {
    return (items || []).filter((item) => {
      const s = item.statik || {};
      if (filter.l1 !== "all" && s.l1 !== filter.l1) return false;
      if (filter.l2 !== "all" && s.l2 !== filter.l2) return false;
      if (filter.l3 !== "all" && s.l3 !== filter.l3) return false;
      if (filter.l4 !== "all" && s.l4 !== filter.l4) return false;
      return true;
    });
  }

  function filterTaskAssets(items) {
    return filterByStatik(items, statikFilter);
  }

  function updateStatikBreadcrumb() {
    const el = document.getElementById("statik-breadcrumb");
    if (!el) return;
    const parts = ["l1", "l2", "l3", "l4"]
      .map((k) => document.getElementById(`td-${k}`)?.value.trim())
      .filter(Boolean);
    el.textContent = parts.length ? parts.join(" › ") : "L1~L4 경로가 여기 표시됩니다.";
  }

  function updatePromptStatikBreadcrumb() {
    const el = document.getElementById("prompt-statik-breadcrumb");
    if (!el) return;
    const parts = ["l1", "l2", "l3", "l4"]
      .map((k) => document.getElementById(`pd-${k}`)?.value.trim())
      .filter(Boolean);
    el.textContent = parts.length ? parts.join(" › ") : "L1~L4 경로가 여기 표시됩니다.";
  }

  function updateVibeStatikBreadcrumb() {
    const el = document.getElementById("vibe-statik-breadcrumb");
    if (!el) return;
    const parts = ["l1", "l2", "l3", "l4"]
      .map((k) => document.getElementById(`vd-${k}`)?.value.trim())
      .filter(Boolean);
    el.textContent = parts.length ? parts.join(" › ") : "L1~L4 경로가 여기 표시됩니다.";
  }

  function calcDurationMonths(startDate, endDate) {
    if (!startDate || !endDate) return "";
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return "";
    const months =
      (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    const dayFactor = (end.getDate() - start.getDate()) / 30;
    const value = Math.max(0, Math.round((months + dayFactor) * 10) / 10);
    return String(value);
  }

  function updateDurationMonths() {
    const start = document.getElementById("td-start")?.value || "";
    const end = document.getElementById("td-end")?.value || "";
    const monthsEl = document.getElementById("td-months");
    if (monthsEl) monthsEl.value = calcDurationMonths(start, end);
  }

  function showTaskList() {
    document.getElementById("task-list-panel")?.classList.remove("hidden");
    document.getElementById("task-detail-panel")?.classList.add("hidden");
    document.getElementById("view-title").textContent = "과제 Library";
  }

  function showTaskDetail() {
    document.getElementById("task-list-panel")?.classList.add("hidden");
    document.getElementById("task-detail-panel")?.classList.remove("hidden");
  }

  function parseStepsFromText(text, kind = "asis") {
    return String(text || "")
      .split(/\s*>\s*|\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const cleaned = line.replace(/^\d+\.\s*/, "");
        const bracket = cleaned.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
        if (bracket) {
          const inner = bracket[2].split(/[｜|]/).map((s) => s.trim()).filter(Boolean);
          const minutesRaw = String(inner[2] || "").replace(/분/g, "").replace(/,/g, "").trim();
          const minutes = minutesRaw === "" ? null : Number(minutesRaw);
          const diffRaw = String(inner[3] || "").replace(/난이도/g, "").trim();
          return {
            name: bracket[1].trim(),
            method: inner[0] || "",
            tool: inner[1] || "",
            minutes: Number.isFinite(minutes) ? minutes : null,
            difficulty: kind === "tobe" ? (diffRaw || "-") : ""
          };
        }
        const parts = cleaned.split(/\s*[—–]\s*/);
        if (parts.length > 1) {
          const bits = parts.slice(1).join(" — ").split(/\s*\/\s*/).map((s) => s.trim());
          const minutesRaw = String(bits[2] || "").replace(/분/g, "").trim();
          const minutes = minutesRaw === "" ? null : Number(minutesRaw);
          return {
            name: parts[0].trim(),
            method: bits[0] || "",
            tool: bits[1] || "",
            minutes: Number.isFinite(minutes) ? minutes : null,
            difficulty: kind === "tobe" ? "-" : ""
          };
        }
        return {
          name: cleaned,
          method: "",
          tool: "",
          minutes: null,
          difficulty: kind === "tobe" ? "-" : ""
        };
      });
  }

  function readSteps(containerId) {
    const mode = document.getElementById(containerId)?.dataset.mode || "asis";
    return [...document.querySelectorAll(`#${containerId} .step-row`)].map((row) => {
      const diffRaw = row.querySelector(".step-diff")?.value;
      let difficulty = "";
      if (mode === "tobe") {
        difficulty = !diffRaw || diffRaw === "-" ? "-" : diffRaw;
      }
      return {
        name: row.querySelector(".step-name")?.value.trim() || "",
        method: row.querySelector(".step-method")?.value.trim() || "",
        tool: row.querySelector(".step-tool")?.value.trim() || "",
        minutes: row.querySelector(".step-minutes")?.value || "",
        difficulty
      };
    });
  }

  function renderFlow(containerId, steps) {
    const root = document.getElementById(containerId);
    if (!root) return;
    const list = (steps || []).filter((s) => s.name);
    if (!list.length) {
      root.innerHTML = '<p class="helper">단계가 없습니다.</p>';
      return;
    }
    root.innerHTML = list
      .map(
        (s, i) => `
      <div class="flow-step">
        <strong>${i + 1}. ${escapeHtml(s.name)}</strong>
        <span>${escapeHtml(
          [
            s.method,
            s.tool,
            s.minutes != null && s.minutes !== "" ? `${s.minutes}분` : "",
            s.difficulty && s.difficulty !== "-" ? `난이도 ${s.difficulty}` : s.difficulty === "-" ? "난이도 -" : ""
          ]
            .filter(Boolean)
            .join(" · ") || " "
        )}</span>
      </div>
      ${i < list.length - 1 ? '<div class="flow-arrow-vertical">↓</div>' : ""}`
      )
      .join("");
  }

  function renderStepEditor(containerId, steps, editable) {
    const root = document.getElementById(containerId);
    if (!root) return;
    const mode = root.dataset.mode || "asis";
    const list = steps?.length ? steps : [{ name: "", method: "", tool: "", minutes: "", difficulty: mode === "tobe" ? "-" : "" }];
    root.innerHTML = list
      .map((s, idx) => {
        const diffValue = mode === "tobe" ? s.difficulty || "-" : "";
        const diffField =
          mode === "tobe"
            ? `<select class="step-diff" ${editable ? "" : "disabled"}>
                <option value="-" ${diffValue === "-" || !diffValue ? "selected" : ""}>-</option>
                <option value="상" ${diffValue === "상" ? "selected" : ""}>상</option>
                <option value="중" ${diffValue === "중" ? "selected" : ""}>중</option>
                <option value="하" ${diffValue === "하" ? "selected" : ""}>하</option>
              </select>`
            : "";
        return `
      <div class="step-row ${mode === "asis" ? "asis-row" : "tobe-row"}" data-idx="${idx}">
        <input class="step-name" type="text" placeholder="프로세스명" value="${escapeHtml(s.name || "")}" ${editable ? "" : "readonly"}>
        <input class="step-method" type="text" placeholder="작업방식" value="${escapeHtml(s.method || "")}" ${editable ? "" : "readonly"}>
        <input class="step-tool" type="text" placeholder="도구" value="${escapeHtml(s.tool || "")}" ${editable ? "" : "readonly"}>
        <input class="step-minutes" type="number" min="0" placeholder="시간(분)" value="${escapeHtml(s.minutes ?? "")}" ${editable ? "" : "readonly"}>
        ${diffField}
        ${editable ? `<button type="button" class="text-button step-remove">삭제</button>` : ""}
      </div>`;
      })
      .join("");

    root.querySelectorAll(".step-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.closest(".step-row")?.remove();
        refreshFlowsFromEditors();
      });
    });
    root.querySelectorAll("input, select").forEach((input) => {
      input.addEventListener("input", refreshFlowsFromEditors);
      input.addEventListener("change", refreshFlowsFromEditors);
    });
    refreshFlowsFromEditors();
  }

  function refreshFlowsFromEditors() {
    renderFlow("asis-flow", readSteps("asis-steps"));
    renderFlow("tobe-flow", readSteps("tobe-steps"));
  }

  function setDetailEditable(editable) {
    document.querySelectorAll("#task-detail-panel input, #task-detail-panel select").forEach((el) => {
      if (el.id === "task-detail-id") return;
      if (el.id === "td-months") {
        el.readOnly = true;
        el.disabled = false;
        return;
      }
      if (el.tagName === "SELECT" || el.type === "number" || el.type === "date") {
        el.disabled = !editable;
      } else {
        el.readOnly = !editable;
      }
    });
  }

  function fillTaskDetail(item) {
    document.getElementById("task-detail-id").value = item?.id || "";
    document.getElementById("task-detail-title").textContent = item?.id ? "과제 상세" : "과제 등록";
    document.getElementById("td-title").value = item?.title || "";
    document.getElementById("td-difficulty").value = item?.difficulty || "중";
    document.getElementById("td-start").value = item?.startDate || "";
    document.getElementById("td-end").value = item?.endDate || "";
    document.getElementById("td-assignees").value = item?.assigneeCount ?? 1;
    document.getElementById("td-company").value = item?.companyName || "";
    document.getElementById("td-goal").value = item?.goal || "";

    const st = item?.statik || {};
    document.getElementById("td-l1").value = st.l1 || "";
    document.getElementById("td-l2").value = st.l2 || "";
    document.getElementById("td-l3").value = st.l3 || "";
    document.getElementById("td-l4").value = st.l4 || "";
    updateStatikBreadcrumb();
    updateDurationMonths();

    const kpis = item?.kpis || {};
    document.getElementById("kpi-asis").value = kpis.asIsMinutes ?? "";
    document.getElementById("kpi-tobe").value = kpis.toBeMinutes ?? "";
    document.getElementById("kpi-saved").value = kpis.savedMinutes ?? "";
    document.getElementById("kpi-rate").value = kpis.savingRatePct ?? "";
    document.getElementById("kpi-freq").value = kpis.frequency || "";
    document.getElementById("kpi-annual").value = kpis.annualSavedHours ?? "";
    document.getElementById("kpi-fte").value = kpis.fte ?? "";
    document.getElementById("kpi-auto").value = kpis.automationRatePct ?? "";

    const asIs =
      item?.asIsSteps?.length
        ? item.asIsSteps
        : parseStepsFromText(item?.asIsProcess, "asis");
    const toBe =
      item?.toBeSteps?.length
        ? item.toBeSteps.map((s) => ({ ...s, difficulty: s.difficulty || "-" }))
        : parseStepsFromText(item?.toBeProcess, "tobe").map((s) => ({ ...s, difficulty: s.difficulty || "-" }));
    renderStepEditor("asis-steps", asIs, isAdmin());
    renderStepEditor("tobe-steps", toBe, isAdmin());
    setDetailEditable(isAdmin());
    showTaskDetail();
    updateAdminUi();
  }

  function collectTaskDetailPayload() {
    return {
      title: document.getElementById("td-title").value.trim(),
      difficulty: document.getElementById("td-difficulty").value,
      startDate: document.getElementById("td-start").value,
      endDate: document.getElementById("td-end").value,
      assigneeCount: Number(document.getElementById("td-assignees").value || 0),
      companyName: document.getElementById("td-company").value.trim(),
      goal: document.getElementById("td-goal").value.trim(),
      statik: {
        l1: document.getElementById("td-l1").value.trim(),
        l2: document.getElementById("td-l2").value.trim(),
        l3: document.getElementById("td-l3").value.trim(),
        l4: document.getElementById("td-l4").value.trim()
      },
      asIsSteps: readSteps("asis-steps"),
      toBeSteps: readSteps("tobe-steps"),
      kpis: {
        asIsMinutes: Number(document.getElementById("kpi-asis").value || 0),
        toBeMinutes: Number(document.getElementById("kpi-tobe").value || 0),
        savedMinutes: Number(document.getElementById("kpi-saved").value || 0),
        savingRatePct: Number(document.getElementById("kpi-rate").value || 0),
        frequency: document.getElementById("kpi-freq").value.trim(),
        annualSavedHours: Number(document.getElementById("kpi-annual").value || 0),
        fte: Number(document.getElementById("kpi-fte").value || 0),
        automationRatePct: Number(document.getElementById("kpi-auto").value || 0)
      }
    };
  }

  function renderTaskAssetList(items) {
    const root = document.getElementById("task-asset-list");
    const count = document.getElementById("task-asset-count");
    if (!root) return;
    if (count) count.textContent = `${items.length}건`;
    if (!items.length) {
      root.innerHTML = '<p class="status-msg">조건에 맞는 과제가 없습니다.</p>';
      return;
    }
    root.innerHTML = items
      .map((item) => {
        const period =
          item.startDate || item.endDate
            ? `${item.startDate || "-"} ~ ${item.endDate || "-"}`
            : "기간 미정";
        const path = ["l1", "l2", "l3", "l4"]
          .map((k) => item.statik?.[k])
          .filter(Boolean)
          .join(" › ");
        return `
        <article class="asset-card task-list-card" data-open-task="${escapeHtml(item.id)}">
          <div class="asset-card-head">
            <h3>${escapeHtml(item.title)}</h3>
            ${
              isAdmin()
                ? `<button class="text-button" data-del-task="${escapeHtml(item.id)}" type="button">삭제</button>`
                : ""
            }
          </div>
          <p class="task-list-path">${escapeHtml(path || item.companyName || "-")}</p>
          <p class="task-list-meta">난이도 ${escapeHtml(item.difficulty)} · 담당자 ${item.assigneeCount || 0}명 · ${escapeHtml(period)}${item.goal ? ` · ${escapeHtml(item.goal)}` : ""}</p>
        </article>`;
      })
      .join("");

    root.querySelectorAll("[data-open-task]").forEach((card) => {
      card.addEventListener("click", async (e) => {
        if (e.target.closest("[data-del-task]")) return;
        try {
          const item = await api(`/api/task-assets/${card.dataset.openTask}`);
          fillTaskDetail(item);
          document.getElementById("view-title").textContent = item.title || "과제 상세";
        } catch (err) {
          alert(err.message);
        }
      });
    });
    root.querySelectorAll("[data-del-task]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("이 과제를 삭제할까요?")) return;
        await api(`/api/task-assets/${btn.dataset.delTask}`, {
          method: "DELETE",
          headers: authHeaders()
        });
        loadTaskAssets();
        loadHubSummary();
      });
    });
  }

  async function loadTaskAssets() {
    const root = document.getElementById("task-asset-list");
    if (root) root.innerHTML = '<p class="status-msg">불러오는 중…</p>';
    try {
      const body = await api("/api/task-assets");
      cachedTaskAssets = body.items || [];
      renderStatikFilters();
      renderTaskAssetList(filterTaskAssets(cachedTaskAssets));
    } catch (err) {
      if (root) root.innerHTML = `<p class="status-msg error">${escapeHtml(err.message)}</p>`;
    }
  }

  async function loadPrompts() {
    const root = document.getElementById("prompt-list");
    if (root) root.innerHTML = '<p class="status-msg">불러오는 중…</p>';
    try {
      const body = await api("/api/prompts");
      cachedPrompts = body.items || [];
      renderPromptStatikFilters();
      renderPromptList(filterByStatik(cachedPrompts, promptStatikFilter));
    } catch (err) {
      if (root) root.innerHTML = `<p class="status-msg error">${escapeHtml(err.message)}</p>`;
    }
  }

  function showPromptList() {
    document.getElementById("prompt-list-panel")?.classList.remove("hidden");
    document.getElementById("prompt-detail-panel")?.classList.add("hidden");
    document.getElementById("view-title").textContent = "프롬프트 Library";
  }

  function showPromptDetail() {
    document.getElementById("prompt-list-panel")?.classList.add("hidden");
    document.getElementById("prompt-detail-panel")?.classList.remove("hidden");
  }

  function setPromptDetailEditable(editable) {
    document.querySelectorAll("#prompt-detail-panel input, #prompt-detail-panel textarea, #prompt-detail-panel select").forEach((el) => {
      if (el.id === "prompt-detail-id" || el.id === "pd-source-filename") {
        if (el.id === "pd-source-filename") el.readOnly = true;
        return;
      }
      if (el.type === "file") {
        el.disabled = !editable;
        return;
      }
      if (el.tagName === "SELECT" || el.type === "number" || el.type === "date") {
        el.disabled = !editable;
      } else {
        el.readOnly = !editable;
      }
    });
  }

  function fillPromptDetail(item) {
    document.getElementById("prompt-detail-id").value = item?.id || "";
    document.getElementById("prompt-detail-title").textContent = item?.id ? "프롬프트 상세" : "프롬프트 등록";
    document.getElementById("pd-title").value = item?.title || "";
    document.getElementById("pd-description").value = item?.description || "";
    document.getElementById("pd-variables").value = (item?.variables || []).join(", ");
    document.getElementById("pd-tags").value = (item?.tags || []).join(", ");
    document.getElementById("pd-template").value = item?.template || "";
    document.getElementById("pd-source-filename").value = item?.sourceFilename || "";
    const st = item?.statik || {};
    document.getElementById("pd-l1").value = st.l1 || "";
    document.getElementById("pd-l2").value = st.l2 || "";
    document.getElementById("pd-l3").value = st.l3 || "";
    document.getElementById("pd-l4").value = st.l4 || "";
    const fileInput = document.getElementById("pd-txt-file");
    if (fileInput) fileInput.value = "";
    updatePromptStatikBreadcrumb();
    setPromptDetailEditable(isAdmin());
    showPromptDetail();
    updateAdminUi();
  }

  function collectPromptPayload() {
    return {
      title: document.getElementById("pd-title").value.trim(),
      description: document.getElementById("pd-description").value.trim(),
      variablesText: document.getElementById("pd-variables").value.trim(),
      tagsText: document.getElementById("pd-tags").value.trim(),
      template: document.getElementById("pd-template").value,
      sourceFilename: document.getElementById("pd-source-filename").value.trim(),
      statik: {
        l1: document.getElementById("pd-l1").value.trim(),
        l2: document.getElementById("pd-l2").value.trim(),
        l3: document.getElementById("pd-l3").value.trim(),
        l4: document.getElementById("pd-l4").value.trim()
      }
    };
  }

  function renderPromptList(items) {
    const root = document.getElementById("prompt-list");
    const count = document.getElementById("prompt-count");
    if (!root) return;
    if (count) count.textContent = `${items.length}건`;
    if (!items.length) {
      root.innerHTML = '<p class="status-msg">조건에 맞는 프롬프트가 없습니다.</p>';
      return;
    }
    root.innerHTML = items
      .map((item) => {
        const path = ["l1", "l2", "l3", "l4"]
          .map((k) => item.statik?.[k])
          .filter(Boolean)
          .join(" › ");
        const preview = String(item.template || "").replace(/\s+/g, " ").slice(0, 120);
        return `
        <article class="asset-card task-list-card" data-open-prompt="${escapeHtml(item.id)}">
          <div class="asset-card-head">
            <h3>${escapeHtml(item.title)}</h3>
            ${
              isAdmin()
                ? `<button class="text-button" data-del-prompt="${escapeHtml(item.id)}" type="button">삭제</button>`
                : ""
            }
          </div>
          <p class="task-list-path">${escapeHtml(path || item.category || "-")}</p>
          <p class="task-list-meta">${escapeHtml(preview)}${preview.length >= 120 ? "…" : ""}</p>
          <p class="helper">${(item.tags || []).length ? escapeHtml((item.tags || []).join(", ")) : ""}${item.sourceFilename ? `${(item.tags || []).length ? " · " : ""}파일 ${escapeHtml(item.sourceFilename)}` : ""}</p>
        </article>`;
      })
      .join("");

    root.querySelectorAll("[data-open-prompt]").forEach((card) => {
      card.addEventListener("click", async (e) => {
        if (e.target.closest("[data-del-prompt]")) return;
        try {
          const item = await api(`/api/prompts/${card.dataset.openPrompt}`);
          fillPromptDetail(item);
          document.getElementById("view-title").textContent = item.title || "프롬프트 상세";
        } catch (err) {
          alert(err.message);
        }
      });
    });
    root.querySelectorAll("[data-del-prompt]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("이 프롬프트를 삭제할까요?")) return;
        await api(`/api/prompts/${btn.dataset.delPrompt}`, {
          method: "DELETE",
          headers: authHeaders()
        });
        loadPrompts();
      });
    });
  }

  async function loadVibeDocs() {
    const root = document.getElementById("vibe-list");
    if (root) root.innerHTML = '<p class="status-msg">불러오는 중…</p>';
    try {
      const body = await api("/api/vibe-docs");
      cachedVibeDocs = body.items || [];
      renderVibeStatikFilters();
      renderVibeList(filterByStatik(cachedVibeDocs, vibeStatikFilter));
    } catch (err) {
      if (root) root.innerHTML = `<p class="status-msg error">${escapeHtml(err.message)}</p>`;
    }
  }

  function showVibeList() {
    document.getElementById("vibe-list-panel")?.classList.remove("hidden");
    document.getElementById("vibe-detail-panel")?.classList.add("hidden");
    document.getElementById("view-title").textContent = "Vibe Coding Library";
  }

  function showVibeDetail() {
    document.getElementById("vibe-list-panel")?.classList.add("hidden");
    document.getElementById("vibe-detail-panel")?.classList.remove("hidden");
  }

  function setVibeTab(tabKey) {
    document.querySelectorAll("[data-vibe-tab]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.vibeTab === tabKey);
    });
    document.querySelectorAll("[data-vibe-panel]").forEach((panel) => {
      panel.classList.toggle("hidden", panel.dataset.vibePanel !== tabKey);
    });
  }

  function setVibeDetailEditable(editable) {
    document.querySelectorAll("#vibe-detail-panel input, #vibe-detail-panel textarea, #vibe-detail-panel select").forEach((el) => {
      if (el.id === "vibe-detail-id" || el.id?.endsWith("-filename")) {
        if (el.id?.endsWith("-filename")) el.readOnly = true;
        return;
      }
      if (el.type === "file") {
        el.disabled = !editable;
        return;
      }
      if (el.tagName === "SELECT" || el.type === "number" || el.type === "date") {
        el.disabled = !editable;
      } else {
        el.readOnly = !editable;
      }
    });
  }

  function fillVibeDetail(item) {
    document.getElementById("vibe-detail-id").value = item?.id || "";
    document.getElementById("vibe-detail-title").textContent = item?.id ? "Vibe Coding 상세" : "Vibe Coding 등록";
    document.getElementById("vd-title").value = item?.title || "";
    document.getElementById("vd-description").value = item?.description || "";
    document.getElementById("vd-tags").value = (item?.tags || []).join(", ");
    const files = item?.sourceFiles || {};
    document.getElementById("vd-readme").value = item?.readme || item?.body || "";
    document.getElementById("vd-plan").value = item?.planDoc || "";
    document.getElementById("vd-ux").value = item?.uxScenario || "";
    document.getElementById("vd-ui").value = item?.uiDesign || "";
    document.getElementById("vd-other").value = item?.otherDoc || "";
    document.getElementById("vd-readme-filename").value = files.readme || "";
    document.getElementById("vd-plan-filename").value = files.planDoc || "";
    document.getElementById("vd-ux-filename").value = files.uxScenario || "";
    document.getElementById("vd-ui-filename").value = files.uiDesign || "";
    document.getElementById("vd-other-filename").value = files.otherDoc || "";
    VIBE_SECTIONS.forEach((sec) => {
      const fileInput = document.getElementById(sec.fileId);
      if (fileInput) fileInput.value = "";
    });
    const st = item?.statik || {};
    document.getElementById("vd-l1").value = st.l1 || "";
    document.getElementById("vd-l2").value = st.l2 || "";
    document.getElementById("vd-l3").value = st.l3 || "";
    document.getElementById("vd-l4").value = st.l4 || "";
    updateVibeStatikBreadcrumb();
    setVibeTab("readme");
    setVibeDetailEditable(isAdmin());
    showVibeDetail();
    updateAdminUi();
  }

  function collectVibePayload() {
    return {
      title: document.getElementById("vd-title").value.trim(),
      description: document.getElementById("vd-description").value.trim(),
      tagsText: document.getElementById("vd-tags").value.trim(),
      readme: document.getElementById("vd-readme").value,
      planDoc: document.getElementById("vd-plan").value,
      uxScenario: document.getElementById("vd-ux").value,
      uiDesign: document.getElementById("vd-ui").value,
      otherDoc: document.getElementById("vd-other").value,
      sourceFiles: {
        readme: document.getElementById("vd-readme-filename").value.trim(),
        planDoc: document.getElementById("vd-plan-filename").value.trim(),
        uxScenario: document.getElementById("vd-ux-filename").value.trim(),
        uiDesign: document.getElementById("vd-ui-filename").value.trim(),
        otherDoc: document.getElementById("vd-other-filename").value.trim()
      },
      statik: {
        l1: document.getElementById("vd-l1").value.trim(),
        l2: document.getElementById("vd-l2").value.trim(),
        l3: document.getElementById("vd-l3").value.trim(),
        l4: document.getElementById("vd-l4").value.trim()
      }
    };
  }

  function renderVibeList(items) {
    const root = document.getElementById("vibe-list");
    const count = document.getElementById("vibe-count");
    if (!root) return;
    if (count) count.textContent = `${items.length}건`;
    if (!items.length) {
      root.innerHTML = '<p class="status-msg">조건에 맞는 Vibe Coding 문서가 없습니다.</p>';
      return;
    }
    root.innerHTML = items
      .map((item) => {
        const path = ["l1", "l2", "l3", "l4"]
          .map((k) => item.statik?.[k])
          .filter(Boolean)
          .join(" › ");
        const filled = [
          item.readme || item.body ? "readme" : null,
          item.planDoc ? "계획서" : null,
          item.uxScenario ? "UX" : null,
          item.uiDesign ? "UI" : null,
          item.otherDoc ? "기타" : null
        ].filter(Boolean);
        const preview = String(
          item.readme || item.body || item.planDoc || item.uxScenario || item.uiDesign || item.otherDoc || ""
        )
          .replace(/\s+/g, " ")
          .slice(0, 120);
        return `
        <article class="asset-card task-list-card" data-open-vibe="${escapeHtml(item.id)}">
          <div class="asset-card-head">
            <h3>${escapeHtml(item.title)}</h3>
            ${
              isAdmin()
                ? `<button class="text-button" data-del-vibe="${escapeHtml(item.id)}" type="button">삭제</button>`
                : ""
            }
          </div>
          <p class="task-list-path">${escapeHtml(path || item.category || "-")}</p>
          <p class="task-list-meta">${escapeHtml(filled.join(" · ") || "문서 없음")}${item.description ? ` · ${escapeHtml(item.description)}` : ""}</p>
          <p class="helper">${escapeHtml(preview)}${preview.length >= 120 ? "…" : ""}</p>
        </article>`;
      })
      .join("");

    root.querySelectorAll("[data-open-vibe]").forEach((card) => {
      card.addEventListener("click", async (e) => {
        if (e.target.closest("[data-del-vibe]")) return;
        try {
          const item = await api(`/api/vibe-docs/${card.dataset.openVibe}`);
          fillVibeDetail(item);
          document.getElementById("view-title").textContent = item.title || "Vibe Coding 상세";
        } catch (err) {
          alert(err.message);
        }
      });
    });
    root.querySelectorAll("[data-del-vibe]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("이 문서를 삭제할까요?")) return;
        await api(`/api/vibe-docs/${btn.dataset.delVibe}`, {
          method: "DELETE",
          headers: authHeaders()
        });
        loadVibeDocs();
      });
    });
  }

  async function loadCases() {
    const root = document.getElementById("case-list");
    if (root) root.innerHTML = '<p class="status-msg">불러오는 중…</p>';
    try {
      const status = "all";
      const body = await api(`/api/cases?status=${encodeURIComponent(status)}`);
      cachedCases = body.items || [];
      caseSearchQuery = document.getElementById("case-search")?.value || caseSearchQuery || "";
      renderCaseList(filterCases(cachedCases));
    } catch (err) {
      if (root) root.innerHTML = `<p class="status-msg error">${escapeHtml(err.message)}</p>`;
    }
  }

  function filterCases(items) {
    const q = String(caseSearchQuery || "").trim().toLowerCase();
    if (!q) return items || [];
    return (items || []).filter((item) => {
      const title = String(item.title || "").toLowerCase();
      const summary = String(item.mainContent || item.aiSummary || item.summary || "").toLowerCase();
      const tags = (item.tags || []).join(" ").toLowerCase();
      const effect = String(item.improvementEffect || item.outcome || "").toLowerCase();
      return title.includes(q) || summary.includes(q) || tags.includes(q) || effect.includes(q);
    });
  }

  function renderCaseList(items) {
    const root = document.getElementById("case-list");
    const count = document.getElementById("case-count");
    if (!root) return;
    if (count) count.textContent = `${items.length}건`;
    if (!items.length) {
      root.innerHTML = '<p class="status-msg">조건에 맞는 Best Practice가 없습니다.</p>';
      return;
    }
    root.innerHTML = items
      .map((item) => {
        const preview = String(item.mainContent || item.aiSummary || item.summary || "")
          .replace(/\s+/g, " ")
          .slice(0, 140);
        const tags = (item.tags || []).slice(0, 5).join(", ");
        return `
        <article class="asset-card task-list-card" data-open-case="${escapeHtml(item.id)}">
          <div class="asset-card-head">
            <h3>${escapeHtml(item.title)}</h3>
          </div>
          <p class="task-list-path">${escapeHtml(item.category || "-")}${tags ? ` · ${escapeHtml(tags)}` : ""}</p>
          <p class="task-list-meta">${escapeHtml(preview)}${preview.length >= 140 ? "…" : ""}</p>
          <p class="helper">${escapeHtml(item.improvementEffect || item.outcome || "")}</p>
        </article>`;
      })
      .join("");

    root.querySelectorAll("[data-open-case]").forEach((card) => {
      card.addEventListener("click", async () => {
        try {
          const item = await api(`/api/cases/${card.dataset.openCase}`);
          fillCaseDetail(item);
          document.getElementById("view-title").textContent = item.title || "Best Practice 상세";
        } catch (err) {
          alert(err.message);
        }
      });
    });
  }

  function showCaseList() {
    document.getElementById("case-list-panel")?.classList.remove("hidden");
    document.getElementById("case-detail-panel")?.classList.add("hidden");
    const frame = document.getElementById("case-pdf-frame");
    const image = document.getElementById("case-source-image");
    if (frame) {
      frame.src = "";
      frame.classList.add("hidden");
    }
    if (image) {
      image.src = "";
      image.classList.add("hidden");
    }
    document.getElementById("view-title").textContent = "Best Practice Library";
  }

  function showCaseDetail() {
    document.getElementById("case-list-panel")?.classList.add("hidden");
    document.getElementById("case-detail-panel")?.classList.remove("hidden");
  }

  function setCaseDetailEditable(editable) {
    document.querySelectorAll("#case-detail-panel input, #case-detail-panel textarea").forEach((el) => {
      if (el.id === "case-detail-id" || el.type === "hidden") return;
      el.readOnly = !editable;
    });
  }

  function collectCasePayload() {
    return {
      title: document.getElementById("case-detail-case-title")?.value.trim() || "",
      tagsText: document.getElementById("case-detail-tags")?.value.trim() || "",
      mainContent: document.getElementById("case-detail-ai-summary")?.value || "",
      beforeText: document.getElementById("case-detail-before")?.value || "",
      afterText: document.getElementById("case-detail-after")?.value || "",
      improvementEffect: document.getElementById("case-detail-outcome")?.value || ""
    };
  }

  function fillCaseDetail(item) {
    document.getElementById("case-detail-id").value = item?.id || "";
    document.getElementById("case-detail-title").textContent = item?.title || "Best Practice 상세";
    document.getElementById("case-detail-category").textContent = item?.category
      ? `분야: ${item.category}`
      : "";
    document.getElementById("case-detail-tags").value = (item?.tags || []).join(", ");
    document.getElementById("case-detail-case-title").value = item?.title || "";
    document.getElementById("case-detail-ai-summary").value =
      item?.mainContent || item?.aiSummary || item?.summary || "";
    document.getElementById("case-detail-before").value = item?.beforeText || "";
    document.getElementById("case-detail-after").value = item?.afterText || "";
    document.getElementById("case-detail-outcome").value =
      item?.improvementEffect || item?.outcome || item?.efficiency || "";
    setCaseDetailEditable(isAdmin());

    const empty = document.getElementById("case-pdf-empty");
    const frame = document.getElementById("case-pdf-frame");
    const image = document.getElementById("case-source-image");
    const nameEl = document.getElementById("case-pdf-name");
    const isPng = item?.fileKind === "png";
    if (item?.hasPdf && item?.pdfUrl) {
      empty?.classList.add("hidden");
      if (isPng) {
        frame?.classList.add("hidden");
        if (frame) frame.src = "";
        image?.classList.remove("hidden");
        if (image) image.src = item.pdfUrl;
      } else {
        image?.classList.add("hidden");
        if (image) image.src = "";
        frame?.classList.remove("hidden");
        if (frame) frame.src = item.pdfUrl;
      }
      if (nameEl) nameEl.textContent = item.pdfFilename || (isPng ? "원본 이미지" : "원본 PDF");
    } else {
      empty?.classList.remove("hidden");
      frame?.classList.add("hidden");
      image?.classList.add("hidden");
      if (frame) frame.src = "";
      if (image) image.src = "";
      if (nameEl) nameEl.textContent = "";
    }

    updateAdminUi();
    showCaseDetail();
  }

  function openModal({ title, body, onConfirm }) {
    const modal = document.getElementById("modal");
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-body").textContent = body;
    modal.classList.remove("hidden");
    const confirmBtn = document.getElementById("modal-confirm");
    const cancelBtn = document.getElementById("modal-cancel");
    const close = () => modal.classList.add("hidden");
    const onCancel = () => {
      close();
      cleanup();
    };
    const onOk = async () => {
      try {
        await onConfirm();
        close();
      } catch (err) {
        alert(err.message);
      } finally {
        cleanup();
      }
    };
    function cleanup() {
      confirmBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
    }
    confirmBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
  }

  async function refreshGeminiKeyStatus() {
    const el = document.getElementById("gemini-key-status");
    if (!el) return;
    try {
      const status = await api("/api/gemini/status");
      el.textContent = status.configured
        ? `등록됨 (${status.maskedKey})`
        : "미등록";
    } catch {
      el.textContent = "상태 확인 실패";
    }
  }

  async function registerGeminiApiKey() {
    if (!isAdmin()) return alert("관리자 로그인이 필요합니다.");
    const current = await api("/api/gemini/status").catch(() => ({ configured: false }));
    const hint = current.configured
      ? `현재 등록됨: ${current.maskedKey}\n새 API Key를 입력하면 교체됩니다.`
      : "Google AI Studio에서 발급한 Gemini API Key를 입력하세요.";
    const apiKey = prompt(hint);
    if (apiKey == null) return;
    const trimmed = apiKey.trim();
    if (!trimmed) return alert("API Key를 입력하세요.");
    try {
      const saved = await api("/api/gemini/key", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ apiKey: trimmed })
      });
      await refreshGeminiKeyStatus();
      alert(`Gemini API Key가 저장되었습니다.\n(${saved.maskedKey})`);
    } catch (err) {
      alert(err.message);
    }
  }

  function setupAdminAuth() {
    document.getElementById("admin-auth-btn")?.addEventListener("click", async () => {
      if (isAdmin()) {
        adminToken = "";
        localStorage.removeItem(TOKEN_KEY);
        updateAdminUi();
        refreshCurrentViewAfterAuth();
        return;
      }
      const password = prompt("관리자 비밀번호");
      if (password == null) return;
      try {
        const body = await api("/api/auth/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password })
        });
        adminToken = body.token;
        localStorage.setItem(TOKEN_KEY, adminToken);
        updateAdminUi();
        refreshCurrentViewAfterAuth();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  function refreshCurrentViewAfterAuth() {
    if (currentView === "home") {
      loadHubSummary();
      return;
    }
    showView(currentView);
  }

  function setupImport() {
    document.getElementById("import-tasks-btn")?.addEventListener("click", () => {
      const ids = selectedTaskIds();
      if (!ids.length) return alert("이관할 과제를 선택하세요.");
      if (!isAdmin()) return alert("관리자 로그인이 필요합니다.");
      openModal({
        title: "과제 Library 등록",
        body: `선택한 ${ids.length}건을 과제 Library로 스냅샷 이관합니다.`,
        onConfirm: async () => {
          const result = await api("/api/task-assets/import", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ taskIds: ids })
          });
          alert(result.message || "이관 완료");
          await loadHubSummary();
          showView("tasks");
        }
      });
    });
  }

  function setupLibraryForms() {
    document.getElementById("task-sort")?.addEventListener("change", () => renderTasks(cachedTasks));

    document.getElementById("task-back-btn")?.addEventListener("click", () => {
      showTaskList();
      loadTaskAssets();
    });
    document.getElementById("task-create-btn")?.addEventListener("click", () => {
      if (!isAdmin()) return alert("관리자 로그인이 필요합니다.");
      fillTaskDetail({
        title: "",
        difficulty: "중",
        assigneeCount: 1,
        statik: { l1: "", l2: "", l3: "", l4: "" },
        asIsSteps: [{ name: "", method: "", tool: "", minutes: "" }],
        toBeSteps: [{ name: "", method: "", tool: "", minutes: "", difficulty: "-" }],
        kpis: {}
      });
      document.getElementById("view-title").textContent = "과제 등록";
    });
    document.getElementById("task-save-btn")?.addEventListener("click", async () => {
      if (!isAdmin()) return alert("관리자 로그인이 필요합니다.");
      const payload = collectTaskDetailPayload();
      if (!payload.title) return alert("과제명을 입력하세요.");
      try {
        const id = document.getElementById("task-detail-id").value;
        const saved = id
          ? await api(`/api/task-assets/${id}`, {
              method: "PATCH",
              headers: authHeaders(),
              body: JSON.stringify(payload)
            })
          : await api("/api/task-assets", {
              method: "POST",
              headers: authHeaders(),
              body: JSON.stringify(payload)
            });
        alert("저장되었습니다.");
        fillTaskDetail(saved);
        document.getElementById("view-title").textContent = saved.title;
      } catch (err) {
        alert(err.message);
      }
    });
    document.getElementById("add-asis-step")?.addEventListener("click", () => {
      const steps = readSteps("asis-steps");
      steps.push({ name: "", method: "", tool: "", minutes: "" });
      renderStepEditor("asis-steps", steps, true);
    });
    document.getElementById("add-tobe-step")?.addEventListener("click", () => {
      const steps = readSteps("tobe-steps");
      steps.push({ name: "", method: "", tool: "", minutes: "", difficulty: "-" });
      renderStepEditor("tobe-steps", steps, true);
    });
    document.getElementById("td-start")?.addEventListener("change", updateDurationMonths);
    document.getElementById("td-end")?.addEventListener("change", updateDurationMonths);
    ["td-l1", "td-l2", "td-l3", "td-l4"].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", updateStatikBreadcrumb);
    });

    document.getElementById("prompt-back-btn")?.addEventListener("click", () => {
      showPromptList();
      loadPrompts();
    });
    document.getElementById("prompt-create-btn")?.addEventListener("click", () => {
      if (!isAdmin()) return alert("관리자 로그인이 필요합니다.");
      fillPromptDetail({
        title: "",
        description: "",
        template: "",
        variables: [],
        tags: [],
        sourceFilename: "",
        statik: { l1: "", l2: "", l3: "", l4: "" }
      });
      document.getElementById("view-title").textContent = "프롬프트 등록";
    });
    document.getElementById("prompt-save-btn")?.addEventListener("click", async () => {
      if (!isAdmin()) return alert("관리자 로그인이 필요합니다.");
      const payload = collectPromptPayload();
      if (!payload.title) return alert("프롬프트 제목을 입력하세요.");
      if (!payload.template.trim()) return alert("프롬프트 본문을 입력하세요.");
      try {
        const id = document.getElementById("prompt-detail-id").value;
        const saved = id
          ? await api(`/api/prompts/${id}`, {
              method: "PATCH",
              headers: authHeaders(),
              body: JSON.stringify(payload)
            })
          : await api("/api/prompts", {
              method: "POST",
              headers: authHeaders(),
              body: JSON.stringify(payload)
            });
        alert("저장되었습니다.");
        fillPromptDetail(saved);
        document.getElementById("view-title").textContent = saved.title;
      } catch (err) {
        alert(err.message);
      }
    });
    document.getElementById("pd-txt-file")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!/\.txt$/i.test(file.name) && file.type && !file.type.includes("text")) {
        alert("TXT 파일만 업로드할 수 있습니다.");
        e.target.value = "";
        return;
      }
      try {
        const text = await file.text();
        document.getElementById("pd-template").value = text;
        document.getElementById("pd-source-filename").value = file.name;
        const titleEl = document.getElementById("pd-title");
        if (titleEl && !titleEl.value.trim()) {
          titleEl.value = file.name.replace(/\.txt$/i, "");
        }
      } catch (err) {
        alert(err.message || "파일을 읽지 못했습니다.");
      }
    });
    ["pd-l1", "pd-l2", "pd-l3", "pd-l4"].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", updatePromptStatikBreadcrumb);
    });

    document.getElementById("vibe-back-btn")?.addEventListener("click", () => {
      showVibeList();
      loadVibeDocs();
    });
    document.getElementById("vibe-create-btn")?.addEventListener("click", () => {
      if (!isAdmin()) return alert("관리자 로그인이 필요합니다.");
      fillVibeDetail({
        title: "",
        description: "",
        tags: [],
        readme: "",
        planDoc: "",
        uxScenario: "",
        uiDesign: "",
        otherDoc: "",
        sourceFiles: {},
        statik: { l1: "", l2: "", l3: "", l4: "" }
      });
      document.getElementById("view-title").textContent = "Vibe Coding 등록";
    });
    document.getElementById("vibe-save-btn")?.addEventListener("click", async () => {
      if (!isAdmin()) return alert("관리자 로그인이 필요합니다.");
      const payload = collectVibePayload();
      if (!payload.title) return alert("문서 제목을 입력하세요.");
      if (![payload.readme, payload.planDoc, payload.uxScenario, payload.uiDesign, payload.otherDoc].some((v) => String(v || "").trim())) {
        return alert("상세 문서를 최소 1개 입력하세요.");
      }
      try {
        const id = document.getElementById("vibe-detail-id").value;
        const saved = id
          ? await api(`/api/vibe-docs/${id}`, {
              method: "PATCH",
              headers: authHeaders(),
              body: JSON.stringify(payload)
            })
          : await api("/api/vibe-docs", {
              method: "POST",
              headers: authHeaders(),
              body: JSON.stringify(payload)
            });
        alert("저장되었습니다.");
        fillVibeDetail(saved);
        document.getElementById("view-title").textContent = saved.title;
      } catch (err) {
        alert(err.message);
      }
    });
    document.querySelectorAll("[data-vibe-tab]").forEach((btn) => {
      btn.addEventListener("click", () => setVibeTab(btn.dataset.vibeTab));
    });
    VIBE_SECTIONS.forEach((sec) => {
      document.getElementById(sec.fileId)?.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!/\.txt$/i.test(file.name) && file.type && !file.type.includes("text")) {
          alert("TXT 파일만 업로드할 수 있습니다.");
          e.target.value = "";
          return;
        }
        try {
          const text = await file.text();
          document.getElementById(sec.fieldId).value = text;
          document.getElementById(sec.filenameId).value = file.name;
          const titleEl = document.getElementById("vd-title");
          if (titleEl && !titleEl.value.trim()) {
            titleEl.value = file.name.replace(/\.txt$/i, "");
          }
          setVibeTab(sec.key);
        } catch (err) {
          alert(err.message || "파일을 읽지 못했습니다.");
        }
      });
    });
    ["vd-l1", "vd-l2", "vd-l3", "vd-l4"].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", updateVibeStatikBreadcrumb);
    });

    document.getElementById("case-search")?.addEventListener("input", (e) => {
      caseSearchQuery = e.target.value || "";
      renderCaseList(filterCases(cachedCases));
    });
    document.getElementById("case-show-all-btn")?.addEventListener("click", () => {
      caseSearchQuery = "";
      const search = document.getElementById("case-search");
      if (search) search.value = "";
      renderCaseList(cachedCases);
    });
    document.getElementById("case-back-btn")?.addEventListener("click", () => {
      showCaseList();
      loadCases();
    });
    document.getElementById("case-analyze-btn")?.addEventListener("click", () => {
      if (!isAdmin()) return alert("관리자 로그인이 필요합니다.");
      document.getElementById("case-analyze-form")?.classList.toggle("hidden");
    });
    document.getElementById("case-save-btn")?.addEventListener("click", async () => {
      if (!isAdmin()) return alert("관리자 로그인이 필요합니다.");
      const id = document.getElementById("case-detail-id")?.value;
      if (!id) return alert("저장된 문서를 연 뒤 수정하세요.");
      const payload = collectCasePayload();
      if (!payload.title) return alert("제목을 입력하세요.");
      try {
        const saved = await api(`/api/cases/${id}`, {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify(payload)
        });
        fillCaseDetail(saved);
        document.getElementById("view-title").textContent = saved.title || "Best Practice 상세";
        alert("저장되었습니다.");
      } catch (err) {
        alert(err.message);
      }
    });
    document.getElementById("case-delete-btn")?.addEventListener("click", async () => {
      const id = document.getElementById("case-detail-id")?.value;
      if (!id) return;
      if (!confirm("이 Best Practice를 삭제할까요?")) return;
      try {
        await api(`/api/cases/${id}`, { method: "DELETE", headers: authHeaders() });
        showCaseList();
        loadCases();
      } catch (err) {
        alert(err.message);
      }
    });
    document.getElementById("case-analyze-run")?.addEventListener("click", async () => {
      if (!isAdmin()) return alert("관리자 로그인이 필요합니다.");
      const file = document.getElementById("case-pdf")?.files?.[0];
      if (!file) return alert("PDF 또는 PNG 파일을 선택하세요.");
      const name = String(file.name || "").toLowerCase();
      const isPng = name.endsWith(".png") || file.type === "image/png";
      const isPdf = name.endsWith(".pdf") || file.type === "application/pdf";
      if (!isPng && !isPdf) return alert("PDF 또는 PNG 파일만 업로드할 수 있습니다.");
      try {
        const status = await api("/api/gemini/status");
        if (!status.configured) {
          return alert("Gemini API Key가 없습니다. 상단의 Gemini API Key 등록 버튼으로 먼저 등록하세요.");
        }
      } catch {
        /* continue; server will validate */
      }
      const btn = document.getElementById("case-analyze-run");
      const prev = btn?.textContent;
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Gemini 분석 중…";
      }
      const fd = new FormData();
      fd.append("pdf", file);
      try {
        const res = await fetch("/api/cases/analyze", {
          method: "POST",
          headers: authHeaders(false),
          body: fd
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "분석 실패");
        const summary = body.geminiSummary || {
          title: body.title,
          mainContent: body.mainContent || body.aiSummary,
          beforeText: body.beforeText,
          afterText: body.afterText,
          improvementEffect: body.improvementEffect || body.outcome
        };
        document.getElementById("case-analyze-form")?.classList.add("hidden");
        caseSearchQuery = "";
        const search = document.getElementById("case-search");
        if (search) search.value = "";
        fillCaseDetail({
          ...body,
          title: summary.title || body.title,
          mainContent: summary.mainContent || body.mainContent,
          beforeText: summary.beforeText || body.beforeText,
          afterText: summary.afterText || body.afterText,
          improvementEffect: summary.improvementEffect || body.improvementEffect
        });
        document.getElementById("view-title").textContent = summary.title || body.title || "Best Practice 상세";
        alert(
          `등록 완료\n제목: ${summary.title || "-"}\n주요 내용/Before·After/개선효과 반영됨`
        );
      } catch (err) {
        alert(err.message);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = prev || "Gemini로 요약 등록";
        }
      }
    });
  }

  setupNavigation();
  setupAdminAuth();
  setupImport();
  setupLibraryForms();
  updateAdminUi();
  gateApp();
})();
