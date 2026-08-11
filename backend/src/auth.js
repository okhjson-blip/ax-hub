const crypto = require("crypto");

function adminPassword() {
  return process.env.ADMIN_PASSWORD || "admin2026";
}

function tokenSecret() {
  return process.env.ADMIN_TOKEN_SECRET || adminPassword();
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
  adminPassword,
  createAdminToken,
  verifyAdminToken,
  requireAdmin
};
