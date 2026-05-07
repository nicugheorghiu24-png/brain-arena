/**
 * Environment validation for Brain Arena.
 *
 * Called once at server boot from server.js. Fails LOUD in production
 * (process.exit) if the required env is missing, so a misconfigured
 * deploy never serves traffic. In development everything is optional —
 * the app falls back to local-only mode without a DB.
 */

type Severity = "error" | "warn" | "info";

type Issue = { severity: Severity; message: string };

export type EnvReport = {
  ok: boolean;
  issues: Issue[];
  resolved: {
    nodeEnv: string;
    port: number;
    hasDatabaseUrl: boolean;
    publicOrigin: string | null;
  };
};

export function inspectEnv(): EnvReport {
  const issues: Issue[] = [];
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const isProd = nodeEnv === "production";

  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  if (Number.isNaN(port) || port <= 0 || port > 65535) {
    issues.push({
      severity: "error",
      message: `PORT must be a valid TCP port (got "${process.env.PORT}").`,
    });
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    issues.push({
      severity: isProd ? "error" : "warn",
      message:
        "DATABASE_URL is not set. " +
        (isProd
          ? "Production requires Postgres."
          : "Dev will run in local-only mode (no real auth, no persistence)."),
    });
  } else if (isProd && !databaseUrl.startsWith("postgres")) {
    issues.push({
      severity: "error",
      message: "DATABASE_URL must be a postgres:// URL in production.",
    });
  } else if (
    isProd &&
    !/sslmode=/.test(databaseUrl) &&
    !databaseUrl.includes("localhost") &&
    !databaseUrl.includes("@db:") &&
    !databaseUrl.includes("@postgres:")
  ) {
    // Remote Postgres in prod should use SSL. Same-network compose-named
    // hosts (db / postgres / localhost) are exempted.
    issues.push({
      severity: "warn",
      message:
        "DATABASE_URL points at a remote host without sslmode=. Add ?sslmode=require for managed Postgres.",
    });
  }

  const publicOriginRaw = process.env.PUBLIC_ORIGIN?.trim();
  if (isProd && !publicOriginRaw) {
    issues.push({
      severity: "error",
      message:
        "PUBLIC_ORIGIN must be set in production (e.g. https://brainarena.gg). " +
        "Used for Socket.IO CORS and cookie scope.",
    });
  }

  const publicOrigin = publicOriginRaw ?? null;
  if (publicOrigin) {
    for (const origin of publicOrigin.split(",").map((s) => s.trim())) {
      if (!origin) continue;
      try {
        const u = new URL(origin);
        if (isProd && u.protocol !== "https:") {
          issues.push({
            severity: "warn",
            message: `PUBLIC_ORIGIN entry "${origin}" is not https. Cookies require https in production.`,
          });
        }
      } catch {
        issues.push({
          severity: "error",
          message: `PUBLIC_ORIGIN entry "${origin}" is not a valid URL.`,
        });
      }
    }
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  return {
    ok: !hasErrors,
    issues,
    resolved: {
      nodeEnv,
      port: Number.isFinite(port) ? port : 3000,
      hasDatabaseUrl: Boolean(databaseUrl),
      publicOrigin,
    },
  };
}

export function logEnvReport(report: EnvReport, log: (msg: string) => void) {
  log(
    `[env] node_env=${report.resolved.nodeEnv} port=${report.resolved.port} ` +
      `db=${report.resolved.hasDatabaseUrl ? "configured" : "missing"} ` +
      `origin=${report.resolved.publicOrigin ?? "(unset)"}`,
  );
  for (const issue of report.issues) {
    log(`[env:${issue.severity}] ${issue.message}`);
  }
}
