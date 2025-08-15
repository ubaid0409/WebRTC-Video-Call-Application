WebRTC Video Call Application - Documentation
This document explains the working of the WebRTC Video Call application using a WebSocket-based signaling server and a React-based client interface. The goal is to enable peer-to-peer (P2P) audio/video calls between two clients via WebRTC, while using WebSockets for signaling (exchanging call setup data).

1. High-Level Workflow
. Both Caller and Callee connect to the WebSocket signaling server.
. Each client registers with a unique userId.
. Caller sends a 'call' request to the Callee.
. Callee can 'accept' or 'reject' the call.
. On acceptance, WebRTC peer connections are established:   - Caller sends an SDP Offer.   - Callee sends an SDP Answer.
. Both exchange ICE candidates to complete the connection.
. Audio/Video streams flow directly between peers.

2. Signaling Server (server.js)
The signaling server uses the 'ws' (WebSocket) library in Node.js.
- Listens on host 0.0.0.0 and port 8080.
- Maintains a Map of connected clients: userId → WebSocket.
- Handles message types:  
• register – Register a user with userId.  
• call – Notify callee of an incoming call. 
• call-accept / call-reject – Forward call responses. 
• offer / answer / ice – Forward WebRTC session descriptions and ICE candidates.
- Cleans up on client disconnect.

3. React Client (VideoCall.jsx)
The React client provides the UI and manages WebRTC connections:
- States: myId, targetId, status, incomingFrom, logs.
- Refs: localVideoRef, remoteVideoRef, wsRef, pcRef, localStreamRef, remoteStreamRef.
- useEffect: Establishes WebSocket connection and sets up event listeners.
- WebSocket message handling: 
• registered – Confirms registration. 
• incoming-call – Shows ringing UI. 
• call-failed – Alerts user. 
• call-accept – Caller sets up local media, creates PeerConnection, sends offer. 
• offer – Callee sets remote description, creates answer, sends it. 
• answer – Caller sets remote description. 
• ice – Adds received ICE candidate.
- Media functions: 
• enumerateHasDevices – Checks for camera/mic.  
• maybeGetLocalMediaOrReceiveOnly – Gets user media or switches to receive-only mode.
- Peer connection: 
• Uses Google's STUN server.  
• Adds local tracks, listens for remote tracks.
• Sends ICE candidates via WebSocket.
- UI Actions: 
• handleRegister – Sends register message. 
• handleStartCall – Sends call request. 
• handleAccept – Accepts incoming call.  
• handleReject – Rejects call.  
• hangup – Closes PeerConnection.

4. Call Flow Summary
. User A registers with userId 'a'.
. User B registers with userId 'b'.
. User A clicks 'Start Call' to 'b'.
. Server forwards 'incoming-call' to B.
. B clicks 'Accept' → Server sends 'call-accept' to A.
. A gets media, creates offer, sends to B.
. B sets remote description, creates answer, sends to A.
. Both exchange ICE candidates.
. Media flows directly between A and B.

5. Technical Notes
- WebSocket is only used for signaling, not for media transfer.
- WebRTC handles direct peer-to-peer streaming.
- STUN server helps discover public IP and NAT traversal.
- For real-world usage, TURN servers are recommended for NAT/firewall traversal.
- HTTPS is required for getUserMedia on most browsers unless using localhost.
