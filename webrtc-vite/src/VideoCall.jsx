import React, { useEffect, useRef, useState } from "react";

export default function VideoCall() {
  // UI state
  const [myId, setMyId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [status, setStatus] = useState("disconnected"); // disconnected|registered|calling|ringing|in-call
  const [incomingFrom, setIncomingFrom] = useState(null);
  const [logs, setLogs] = useState([]);
// myId → apna ID jo tum server ko doge register hone ke liye.
// targetId → jis ko call karna hai.
// status → call ka current status (disconnected, registered, calling, ringing, in-call).
// incomingFrom → agar koi tumhe call kare to uska ID store hota hai.
// logs → console jaisi array jo UI me show hoti hai.

  // Media & connection
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const currentPeerRef = useRef(null); // the other side
// localVideoRef → <video> tag jisme apna camera feed chalega.
// remoteVideoRef → <video> tag jisme dusre user ka video chalega.
// wsRef → WebSocket ka object.
// pcRef → RTCPeerConnection ka object.
// localStreamRef → apna MediaStream (camera/mic ka).
// remoteStreamRef → dusre ka stream.
// currentPeerRef → current call wale peer ka ID.

  const log = (...a) => setLogs((l) => [...l, a.join(" ")]);
// Array me naye log message push karta hai.

  const wsSend = (o) => wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.send(JSON.stringify(o));
// Sirf tab send karega jab WebSocket open ho.

  useEffect(() => {
    const ws = new WebSocket('ws://192.168.30.116:8080');
    wsRef.current = ws;
// Jab component load hota hai → WebSocket connect ho jata hai signaling server se.

    ws.onopen = () => log("[WS] connected");
    ws.onclose = () => log("[WS] closed");
    ws.onerror = (e) => log("[WS] error", e.message || e.type);
// Connection events log me likhta hai.

    ws.onmessage = async (evt) => {
      const msg = JSON.parse(evt.data);
      const { type } = msg;
      log("[WS] msg:", type, JSON.stringify(msg));
// Server se jo bhi data aata hai, usko JSON parse karke type check karte hain.

      if (type === "registered") setStatus("registered");
// Register hone ke baad status update karta hai.

      if (type === "incoming-call") {
        setIncomingFrom(msg.from);
        setStatus("ringing");
      }
// Jab koi call kare to status ringing ho jata hai aur callee ka naam store hota hai.

      if (type === "call-failed") {
        setStatus("registered");
        alert(`Call failed: ${msg.reason || "unknown"}`);
      }
// Agar call fail hui (callee offline etc.) to alert show karta hai.

      if (type === "call-accept") {
        // Caller side: prepare media (try), create offer
        currentPeerRef.current = msg.from;
        await maybeGetLocalMediaOrReceiveOnly();
        await ensurePeerConnection(msg.from);
        await makeOffer(msg.from);
        setStatus("calling");
      }
// Caller ko jab accept milta hai:
// Local media stream le aata hai
// PeerConnection banata hai
// Offer banake bhejta hai

      if (type === "call-reject") {
        setStatus("registered");
        alert("Call rejected");
        cleanupPeer();
      }
// Call reject hone par alert aur status reset.

      if (type === "offer") {
        // Callee: got offer → ensure media (try), set remote, create answer
        currentPeerRef.current = msg.from;
        await maybeGetLocalMediaOrReceiveOnly();
        await ensurePeerConnection(msg.from);
        await pcRef.current.setRemoteDescription(msg.offer);
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        wsSend({ type: "answer", to: msg.from, answer });
        setStatus("in-call");
      }
// Jab callee ko Offer milta hai:
// Local media le aata hai
// Peer connection banata hai
// Remote description set karta hai
// Answer banata hai aur bhejta hai
// Status in-call ho jata hai

      if (type === "answer") {
        await pcRef.current?.setRemoteDescription(msg.answer);
        setStatus("in-call");
      }
// Caller ko jab answer milta hai, remote description set hota hai → connection complete.

      if (type === "ice") {
        if (msg.candidate && pcRef.current) {
          try { await pcRef.current.addIceCandidate(msg.candidate); }
          catch (e) { log("[ICE] add failed", e.message); }
        }
      }
    };
// Network path banane ke liye ICE candidate add hota hai.

    return () => {
      try { ws.close(); } catch { }
      cleanupPeer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enumerateHasDevices() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      return {
        hasVideo: list.some(d => d.kind === "videoinput"),
        hasAudio: list.some(d => d.kind === "audioinput"),
      };
    } catch {
      return { hasVideo: true, hasAudio: true }; // best-effort
    }
  }
// Check karta hai ki camera/mic available hai ya nahi.

  async function maybeGetLocalMediaOrReceiveOnly() {
    if (localStreamRef.current) return;
    const { hasVideo, hasAudio } = await enumerateHasDevices();

    // Try to get user media. If NotFound, fall back to receive-only (no local tracks).
    try {
      if (!hasVideo && !hasAudio) {
        log("[MEDIA] no devices found → receive-only");
        return; // receive-only
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: hasVideo, audio: hasAudio });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      log("[MEDIA] local ready");
    }  catch (err) {
      alert("Media error, receive-only mode");
    }
  }
// Camera/mic access lene ki koshish karta hai, warna receive-only mode me chale jata hai.

  async function ensurePeerConnection(peerId) {
    if (pcRef.current) return pcRef.current;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    // Local tracks only if we have stream (sendrecv). If not, we remain recvonly.
    localStreamRef.current?.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current));

    // Remote stream
    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;

    pc.ontrack = (e) => {
      e.streams[0].getTracks().forEach((t) => remoteStream.addTrack(t));
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) wsSend({ type: "ice", to: peerId, candidate: e.candidate });
    };

    pc.onconnectionstatechange = () => {
      log("[PC] state:", pc.connectionState);
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        setStatus("registered");
      }
    };

    pcRef.current = pc;
    return pc;
  }
// PeerConnection banata hai, Google STUN server use karta hai.
// Local tracks add karta hai agar available ho.
// Remote stream create karke remote video me set karta hai.
// pc.ontrack → remote ka track add karta hai.
// pc.onicecandidate → candidate bhejta hai WebSocket se.
// pc.onconnectionstatechange → agar connection fail hua to reset kar deta hai.

  async function makeOffer(to) {
    const pc = pcRef.current;
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await pc.setLocalDescription(offer);
    wsSend({ type: "offer", to, offer });
  }
// Caller yahan Offer banake send karta hai.

  function cleanupPeer() {
    try {
      pcRef.current?.getSenders()?.forEach((s) => s.track?.stop?.());
      pcRef.current?.close?.();
    } catch { }
    pcRef.current = null;
    currentPeerRef.current = null;
    // localStream ko intentionally NOT stop: user re-call kar sake
  }
// Call khatam hone pe PeerConnection close karta hai.

  // UI actions
  const handleRegister = () => {
    if (!myId.trim()) return alert("Plzz enter caller name.");

    if (wsRef.current?.readyState !== WebSocket.OPEN) return alert("WebSocket not connected yet.");
    wsSend({ type: "register", userId: myId.trim() });
  };
// Agar myId khaali hai (sirf spaces) to alert show karega aur function se nikal jayega.
// Agar WebSocket abhi tak connect nahi hua (readyState !== OPEN) to alert dega.
// Warna wsSend helper se server ko register message bhej dega.

  const handleStartCall = () => {
    if (status !== "registered") return alert("Register first.");
    if (!targetId.trim()) return alert("Plzz enter callee name.");
    if (targetId.trim() === myId.trim()) return alert("Callee name cannot be same as caller name.");
    wsSend({ type: "call", to: targetId.trim() });
    setStatus("calling");
  };
// Agar abhi tak tum registered nahi ho to call start nahi hogi.
// Agar targetId empty hai to alert.
// Apne aap ko call nahi kar sakte.
// Server ko call type message bhejta hai target user ke liye aur status "calling" set karta hai.

  const handleAccept = async () => {
    if (!incomingFrom) return;
    wsSend({ type: "call-accept", to: incomingFrom });
    setIncomingFrom(null);
    // Caller will send offer → we'll answer in 'offer' handler
  };
// Agar koi incoming call hi nahi hai to kuch nahi karega.
// Server ko call accept ka message bhejta hai aur incomingFrom reset karta hai.
// Yahan comment me likha hai ke offer banane ka kaam caller karega, hum sirf us offer ka answer denge jab milega.

  const handleReject = () => {
    if (!incomingFrom) return;
    wsSend({ type: "call-reject", to: incomingFrom });
    setIncomingFrom(null);
    setStatus("registered");
  };
// Agar call hi nahi aa rahi to kuch nahi karega.
// Server ko reject ka message bhejta hai, incomingFrom clear karta hai, status wapas "registered" pe le aata hai.

  const hangup = () => {
    cleanupPeer();
    setStatus("registered");
    alert("Call ended locally.");
  };
// Peer connection band karta hai, status "registered" pe karta hai, aur alert show karta hai.
  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 900 }}>
      {/* Registration */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="Caller name"
          value={myId}
          onChange={(e) => setMyId(e.target.value)}
          style={{ padding: 8, borderRadius: 8, border: "1px solid #333", background: "#121218", color: "white" }}
        />
        <button
          onClick={handleRegister}
          disabled={!myId || status === "registered" || wsRef.current?.readyState !== WebSocket.OPEN}
          style={{ padding: "8px 12px", borderRadius: 8 }}
        >
          {status === "registered" ? "Registered ✅" : "Register"}
        </button>
        <span style={{ opacity: 0.7 }}>Status: {status}</span>
      </div>
{/* Puri UI ek grid layout me hai, gap 12px aur max width 900px.
Text input jisme apna ID type karoge.
onChange me setMyId update hota hai.
Button jo register karega.
Agar ID empty hai, already registered ho, ya WebSocket open nahi hai → button disable ho jayega.
Status show karta hai. */}

      {/* Dial */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="Calle name"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          style={{ padding: 8, borderRadius: 8, border: "1px solid #333", background: "#121218", color: "white" }}
        />
        <button
          onClick={handleStartCall}
          disabled={status !== "registered" || !targetId}
          style={{ padding: "8px 12px", borderRadius: 8 }}
        >
          Start Call
        </button>
        <button
          onClick={hangup}
          disabled={status !== "in-call"}
          style={{ padding: "8px 12px", borderRadius: 8 }}
        >
          Hang up
        </button>
      </div>
{/* Call karne ka target ID enter karne ke liye input.
Start Call button → sirf tab enabled hoga jab tum registered ho aur targetId likha ho.
Hangup button → sirf in-call state me enabled. */}

      {/* Incoming call modal */}
      {status === "ringing" && incomingFrom && (
        <div style={{ padding: 12, borderRadius: 12, background: "#181820", border: "1px solid #333", display: "flex", gap: 8, alignItems: "center" }}>
          <b>Incoming call from: {incomingFrom}</b>
          <button onClick={handleAccept} style={{ padding: "6px 10px", borderRadius: 8 }}>Accept</button>
          <button onClick={handleReject} style={{ padding: "6px 10px", borderRadius: 8 }}>Reject</button>
        </div>
      )}
{/* Agar status ringing hai aur incomingFrom set hai → ek box show hoga jisme caller ka naam aur Accept/Reject buttons honge. */}

      {/* Videos */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <video ref={localVideoRef} autoPlay muted playsInline style={{ width: 360, background: "#0f0f14", borderRadius: 12 }} />
        <video ref={remoteVideoRef} autoPlay playsInline style={{ width: 360, background: "#0f0f14", borderRadius: 12 }} />
      </div>
{/* Do <video> tags:
Left → local camera/mic ka stream
Right → remote peer ka stream */}

      {/* Logs */}
      <div style={{ fontSize: 12, whiteSpace: "pre-wrap", background: "#0f0f14", borderRadius: 12, padding: 8, border: "1px solid #222", maxHeight: 180, overflow: "auto" }}>
        {logs.slice(-200).map((l, i) => <div key={i} style={{ opacity: 0.8 }}>{l}</div>)}
      </div>
{/* Logs ka box jisme sirf last 200 messages show honge. */}

    </div>
  );
}
