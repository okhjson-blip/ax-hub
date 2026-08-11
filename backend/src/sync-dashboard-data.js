/**
 * CLI: ax-pjt-dashboard → ax-hub 대시보드 테이블 이관
 * 런타임과 동일한 syncDashboardToHub() 사용
 */
require("./env");
const { syncDashboardToHub } = require("./dashboard-sync");

async function main() {
  const result = await syncDashboardToHub();
  console.log(JSON.stringify(result, null, 2));
  if (!result.synced) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
