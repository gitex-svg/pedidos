import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import router from "./routes";
import { logger } from "./lib/logger";
import { loadConfig } from "./lib/config";
import { pool } from "@workspace/db";

const app: Express = express();
const config = loadConfig(process.env, { requirePort: false });

// Numeric trust is deliberate: proxy-provided forwarding headers are trusted
// only after the configured number of network hops.
app.set("trust proxy", config.trustProxyHops);
app.use(
  pinoHttp({
    logger,
    genReqId(req, res) {
      const supplied = req.headers["x-request-id"];
      const requestId = typeof supplied === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(supplied)
        ? supplied
        : randomUUID();
      res.setHeader("X-Request-Id", requestId);
      return requestId;
    },
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use((_req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (config.production) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});
app.use(cookieParser());
// ERP synchronization accepts batches of up to 500 records. Keep the payload
// ceiling explicit and bounded while allowing valid batches to reach Zod.
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));
app.get("/ready", async (_req, res) => {
  try {
    await withTimeout(pool.query("SELECT 1"), config.readinessTimeoutMs);
    res.status(200).json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "unavailable" });
  }
});
app.use("/api", router);
// API routes must never fall through to the SPA, including unknown API paths.
app.use("/api", (_req, res) => res.status(404).json({ error: "Recurso não encontrado." }));

if (config.production) {
  const staticDir = path.resolve(config.staticDir);
  const indexFile = path.join(staticDir, "index.html");
  app.use(express.static(staticDir, { index: "index.html", fallthrough: true }));
  app.use((req, res, next) => {
    // Do not turn missing static resources or non-GET requests into HTML.
    if (req.method !== "GET" || path.extname(req.path) || !req.accepts("html")) return next();
    res.sendFile(indexFile, (error) => {
      if (error) next(error);
    });
  });
}
app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  req.log.error({ err: error }, "Unhandled request error");
  const errorMessage = config.production ? "Erro interno do servidor." : "Erro interno do servidor.";
  res.status(500).json({ error: errorMessage, requestId: req.id });
});

export default app;

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Readiness check timed out")), timeoutMs);
    operation.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}
