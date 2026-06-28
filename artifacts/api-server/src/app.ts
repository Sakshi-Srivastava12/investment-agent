import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { createRequire } from "module";
import router from "./routes";
import { logger } from "./lib/logger";

// __dirname is injected by the esbuild banner; fall back to CWD-based path
const staticDir = path.resolve(
  process.cwd(),
  "artifacts/investment-agent/dist/public",
);

const app: Express = express();

app.use(
  pinoHttp({
    logger,
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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use("/api", router);

// Serve the built Vite frontend
app.use(express.static(staticDir));

// SPA fallback — all non-API routes return index.html
app.get("*", (_req, res) => {
  res.sendFile(path.join(staticDir, "index.html"));
});

export default app;
