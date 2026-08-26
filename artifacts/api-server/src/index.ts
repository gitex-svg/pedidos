import app from "./app";
import { logger } from "./lib/logger";
import { loadConfig } from "./lib/config";

const config = loadConfig();
if (!config.port) throw new Error("Invalid configuration: PORT");
const port = config.port;

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
