import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const pagesDir = path.join(root, "pages");
const hidden = path.join(root, ".founder-pages");
const publicDir = path.join(root, "public");
const mode = process.argv[2] === "dev" ? "dev" : "build";

if (existsSync(hidden) && !existsSync(pagesDir)) renameSync(hidden, pagesDir);

let moved = false;
function restore() {
  if (!moved) return;
  moved = false;
  if (existsSync(hidden) && !existsSync(pagesDir)) renameSync(hidden, pagesDir);
}

process.on("exit", restore);
process.on("SIGINT", () => {
  restore();
  process.exit(130);
});
process.on("SIGTERM", () => {
  restore();
  process.exit(143);
});

if (existsSync(pagesDir)) {
  renameSync(pagesDir, hidden);
  moved = true;
  rmSync(publicDir, { recursive: true, force: true });
  mkdirSync(publicDir, { recursive: true });
  cpSync(hidden, publicDir, { recursive: true });
}

const child = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), mode === "dev" ? "dev" : "build", ...(mode === "dev" ? ["--port", "38471"] : [])], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  restore();
  process.exit(code ?? 1);
});
