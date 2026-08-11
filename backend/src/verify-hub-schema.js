require("./env");
const { Client } = require("pg");

const EXPECTED = {
  hub_task_assets: [
    "id",
    "source_task_id",
    "source_company_id",
    "source_participant_id",
    "title",
    "company_name",
    "participant_name",
    "dept",
    "difficulty",
    "progress",
    "start_date",
    "end_date",
    "goal",
    "as_is_process",
    "to_be_process",
    "body",
    "tags",
    "extras",
    "imported_at",
    "created_at",
    "updated_at"
  ],
  hub_prompts: [
    "id",
    "category",
    "title",
    "template",
    "variables",
    "tags",
    "author",
    "like_count",
    "created_at",
    "updated_at",
    "statik",
    "source_filename",
    "description"
  ],
  hub_vibe_docs: [
    "id",
    "category",
    "doc_type",
    "title",
    "body",
    "storage_path",
    "tags",
    "created_at",
    "updated_at",
    "statik",
    "description",
    "author",
    "readme",
    "plan_doc",
    "ux_scenario",
    "ui_design",
    "source_files",
    "other_doc"
  ],
  hub_cases: [
    "id",
    "category",
    "title",
    "summary",
    "before_text",
    "after_text",
    "outcome",
    "efficiency",
    "pdf_path",
    "gemini_raw",
    "status",
    "created_at",
    "updated_at",
    "pdf_filename",
    "key_points",
    "ai_summary",
    "tags"
  ],
  hub_settings: ["key", "value", "updated_at"]
};

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  let ok = true;
  for (const [table, cols] of Object.entries(EXPECTED)) {
    const { rows } = await client.query(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = $1`,
      [table]
    );
    const have = new Set(rows.map((r) => r.column_name));
    const missing = cols.filter((c) => !have.has(c));
    if (missing.length) {
      ok = false;
      console.error(`MISSING ${table}:`, missing.join(", "));
    } else {
      console.log(`OK ${table} (${cols.length} cols)`);
    }
  }
  await client.end();
  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
