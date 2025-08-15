import VideoCall from "./VideoCall";

export default function App() {
  return (
    <div style={{ padding: 16, color: "white", fontFamily: "system-ui", background: "#0b0b0f", minHeight: "100vh" ,width:"200vh" }}>
      <h1 style={{ marginBottom: 8 }}>WebRTC Vite Demo</h1>
      <VideoCall />
    </div>
  );
}
