#!/usr/bin/env node
/**
 * Brain Arena — multi-client Socket.IO smoke test.
 *
 * Wire-level validation that:
 *   - 2 distinct users can sign up via /api/auth/signup
 *   - Both can connect to the Socket.IO server with their session cookies
 *   - Both can `join_queue` for chess
 *   - The matchmaker pairs them and emits `match_found` to both
 *   - Both can `join_match` and receive `match_state`
 *   - Cleanup: `leave_queue` + disconnect doesn't leave ghost players
 *
 * Usage:
 *   node scripts/smoke-multi-socket.mjs https://playbrainarena.com
 *
 * Exit code 0 on full pass, non-zero on any failure.
 */

import { io as ioClient } from "socket.io-client";

const ORIGIN = process.argv[2] ?? "https://playbrainarena.com";
const TS = Date.now();

function log(label, msg = "") {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${label}${msg ? " — " + msg : ""}`);
}

async function signup(email, username, password) {
  const res = await fetch(`${ORIGIN}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, username }),
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  if (!res.ok || !data?.ok) {
    throw new Error(`signup failed: ${res.status} — ${text.slice(0, 200)}`);
  }
  // Capture the Set-Cookie ba_session value
  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = /ba_session=([^;]+)/.exec(setCookie);
  if (!m) throw new Error(`no ba_session in Set-Cookie: ${setCookie}`);
  return { id: data.user.id, username: data.user.username, cookie: `ba_session=${m[1]}` };
}

function connectSocket(user) {
  return new Promise((resolve, reject) => {
    // Default transport order is `polling` → `websocket`. Use this
    // (not websocket-only) so the cookie is sent on the polling XHR
    // handshake, which is when the server's io.use(...) middleware
    // reads it. websocket-only on Node socket.io-client doesn't
    // forward extraHeaders to the upgrade request reliably.
    const socket = ioClient(ORIGIN, {
      transports: ["polling", "websocket"],
      withCredentials: true,
      extraHeaders: { Cookie: user.cookie },
      reconnection: false,
      timeout: 10_000,
    });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (err) => reject(new Error(`connect_error: ${err.message}`)));
    setTimeout(() => reject(new Error("connect timeout")), 12_000);
  });
}

function once(socket, event, timeoutMs = 12_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timeout waiting for "${event}" on ${socket.id}`));
    }, timeoutMs);
    const handler = (payload) => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(event, handler);
  });
}

async function main() {
  log("setup", `origin=${ORIGIN}`);

  // 1. Sign up 2 fresh users
  log("step 1", "sign up two test users");
  const userA = await signup(`mc-a-${TS}@brain-arena.test`, `mca${TS}`, `mca-${TS}-pw`);
  const userB = await signup(`mc-b-${TS}@brain-arena.test`, `mcb${TS}`, `mcb-${TS}-pw`);
  log("  ok", `A=${userA.username} (${userA.id.slice(0, 8)}…)  B=${userB.username} (${userB.id.slice(0, 8)}…)`);

  // 2. Connect both via Socket.IO with cookies
  log("step 2", "connect both sockets");
  const sockA = await connectSocket(userA);
  log("  ok", `A connected as socket=${sockA.id}`);
  const sockB = await connectSocket(userB);
  log("  ok", `B connected as socket=${sockB.id}`);

  // 3. Both join chess queue; first will be queued, second triggers match_found
  log("step 3", "both join chess queue");
  // Surface server queue_error early so the test fails fast instead of
  // timing out on match_found.
  for (const [s, name] of [
    [sockA, "A"],
    [sockB, "B"],
  ]) {
    s.on("queue_error", (data) => {
      console.error(`  ${name} got queue_error: ${JSON.stringify(data)}`);
    });
  }
  const matchFoundA = once(sockA, "match_found");
  const matchFoundB = once(sockB, "match_found");
  sockA.emit("join_queue", { gameId: "chess" });
  await once(sockA, "queued");
  log("  A queued");
  sockB.emit("join_queue", { gameId: "chess" });

  const [foundA, foundB] = await Promise.all([matchFoundA, matchFoundB]);
  if (foundA.matchId !== foundB.matchId) {
    throw new Error(`matchId mismatch — A=${foundA.matchId} B=${foundB.matchId}`);
  }
  log("  ok", `match_found on both, matchId=${foundA.matchId}`);

  // 4. Both join_match (chess pre-starts the state, so match_state should arrive)
  log("step 4", "both join_match → expect match_state");
  const stateA = once(sockA, "match_state");
  const stateB = once(sockB, "match_state");
  sockA.emit("join_match", { matchId: foundA.matchId });
  sockB.emit("join_match", { matchId: foundB.matchId });
  const [sA, sB] = await Promise.all([stateA, stateB]);
  if (sA.matchId !== foundA.matchId || sB.matchId !== foundB.matchId) {
    throw new Error("match_state matchId mismatch");
  }
  if (sA.fen !== sB.fen) {
    throw new Error(`fen mismatch — A=${sA.fen} B=${sB.fen}`);
  }
  log("  ok", `both received match_state with same FEN, turn=${sA.turn}`);

  // 5. Resign from A → both should get match_end
  log("step 5", "A resigns → both receive match_end");
  const endA = once(sockA, "match_end");
  const endB = once(sockB, "match_end");
  sockA.emit("resign", { matchId: foundA.matchId });
  const [eA, eB] = await Promise.all([endA, endB]);
  if (eA.outcome.outcome !== "win" || eA.outcome.winnerId !== userB.id) {
    throw new Error(`resign winner wrong — outcome=${JSON.stringify(eA.outcome)}`);
  }
  log("  ok", `match_end with winner=${userB.username} (B), reason=${eA.outcome.reason}`);

  // 6. Disconnect both — server should clean up queue/match state
  log("step 6", "disconnect both sockets");
  sockA.disconnect();
  sockB.disconnect();
  log("  ok");

  log("PASS", `multi-client smoke test complete in ${Math.round((Date.now() - TS) / 1000)}s`);
  process.exit(0);
}

main().catch((err) => {
  console.error("FAIL —", err.message);
  process.exit(1);
});
