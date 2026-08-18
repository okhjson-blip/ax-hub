const crypto = require("crypto");

const ACCESS_COOKIE = "axHubAccess";

function adminPassword() {
  return process.env.ADMIN_PASSWORD || "admin2026";
}

function accessPassword() {
  return process.env.ACCESS_PASSWORD || "ax2026h2";
}

function tokenSecret() {
  return process.env.ADMIN_TOKEN_SECRET || adminPassword();
}

function readCookie(req, name) {
  const raw = String(req.headers.cookie || "");
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) === name) {
      return decodeURIComponent(trimmed.slice(eq + 1));
    }
  }
  return "";
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function createAdminToken(ttlMs = 1000 * 60 * 60 * 12) {
  const exp = Date.now() + ttlMs;
  const payload = `admin:${exp}`;
  const sig = crypto.createHmac("sha256", tokenSecret()).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function verifyAdminToken(token) {
  if (!token) return false;
  try {
    const raw = Buffer.from(String(token), "base64url").toString("utf8");
    const parts = raw.split(":");
    if (parts.length !== 3) return false;
    const [role, expStr, sig] = parts;
    if (role !== "admin") return false;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || Date.now() > exp) return false;
    const expected = crypto.createHmac("sha256", tokenSecret()).update(`${role}:${expStr}`).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

function createAccessToken(ttlMs = 1000 * 60 * 60 * 12) {
  const exp = Date.now() + ttlMs;
  const payload = `access:${exp}`;
  const sig = crypto.createHmac("sha256", tokenSecret()).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function verifyAccessToken(token) {
  if (!token) return false;
  try {
    const raw = Buffer.from(String(token), "base64url").toString("utf8");
    const parts = raw.split(":");
    if (parts.length !== 3) return false;
    const [role, expStr, sig] = parts;
    if (role !== "access") return false;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || Date.now() > exp) return false;
    const expected = crypto.createHmac("sha256", tokenSecret()).update(`${role}:${expStr}`).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

function readAccessToken(req) {
  const header = String(req.headers["x-access-token"] || "").trim();
  if (header) return header;
  return readCookie(req, ACCESS_COOKIE);
}

function setAccessCookie(res, token) {
  const secure = Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
  const parts = [
    `${ACCESS_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "Max-Age=43200",
    "SameSite=Lax",
    "HttpOnly"
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function requireAccess(req, res, next) {
  if (!verifyAccessToken(readAccessToken(req))) {
    return res.status(401).json({ error: "접근 비밀번호가 필요합니다." });
  }
  req.hasAccess = true;
  next();
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const token = bearer || req.headers["x-admin-token"] || req.body?.adminToken || "";
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "관리자 인증이 필요합니다." });
  }
  req.isAdmin = true;
  next();
}

module.exports = {
  ACCESS_COOKIE,
  adminPassword,
  accessPassword,
  createAdminToken,
  verifyAdminToken,
  createAccessToken,
  verifyAccessToken,
  readAccessToken,
  setAccessCookie,
  requireAccess,
  requireAdmin,
  timingSafeEqualString
};
