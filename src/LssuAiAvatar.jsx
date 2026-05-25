import { useState, useRef, useEffect } from "react";
import {
  LiveAvatarSession, SessionEvent, SessionState,
  VoiceChatEvent, AgentEventsEnum,
} from "@heygen/liveavatar-web-sdk";

const QUICK_QUESTIONS = [
  "Why agentic student recruitment?",
  "What is an SDR, BDR, and CSM agent?",
  "How will this help small schools like LSSU?",
  "Will LSSU lose its small-school charm?",
  "Will AI cause job loss at small schools?",
  "What is the future of agentic onboarding and student support?",
];

export default function LSSUAvatarApp() {
  const [sessionState, setSessionState] = useState(SessionState.INACTIVE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [avatars, setAvatars] = useState([]);
  const [voices, setVoices] = useState([]);
  const [selectedAvatarId, setSelectedAvatarId] = useState("");
  const [selectedVoiceId, setSelectedVoiceId] = useState("");
  const [micState, setMicState] = useState("off"); // off | starting | listening | muted
  const [micError, setMicError] = useState("");
  const [userTranscript, setUserTranscript] = useState("");
  const [avatarSpeaking, setAvatarSpeaking] = useState(false);
  const sessionRef = useRef(null);
  const videoRef = useRef(null);

  const startSession = async () => {
    if (sessionRef.current) return;
    setError("");
    setLoading(true);
    try {
      const tokenRes = await fetch("/api/heygen/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "FULL",
          avatar_id: selectedAvatarId || undefined,
          voice_id: selectedVoiceId || undefined,
        }),
      });
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok) {
        const upstreamDetail = Array.isArray(tokenJson?.data)
          ? tokenJson.data.map(d => d.message).filter(Boolean).join("; ")
          : "";
        const msg = tokenJson.hint || upstreamDetail || tokenJson.message || tokenJson.error || `Token request failed (${tokenRes.status})`;
        throw new Error(msg);
      }
      const sessionToken = tokenJson?.data?.session_token;
      if (!sessionToken) throw new Error("No session_token in response");

      const session = new LiveAvatarSession(sessionToken, { voiceChat: false });
      sessionRef.current = session;

      session.on(SessionEvent.SESSION_STATE_CHANGED, setSessionState);
      session.on(SessionEvent.SESSION_STREAM_READY, () => {
        if (videoRef.current) session.attach(videoRef.current);
      });
      session.on(SessionEvent.SESSION_DISCONNECTED, () => {
        sessionRef.current = null;
        setMicState("off");
      });

      session.on(AgentEventsEnum.USER_TRANSCRIPTION, (e) => {
        setUserTranscript(e.text || "");
      });
      session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => setAvatarSpeaking(true));
      session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => setAvatarSpeaking(false));

      session.voiceChat.on(VoiceChatEvent.MUTED, () => setMicState("muted"));
      session.voiceChat.on(VoiceChatEvent.UNMUTED, () => setMicState("listening"));

      await session.start();
    } catch (err) {
      setError(err.message || String(err));
      sessionRef.current = null;
    } finally {
      setLoading(false);
    }
  };

  const stopSession = async () => {
    const session = sessionRef.current;
    if (!session) return;
    try { await session.stop(); } catch { /* ignore */ }
    sessionRef.current = null;
    setSessionState(SessionState.INACTIVE);
  };

  const ask = (text) => {
    const session = sessionRef.current;
    if (!session) return;
    const t = text.trim();
    if (!t) return;
    session.message(t);
  };

  const toggleMic = async () => {
    const session = sessionRef.current;
    if (!session) return;
    setMicError("");
    try {
      if (micState === "off") {
        setMicState("starting");
        await session.voiceChat.start({ defaultMuted: false });
        // UNMUTED event will set state to "listening"
      } else if (micState === "listening") {
        await session.voiceChat.mute();
      } else if (micState === "muted") {
        await session.voiceChat.unmute();
      }
    } catch (err) {
      setMicError(err?.message || "Microphone unavailable");
      setMicState("off");
    }
  };

  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        try { sessionRef.current.stop(); } catch { /* ignore */ }
        sessionRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/heygen/options")
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        setAvatars(data.avatars || []);
        setVoices(data.voices || []);
        const defaultId = data.defaults?.avatar_id;
        setSelectedAvatarId(prev =>
          prev || (defaultId && data.avatars?.some(a => a.id === defaultId) ? defaultId : data.avatars?.[0]?.id || "")
        );
      })
      .catch(() => { /* keep defaults */ });
    return () => { cancelled = true; };
  }, []);

  const isActive = sessionState === SessionState.CONNECTED || sessionState === SessionState.CONNECTING;

  const s = {
    app: {
      fontFamily: "'Crimson Pro', 'Georgia', serif",
      minHeight: "100vh",
      background: "linear-gradient(170deg, #001529 0%, #003366 35%, #004080 65%, #001F3F 100%)",
      color: "#F0F4F8",
      display: "flex", flexDirection: "column",
    },
    header: {
      display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
      padding: "18px 20px 12px",
      borderBottom: "1px solid rgba(255,215,0,0.15)",
      background: "rgba(0,0,0,0.2)",
    },
    logo: {
      width: 44, height: 44, borderRadius: 12,
      background: "linear-gradient(135deg, #FFD700, #FFA500)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Oswald', sans-serif", fontWeight: 800, fontSize: 18, color: "#003366",
    },
    title: {
      fontFamily: "'Oswald', sans-serif", fontSize: 20, fontWeight: 700,
      letterSpacing: 1.5, color: "#FFD700", textTransform: "uppercase", lineHeight: 1.1,
    },
    sub: { fontSize: 11, color: "rgba(255,215,0,0.6)", letterSpacing: 2, textTransform: "uppercase" },
    stage: {
      flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: 24, gap: 20,
    },
    bigBtn: {
      padding: "18px 48px", borderRadius: 999, border: "none",
      background: "linear-gradient(135deg, #FFD700, #FFA500)",
      color: "#003366", fontWeight: 800, fontSize: 18, letterSpacing: 1.5,
      fontFamily: "'Oswald', sans-serif", textTransform: "uppercase",
      cursor: "pointer", boxShadow: "0 0 30px rgba(255,215,0,0.25)",
    },
    video: {
      width: "100%", maxWidth: 720, aspectRatio: "16/9",
      borderRadius: 16, background: "#000",
      boxShadow: "0 0 40px rgba(255,215,0,0.15)",
    },
    endLink: {
      background: "transparent", border: "none",
      color: "rgba(255,255,255,0.45)", fontSize: 12, letterSpacing: 1.5,
      fontFamily: "'Oswald', sans-serif", textTransform: "uppercase",
      cursor: "pointer", marginTop: 4,
    },
    chips: {
      display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8,
      width: "100%", maxWidth: 720,
    },
    chip: {
      padding: "8px 14px", borderRadius: 999,
      border: "1px solid rgba(255,215,0,0.3)",
      background: "rgba(255,215,0,0.08)",
      color: "#FFE4A0", fontSize: 13, lineHeight: 1.3,
      cursor: "pointer", fontFamily: "inherit",
      transition: "background 0.15s, border-color 0.15s",
    },
    micRow: {
      display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
      marginTop: 4,
    },
    micBtn: (state, speaking) => {
      const palette = {
        off:       { bg: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", ring: "rgba(255,255,255,0.2)" },
        starting:  { bg: "rgba(255,215,0,0.2)",    color: "#FFD700",               ring: "rgba(255,215,0,0.4)" },
        listening: { bg: "rgba(0,200,100,0.25)",   color: "#66DDAA",               ring: "rgba(0,200,100,0.5)" },
        muted:     { bg: "rgba(255,100,100,0.2)",  color: "#FF9999",               ring: "rgba(255,100,100,0.4)" },
      }[state];
      return {
        width: 76, height: 76, borderRadius: "50%",
        border: `2px solid ${palette.ring}`,
        background: palette.bg, color: palette.color,
        fontSize: 28, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: speaking
          ? "0 0 0 8px rgba(255,215,0,0.15), 0 0 30px rgba(255,215,0,0.35)"
          : state === "listening" ? `0 0 30px ${palette.ring}` : "none",
        transition: "all 0.2s",
      };
    },
    micLabel: {
      fontFamily: "'Oswald', sans-serif", fontSize: 12, letterSpacing: 1.5,
      textTransform: "uppercase", color: "rgba(255,255,255,0.6)",
    },
    transcript: {
      fontSize: 13, color: "rgba(255,215,0,0.65)", maxWidth: 600,
      textAlign: "center", fontStyle: "italic",
      minHeight: 18,
    },
    pickerWrap: {
      display: "flex", flexDirection: "column", gap: 12,
      width: "100%", maxWidth: 720, alignItems: "center",
    },
    pickerLabel: {
      fontFamily: "'Oswald', sans-serif", fontSize: 11, letterSpacing: 2,
      color: "rgba(255,215,0,0.7)", textTransform: "uppercase",
      marginBottom: 4,
    },
    avatarStrip: {
      display: "flex", gap: 10, overflowX: "auto", padding: "4px 8px 12px",
      width: "100%", scrollbarWidth: "thin",
    },
    avatarThumb: (selected) => ({
      flex: "0 0 auto", width: 88, height: 88, borderRadius: "50%",
      border: `3px solid ${selected ? "#FFD700" : "rgba(255,255,255,0.15)"}`,
      boxShadow: selected ? "0 0 20px rgba(255,215,0,0.4)" : "none",
      cursor: "pointer", overflow: "hidden",
      background: "rgba(0,0,0,0.3)",
      transition: "all 0.15s",
      position: "relative",
    }),
    avatarThumbImg: { width: "100%", height: "100%", objectFit: "cover" },
    avatarName: {
      fontSize: 10, color: "rgba(255,255,255,0.6)",
      textAlign: "center", marginTop: 4, width: 88,
      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      fontFamily: "'Oswald', sans-serif", letterSpacing: 0.5,
    },
    voiceSelect: {
      padding: "10px 14px", borderRadius: 999,
      border: "1px solid rgba(255,215,0,0.3)",
      background: "rgba(0,0,0,0.4)", color: "#FFE4A0",
      fontSize: 14, fontFamily: "inherit", outline: "none",
      cursor: "pointer", minWidth: 280,
    },
  };

  return (
    <div style={s.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;500;600;700&family=Oswald:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input::placeholder { color: rgba(255,255,255,0.35); }
      `}</style>

      <div style={s.header}>
        <div style={s.logo}>LSSU</div>
        <div>
          <div style={s.title}>Laker AI Advisor</div>
          <div style={s.sub}>Agentic Recruitment Intelligence</div>
        </div>
      </div>

      <div style={s.stage}>
        {!isActive ? (
          <>
            <div style={s.pickerWrap}>
              <div style={s.pickerLabel}>Choose your avatar</div>
              <div style={s.avatarStrip}>
                {avatars.map(a => (
                  <div key={a.id} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <button
                      type="button"
                      style={s.avatarThumb(selectedAvatarId === a.id)}
                      onClick={() => setSelectedAvatarId(a.id)}
                      title={a.name}
                    >
                      <img src={a.preview_url} alt={a.name} style={s.avatarThumbImg} />
                    </button>
                    <div style={s.avatarName}>{a.name}</div>
                  </div>
                ))}
              </div>

              {voices.length > 0 && (
                <>
                  <div style={s.pickerLabel}>Choose a voice</div>
                  <select
                    style={s.voiceSelect}
                    value={selectedVoiceId}
                    onChange={e => setSelectedVoiceId(e.target.value)}
                  >
                    <option value="">Default avatar voice</option>
                    {voices.map(v => (
                      <option key={v.id} value={v.id} style={{ background: "#001529" }}>
                        {v.name} {v.gender ? `(${v.gender})` : ""}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>

            <button
              style={{ ...s.bigBtn, opacity: loading ? 0.6 : 1, cursor: loading ? "wait" : "pointer" }}
              onClick={startSession}
              disabled={loading || !selectedAvatarId}
            >
              {loading ? "Connecting…" : "Start Conversation"}
            </button>
            {error && (
              <p style={{ color: "#FF6B6B", fontSize: 13, maxWidth: 480, textAlign: "center" }}>
                {error}
              </p>
            )}
          </>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline style={s.video} />

            <div style={s.micRow}>
              <button
                style={s.micBtn(micState, avatarSpeaking)}
                onClick={toggleMic}
                disabled={sessionState !== SessionState.CONNECTED || micState === "starting"}
                title={
                  micState === "off" ? "Tap to talk" :
                  micState === "listening" ? "Listening — tap to mute" :
                  micState === "muted" ? "Muted — tap to unmute" : "Starting…"
                }
              >
                {micState === "listening" ? "🎙" : micState === "muted" ? "🔇" : "🎤"}
              </button>
              <div style={s.micLabel}>
                {avatarSpeaking ? "Avatar speaking…"
                  : micState === "off" ? "Tap mic to talk"
                  : micState === "starting" ? "Starting mic…"
                  : micState === "listening" ? "Listening to you"
                  : "Muted"}
              </div>
              {micError && (
                <div style={{ color: "#FF6B6B", fontSize: 12 }}>{micError}</div>
              )}
            </div>

            <div style={s.transcript}>
              {userTranscript ? `You: "${userTranscript}"` : ""}
            </div>

            <div style={s.chips}>
              {QUICK_QUESTIONS.map(q => (
                <button
                  key={q}
                  style={s.chip}
                  onClick={() => ask(q)}
                  disabled={sessionState !== SessionState.CONNECTED}
                >
                  {q}
                </button>
              ))}
            </div>
            <button style={s.endLink} onClick={stopSession}>End</button>
          </>
        )}
      </div>
    </div>
  );
}
