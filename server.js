const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";

// Validate the environment before doing any expensive boot work. In
// production, missing-or-bad env should fail loud rather than serve a
// half-broken app. server.js is launched via tsx so we can require TS
// modules directly.
const { inspectEnv, logEnvReport } = require("./app/lib/env.ts");
const envReport = inspectEnv();
logEnvReport(envReport, (msg) => console.log(msg));
if (!envReport.ok) {
  if (!dev) {
    console.error("[boot] aborting: environment validation failed");
    process.exit(1);
  }
  console.warn("[boot] continuing with invalid env (dev only)");
}

const app = next({ dev, hostname: process.env.HOSTNAME || "0.0.0.0", port: envReport.resolved.port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Initialize Socket.IO on the same HTTP server.
  const { initSocketIO } = require("./app/lib/matchmaking.ts");
  initSocketIO(server);

  const port = envReport.resolved.port;
  const hostname = process.env.HOSTNAME || "0.0.0.0";
  server.listen(port, hostname, (err) => {
    if (err) throw err;
    // Keep this in plain console.log so docker logs / journalctl always
    // show a clear "we're up" line regardless of NODE_ENV.
    console.log(`> Ready on http://${hostname}:${port} (env=${process.env.NODE_ENV || "development"})`);
  });

  // Graceful shutdown so containers can stop quickly. Without this,
  // docker stop waits 10 s to SIGKILL.
  function shutdown(signal) {
    console.log(`> Received ${signal}, draining connections...`);
    server.close(() => {
      console.log("> HTTP server closed. Bye.");
      process.exit(0);
    });
    // Hard-kill if still alive after 8 s.
    setTimeout(() => {
      console.error("> Shutdown timed out, forcing exit.");
      process.exit(1);
    }, 8000).unref();
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
});
