import app from "./app";
import { existsSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./lib/logger";
import { loadConfig } from "./lib/config";
import { pool } from "@workspace/db";

export function startServer(): Server {
  const config = loadConfig();
  if (!config.port) throw new Error("Invalid configuration: PORT");
  if (config.production) {
    const indexFile = path.join(path.resolve(config.staticDir), "index.html");
    if (!existsSync(indexFile) || !statSync(indexFile).isFile()) {
      throw new Error("Invalid configuration: production static assets are missing (expected index.html)");
    }
  }

  const server = createServer(app);
  server.listen(config.port, config.host, () => {
    logger.info({ port: config.port, host: config.host }, "Server listening");
  });
  server.once("error", (err) => {
    logger.error({ err }, "Error listening on port");
    process.exitCode = 1;
  });
  installShutdownHandlers(server, config.readinessTimeoutMs);
  return server;
}

function installShutdownHandlers(server: Server, timeoutMs: number) {
  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Gracefully shutting down");
    await withinTimeout(new Promise<void>((resolve) => server.close(() => resolve())), timeoutMs);
    await withinTimeout(pool.end(), timeoutMs);
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

async function withinTimeout(operation: Promise<unknown>, timeoutMs: number) {
  await Promise.race([
    operation,
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) startServer();
