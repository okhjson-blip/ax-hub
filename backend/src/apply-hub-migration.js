const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function loadEnv() {
  const envPath = path.join(__dirname, "..", "..", ".env");
  const env = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    env[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim();
  }
  return env;
}

async function main() {
  const env = loadEnv();
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL missing");
  const migrationsDir = path.join(__dirname, "..", "..", "supabase", "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const client = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await client.query(sql);
    console.log("applied:", file);
  }
  const r = await client.query(
    "select tablename from pg_tables where schemaname = 'public' and tablename like 'hub_%' order by 1"
  );
  console.log("migration ok:", r.rows.map((x) => x.tablename).join(", "));
  const cols = await client.query(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'hub_prompts'
     order by ordinal_position`
  );
  console.log("hub_prompts columns:", cols.rows.map((x) => x.column_name).join(", "));
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
