import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
let host = process.env.NITRO_HOST || process.env.HOST || "127.0.0.1";
let port = process.env.NITRO_PORT || process.env.PORT || "4173";

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--host") {
    const next = args[i + 1];
    host = !next || next.startsWith("--") ? "0.0.0.0" : next;
    if (next && !next.startsWith("--")) i += 1;
    continue;
  }
  if (arg.startsWith("--host=")) {
    host = arg.slice("--host=".length) || "0.0.0.0";
    continue;
  }
  if (arg === "--port") {
    const next = args[i + 1];
    if (next && !next.startsWith("--")) {
      port = next;
      i += 1;
    }
    continue;
  }
  if (arg.startsWith("--port=")) {
    port = arg.slice("--port=".length) || port;
  }
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "..");
const wranglerConfig = path.join(rootDir, ".output", "server", "wrangler.json");

if (!existsSync(wranglerConfig)) {
  console.error("Build output not found at .output/server/wrangler.json. Run `npm run build` first.");
  process.exit(1);
}

const child =
  process.platform === "win32"
    ? spawn(
        "powershell.exe",
        [
          "-NoLogo",
          "-NoProfile",
          "-Command",
          `npx wrangler dev --config '${wranglerConfig.replace(/'/g, "''")}' --ip ${host} --port ${port}`,
        ],
        {
          cwd: rootDir,
          env: process.env,
          stdio: "inherit",
        },
      )
    : spawn(
        "npx",
        ["wrangler", "dev", "--config", wranglerConfig, "--ip", host, "--port", port],
        {
          cwd: rootDir,
          env: process.env,
          stdio: "inherit",
        },
      );

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
