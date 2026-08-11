const { createClient } = require("@supabase/supabase-js");
const { isSupabaseConfigured, isDashboardSupabaseConfigured } = require("./env");

let hubClient = null;
let dashboardClient = null;

function getSupabaseAdmin() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다. .env를 확인하세요.");
  }
  if (!hubClient) {
    hubClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return hubClient;
}

/**
 * ax-pjt-dashboard 소스 DB (companies / participants / tasks 읽기)
 * DASHBOARD_SUPABASE_* 가 없으면 hub 프로젝트로 폴백(로컬 복사본).
 */
function getDashboardSupabaseAdmin() {
  if (isDashboardSupabaseConfigured()) {
    if (!dashboardClient) {
      dashboardClient = createClient(
        process.env.DASHBOARD_SUPABASE_URL,
        process.env.DASHBOARD_SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
    }
    return dashboardClient;
  }
  return getSupabaseAdmin();
}

module.exports = { getSupabaseAdmin, getDashboardSupabaseAdmin, isDashboardSupabaseConfigured };
