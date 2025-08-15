// server/server.js
import WebSocket, { WebSocketServer } from "ws";

const wss = new WebSocketServer({ host: '0.0.0.0', port: 8080 });
const clients = new Map();
 // Ye ek Map banaya gaya hai jisme hum store karenge: userId → WebSocket connection.

function sendTo(userId, payload) {
  const ws = clients.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
    return true;
  }
  return false;
}
// Ye helper function hai jo kisi specific userId wale client ko message bhejta hai.
// Agar user online hai aur connection open hai to JSON.stringify karke data send karta hai.

wss.on("connection", (ws) => {
  let myId = null;
  console.log("[WS] client connected");
 // Jab naya client connect hota hai, yahan ek variable myId banate hain jo batayega kaun user connected hai.

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); }
    catch { return ws.send(JSON.stringify({ type: "error", reason: "bad json" })); }
// Jab client se koi message aata hai, pehle usko JSON mein parse karte hain.
// Agar galat format hai to "bad json" error bhej dete hain.

    const { type } = msg || {};

    if (type === "register") {
      const { userId } = msg;
      if (!userId) return ws.send(JSON.stringify({ type: "error", reason: "userId required" }));
      if (clients.has(userId)) { try { clients.get(userId)?.close(); } catch {} }
      clients.set(userId, ws);
      myId = userId;
      console.log(`[WS] registered ${userId}. total=${clients.size}`);
      return ws.send(JSON.stringify({ type: "registered", userId }));
    }
// Client apna userId send karta hai register hone ke liye.
// Purana connection close karke naya set karte hain.
// Confirmation bhejte hain: "registered".

    if (!myId) return ws.send(JSON.stringify({ type: "error", reason: "not registered" }));
// Agar register kiye bina koi aur message bheja gaya to error de dete hain.

    if (type === "call") {
      const { to } = msg;
      const ok = sendTo(to, { type: "incoming-call", from: myId });
      if (!ok) sendTo(myId, { type: "call-failed", to, reason: "callee offline" });
      return;
    }         // call invite bhejna


    if (type === "call-accept" || type === "call-reject") {
      const { to } = msg;
      sendTo(to, { type, from: myId });
      return;
    }// accept signal  // reject signal

    if (type === "offer" || type === "answer" || type === "ice") {
      const { to, ...rest } = msg;
      sendTo(to, { type, from: myId, ...rest });
      return;
    }// SDP offer forward  // SDP answer forward  // ICE candidate forward
// Har case mein sendTo function ka use karke dusre peer ko message forward hota hai.

    ws.send(JSON.stringify({ type: "error", reason: "unknown type" }));
  });

  ws.on("close", () => {
    if (myId && clients.get(myId) === ws) clients.delete(myId);
    console.log("[WS] client disconnected");
  });
});
// Jab connection close hota hai to clients Map se user ko remove kar dete hain.

console.log("✅ WebSocket signaling on ws://localhost:8080");
