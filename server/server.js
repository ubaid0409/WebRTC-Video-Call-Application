// server/server.js
import WebSocket, { WebSocketServer } from "ws";

const wss = new WebSocketServer({ host: '0.0.0.0', port: 8080 });
const clients = new Map(); // userId → WebSocket

function sendTo(userId, payload) {
  userId = userId?.toLowerCase(); // 👈 normalize
  const ws = clients.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
    return true;
  }
  return false;
}

wss.on("connection", (ws) => {
  let myId = null;
  console.log("[WS] client connected");

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return ws.send(JSON.stringify({ type: "error", reason: "bad json" }));
    }

    const { type } = msg || {};

    // --- Register ---
    if (type === "register") {
      let { userId } = msg;
      if (!userId)
        return ws.send(JSON.stringify({ type: "error", reason: "userId required" }));

      userId = userId.toLowerCase(); // 👈 normalize
      if (clients.has(userId)) {
        try { clients.get(userId)?.close(); } catch {}
      }
      clients.set(userId, ws);
      myId = userId;
      console.log(`[WS] registered ${userId}. total=${clients.size}`);
      return ws.send(JSON.stringify({ type: "registered", userId }));
    }

    if (!myId)
      return ws.send(JSON.stringify({ type: "error", reason: "not registered" }));

    // --- Call ---
    if (type === "call") {
      const to = msg.to.toLowerCase(); // 👈 normalize
      const ok = sendTo(to, { type: "incoming-call", from: myId });
      if (!ok) sendTo(myId, { type: "call-failed", to, reason: "callee offline" });
      return;
    }

    // --- Accept / Reject ---
    if (type === "call-accept" || type === "call-reject") {
      const to = msg.to.toLowerCase(); // 👈 normalize
      sendTo(to, { type, from: myId });
      return;
    }

    // --- Offer / Answer / ICE ---
    if (type === "offer" || type === "answer" || type === "ice") {
      const to = msg.to.toLowerCase(); // 👈 normalize
      const { ...rest } = msg;
      sendTo(to, { type, from: myId, ...rest });
      return;
    }

    // --- Unknown ---
    ws.send(JSON.stringify({ type: "error", reason: "unknown type" }));
  });

  ws.on("close", () => {
    if (myId && clients.get(myId) === ws) clients.delete(myId);
    console.log("[WS] client disconnected");
  });
});

console.log("✅ WebSocket signaling on ws://localhost:8080");
