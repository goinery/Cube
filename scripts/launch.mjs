import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const web = join(root, "web");
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error("AXIS 需要 Node.js 22.13 或更高版本。请更新 Node.js 后重试。");
  process.exit(1);
}
// 依赖由仓库根的 npm workspace 统一安装，可能被提升到根 node_modules，也可能留在 web 内。
function tool(relative) {
  const candidates = [
    join(web, "node_modules", relative),
    join(root, "node_modules", relative),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    console.error("请先运行 npm install 安装依赖。");
    process.exit(1);
  }
  return found;
}

function run(relative, args = []) {
  const result = spawnSync(process.execPath, [tool(relative), ...args], {
    cwd: web,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) console.error(result.error.message);
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}

const task = process.argv[2] || "dev";
switch (task) {
  case "build":
    run("typescript/bin/tsc", ["--noEmit"]);
    run("vite/bin/vite.js", ["build"]);
    break;
  case "verify":
    run("typescript/bin/tsc", ["--noEmit"]);
    break;
  case "start":
    if (!existsSync(join(web, "dist", "index.html"))) {
      console.error("请先运行 npm run build。");
      process.exit(1);
    }
    run("vite/bin/vite.js", ["preview", "--host", "0.0.0.0", "--port", "3000"]);
    break;
  case "dev":
    run("vite/bin/vite.js", ["--host", "0.0.0.0", "--port", "3000"]);
    break;
  default:
    console.error(`未知任务：${task}。可用任务：dev、build、start、verify。`);
    process.exit(1);
}
