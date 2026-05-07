/**
 * Production-safe logger.
 *
 * - In production: emits a single-line JSON record per event so
 *   `docker logs` can be piped to any log aggregator without parsing
 *   tricks.
 * - In development: pretty-printed for human reading.
 * - Always strips known sensitive keys (password, passwordHash, token,
 *   sessionToken) from the structured payload before serialising.
 */

type Level = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "sessiontoken",
  "authorization",
  "cookie",
  "set-cookie",
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[redacted:depth]";
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((v) => redact(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = "[redacted]";
    } else {
      out[k] = redact(v, depth + 1);
    }
  }
  return out;
}

function emit(level: Level, msg: string, data?: Record<string, unknown>) {
  const isProd = process.env.NODE_ENV === "production";
  const record = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(data ? { data: redact(data) } : {}),
  };
  if (isProd) {
    // Single-line JSON for log shippers.
    const line = JSON.stringify(record);
    if (level === "error" || level === "warn") {
      console.error(line);
    } else {
      console.log(line);
    }
    return;
  }
  // Dev: human-friendly.
  const tag = `[${level}]`;
  if (data) {
    if (level === "error") console.error(tag, msg, redact(data));
    else if (level === "warn") console.warn(tag, msg, redact(data));
    else console.log(tag, msg, redact(data));
  } else {
    if (level === "error") console.error(tag, msg);
    else if (level === "warn") console.warn(tag, msg);
    else console.log(tag, msg);
  }
}

export const logger = {
  debug: (msg: string, data?: Record<string, unknown>) =>
    process.env.NODE_ENV === "production" ? undefined : emit("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) => emit("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => emit("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => emit("error", msg, data),
};
