const { createApp, isSupabaseConfigured } = require("./app");

const PORT = Number(process.env.PORT) || 3090;
const HOST =
  process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

function boot() {
  const app = createApp();

  app.listen(PORT, HOST, () => {
    console.log("");
    console.log("  AX Hub");
    console.log(`  Frontend + Backend: http://${HOST}:${PORT}`);
    console.log(`  Health check:       http://${HOST}:${PORT}/api/health`);
    console.log(`  Hub summary:        http://${HOST}:${PORT}/api/hub-summary`);
    console.log(`  DB driver:          ${isSupabaseConfigured() ? "supabase" : "unconfigured"}`);
    console.log("");
  });
}

try {
  boot();
} catch (err) {
  console.error(err);
  process.exit(1);
}
