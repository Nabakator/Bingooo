import { spawn } from "node:child_process";
import path from "node:path";

const mode = process.argv[2];

if (mode !== "development" && mode !== "production") {
  console.error("Usage: node scripts/run-server.mjs <development|production>");
  process.exit(1);
}

const isWindows = process.platform === "win32";
const tsxBinary = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  isWindows ? "tsx.cmd" : "tsx",
);

const child = spawn(tsxBinary, ["server.ts"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: mode,
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
