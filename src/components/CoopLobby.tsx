import { useState, useEffect, useRef } from "react";
import Icon from "@/components/ui/icon";

const COOP_URL = "https://functions.poehali.dev/d7956c4f-8709-4a1d-abe4-e6d04544f993";

function getPlayerId(): string {
  let id = localStorage.getItem("bear_player_id");
  if (!id) {
    id = "p_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem("bear_player_id", id);
  }
  return id;
}

interface Props {
  worldId: number;
  worldName: string;
  worldEmoji: string;
  onStart: (code: string, role: "host" | "guest") => void;
  onBack: () => void;
}

export default function CoopLobby({ worldId, worldName, worldEmoji, onStart, onBack }: Props) {
  const [tab, setTab] = useState<"create" | "join">("create");
  const [code, setCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [status, setStatus] = useState<"idle" | "waiting" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [partnerJoined, setPartnerJoined] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerId = getPlayerId();

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const createRoom = async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch(`${COOP_URL}?action=create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ world_id: worldId, world_name: worldName, world_emoji: worldEmoji, player_id: playerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка");
      setCode(data.code);
      setStatus("waiting");
      // Poll for partner
      pollRef.current = setInterval(async () => {
        try {
          const r2 = await fetch(`${COOP_URL}?action=info&code=${data.code}`);
          const d2 = await r2.json();
          if (d2.has_partner) {
            clearInterval(pollRef.current!);
            setPartnerJoined(true);
            setTimeout(() => onStart(data.code, "host"), 1000);
          }
        } catch (_ignored) { /* poll silently */ }
      }, 1500);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Ошибка");
      setStatus("error");
    }
  };

  const joinRoom = async () => {
    if (!joinCode.trim()) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch(`${COOP_URL}?action=join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: joinCode.trim().toUpperCase(), player_id: playerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка");
      setPartnerJoined(true);
      setTimeout(() => onStart(joinCode.trim().toUpperCase(), "guest"), 800);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Ошибка");
      setStatus("error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="card-game mx-4 w-full max-w-sm p-5 animate-bounce-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="font-game text-xl text-amber-900">👥 Кооператив</div>
          <button onClick={onBack} className="text-amber-600 hover:text-amber-900 transition-colors">
            <Icon name="X" size={22} />
          </button>
        </div>

        <div className="panel-sky px-3 py-2 rounded-xl text-center mb-4">
          <span className="font-game text-sm text-blue-900">{worldEmoji} {worldName}</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {(["create", "join"] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setStatus("idle"); setErrorMsg(""); }}
              className={`flex-1 py-2 font-game text-sm rounded-2xl border-2 transition-all ${
                tab === t ? "bg-amber-400 border-amber-600 text-amber-900" : "bg-white border-amber-200 text-amber-700"
              }`}
            >
              {t === "create" ? "🏠 Создать" : "🔑 Войти"}
            </button>
          ))}
        </div>

        {/* Create tab */}
        {tab === "create" && (
          <div className="text-center">
            {status === "idle" || status === "error" ? (
              <>
                <p className="text-sm text-amber-800 mb-4">Создай комнату и пригласи друга по коду</p>
                {errorMsg && <div className="bg-red-100 text-red-700 rounded-xl px-3 py-2 text-sm mb-3">{errorMsg}</div>}
                <button className="btn-game w-full py-3 text-base" onClick={createRoom}>
                  🎮 Создать комнату
                </button>
              </>
            ) : status === "loading" ? (
              <div className="py-6">
                <div className="text-4xl animate-spin-star mb-2">⭐</div>
                <div className="font-game text-amber-900">Создаём комнату...</div>
              </div>
            ) : status === "waiting" ? (
              <div className="py-2">
                {!partnerJoined ? (
                  <>
                    <p className="text-sm text-amber-700 mb-3">Поделись кодом с другом:</p>
                    <div
                      className="panel-wood rounded-2xl py-4 px-6 text-center mb-3 cursor-pointer"
                      onClick={() => navigator.clipboard?.writeText(code)}
                    >
                      <div className="font-game text-4xl text-yellow-300 tracking-widest drop-shadow">{code}</div>
                      <div className="text-xs text-amber-300 mt-1">нажми чтобы скопировать</div>
                    </div>
                    <div className="flex items-center justify-center gap-2 text-amber-700">
                      <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm font-bold">Ждём напарника...</span>
                    </div>
                  </>
                ) : (
                  <div className="py-4">
                    <div className="text-4xl mb-2 animate-bounce">🐻</div>
                    <div className="font-game text-xl text-green-700">Напарник вошёл!</div>
                    <div className="text-sm text-amber-700 mt-1">Запускаем игру...</div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* Join tab */}
        {tab === "join" && (
          <div>
            {partnerJoined ? (
              <div className="text-center py-4">
                <div className="text-4xl mb-2 animate-bounce">🐻</div>
                <div className="font-game text-xl text-green-700">Вошли в комнату!</div>
                <div className="text-sm text-amber-700 mt-1">Запускаем игру...</div>
              </div>
            ) : (
              <>
                <p className="text-sm text-amber-800 mb-3">Введи код комнаты от друга</p>
                {errorMsg && <div className="bg-red-100 text-red-700 rounded-xl px-3 py-2 text-sm mb-3">{errorMsg}</div>}
                <input
                  type="text"
                  maxLength={6}
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ABCDEF"
                  className="w-full text-center font-game text-3xl tracking-widest border-4 border-amber-300 rounded-2xl py-3 px-4 bg-amber-50 text-amber-900 outline-none focus:border-amber-500 mb-4"
                />
                <button
                  className="btn-game w-full py-3 text-base"
                  onClick={joinRoom}
                  disabled={status === "loading"}
                >
                  {status === "loading" ? "⏳ Входим..." : "▶ Войти в игру"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export { getPlayerId };