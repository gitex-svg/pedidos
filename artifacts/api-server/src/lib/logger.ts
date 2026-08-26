import pino from "pino";
import { loadConfig } from "./config";

const config = loadConfig(process.env, { requirePort: false });
const isProduction = config.production;

export const logger = pino({
  level: config.logLevel,
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
    "req.body.password",
    "req.body.email",
    "password",
    "email",
    "*.password",
    "*.email",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
