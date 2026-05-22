import { useState } from "react";
import Icon from "@/components/ui/icon";

type Screen = "home" | "map" | "characters" | "shop" | "achievements";

const HERO_IMG = "https://cdn.poehali.dev/projects/878ebd8a-6602-4291-b3d9-979d8ff7b2e0/files/be857ad3-ce5c-432b-ad56-95015ef96e3f.jpg";
const MAP_IMG = "https://cdn.poehali.dev/projects/878ebd8a-6602-4291-b3d9-979d8ff7b2e0/files/fd1000c6-51bc-44ca-92d6-10045edbfb73.jpg";
const BEAR_IMG = "https://cdn.poehali.dev/projects/878ebd8a-6602-4291-b3d9-979d8ff7b2e0/files/951d4163-a019-4a5e-8424-751976aea783.jpg";

const WORLDS = [
  { id: 1, name: "Лесной мир", emoji: "🌲", levels: 8, stars: 18, color: "from-green-400 to-green-600", locked: false },
  { id: 2, name: "Снежные горы", emoji: "❄️", levels: 8, stars: 12, color: "from-sky-300 to-blue-500", locked: false },
  { id: 3, name: "Пляж Медуз", emoji: "🏖️", levels: 8, stars: 6, color: "from-yellow-300 to-orange-400", locked: false },
  { id: 4, name: "Вулкан", emoji: "🌋", levels: 8, stars: 0, color: "from-red-400 to-red-700", locked: true },
  { id: 5, name: "Тёмный лес", emoji: "🌑", levels: 8, stars: 0, color: "from-purple-600 to-gray-800", locked: true },
  { id: 6, name: "Облачный замок", emoji: "☁️", levels: 8, stars: 0, color: "from-indigo-300 to-purple-400", locked: true },
];

const CHARACTERS = [
  { id: 1, name: "Бирюк", role: "Главный герой", img: BEAR_IMG, ability: "Двойной прыжок", unlocked: true, hp: 5, speed: 4 },
  { id: 2, name: "Арктик", role: "Снежный медведь", img: BEAR_IMG, ability: "Ледяной удар", unlocked: true, hp: 6, speed: 3 },
  { id: 3, name: "Пламя", role: "Огненный медведь", img: BEAR_IMG, ability: "Огненный шар", unlocked: false, hp: 4, speed: 5 },
  { id: 4, name: "Тень", role: "Ниндзя медведь", img: BEAR_IMG, ability: "Невидимость", unlocked: false, hp: 3, speed: 6 },
];

const SHOP_ITEMS = [
  { id: 1, name: "Золотая корона", emoji: "👑", price: 500, type: "hat", owned: false },
  { id: 2, name: "Рыцарский шлем", emoji: "⛑️", price: 300, type: "hat", owned: true },
  { id: 3, name: "Плащ героя", emoji: "🦸", price: 800, type: "outfit", owned: false },
  { id: 4, name: "Ракета x2", emoji: "🚀", price: 150, type: "boost", owned: false },
  { id: 5, name: "Щит 3 удара", emoji: "🛡️", price: 200, type: "boost", owned: false },
  { id: 6, name: "Радужный хвост", emoji: "🌈", price: 1200, type: "special", owned: false },
];

const ACHIEVEMENTS = [
  { id: 1, title: "Первые шаги", desc: "Пройди первый уровень", emoji: "👣", done: true },
  { id: 2, title: "Собиратель звёзд", desc: "Собери 30 звёзд", emoji: "⭐", done: true },
  { id: 3, title: "Грибник", desc: "Собери 100 грибов", emoji: "🍄", done: true },
  { id: 4, title: "Без единого удара", desc: "Пройди уровень без урона", emoji: "🛡️", done: false },
  { id: 5, title: "Скороход", desc: "Пройди уровень за 60 сек", emoji: "⚡", done: false },
  { id: 6, title: "Исследователь", desc: "Открой все миры", emoji: "🗺️", done: false },
  { id: 7, title: "Охотник за боссами", desc: "Победи всех боссов", emoji: "👹", done: false },
  { id: 8, title: "Легенда", desc: "Получи все достижения", emoji: "🏆", done: false },
];

function StarBar({ count, max = 3 }: { count: number; max?: number }) {
  return (
    <div className="flex gap-1 justify-center">
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={`text-lg ${i < count ? "star-icon" : "opacity-30"}`}>⭐</span>
      ))}
    </div>
  );
}

function StatBar({ value, max = 6 }: { value: number; max?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} className={`h-2 flex-1 rounded-full ${i < value ? "bg-amber-400" : "bg-gray-300"}`} />
      ))}
    </div>
  );
}

function HomeScreen({ onNav }: { onNav: (s: Screen) => void }) {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden pb-24">
      {/* Clouds */}
      <div className="cloud absolute pointer-events-none opacity-90" style={{ top: "8%", left: "5%", width: 120, height: 66 }} />
      <div className="cloud absolute pointer-events-none opacity-90" style={{ top: "14%", left: "55%", width: 90, height: 50 }} />
      <div className="cloud absolute pointer-events-none opacity-80" style={{ top: "5%", left: "72%", width: 70, height: 38 }} />

      {/* Logo */}
      <div className="animate-bounce-in text-center mt-6 px-4">
        <div
          className="font-game text-5xl md:text-7xl leading-none mb-1 drop-shadow-lg"
          style={{
            color: "#fff",
            WebkitTextStroke: "3px #2d6b22",
            textShadow: "0 4px 0 #2d6b22, 0 8px 20px rgba(0,0,0,0.3)",
          }}
        >
          SUPER BEAR
        </div>
        <div
          className="font-game text-3xl md:text-5xl drop-shadow-lg"
          style={{
            color: "#f5a623",
            WebkitTextStroke: "2px #7b4a1e",
            textShadow: "0 3px 0 #7b4a1e",
          }}
        >
          ADVENTURE
        </div>
      </div>

      {/* Hero image */}
      <div className="animate-float relative mt-4 mb-4">
        <div
          className="rounded-3xl overflow-hidden shadow-2xl border-4 border-amber-400"
          style={{ width: 280, height: 200, boxShadow: "0 8px 0 #a36010, 0 12px 32px rgba(0,0,0,0.3)" }}
        >
          <img src={HERO_IMG} alt="Super Bear Adventure" className="w-full h-full object-cover" />
        </div>
        <div className="coin-display absolute -top-3 -right-3 px-3 py-1 font-game text-sm text-amber-900 font-bold">
          🪙 1 250
        </div>
      </div>

      {/* Buttons */}
      <div className="flex flex-col gap-3 w-full max-w-xs px-6 animate-slide-up delay-300">
        <button className="btn-game py-4 px-8 text-xl" onClick={() => onNav("map")}>
          🎮 ИГРАТЬ
        </button>
        <div className="grid grid-cols-2 gap-3">
          <button className="btn-game py-3 px-4 text-sm" onClick={() => onNav("characters")}>
            🐻 Персонажи
          </button>
          <button className="btn-game py-3 px-4 text-sm" onClick={() => onNav("shop")}>
            🛒 Магазин
          </button>
        </div>
        <button className="btn-game py-3 px-6 text-base" onClick={() => onNav("achievements")}>
          🏆 Достижения
        </button>
      </div>

      {/* Grass decoration */}
      <div
        className="absolute bottom-16 left-0 right-0 h-16 pointer-events-none"
        style={{ background: "linear-gradient(180deg, transparent 0%, #5cb84a 100%)", borderTop: "4px solid #3a8c2f" }}
      />
      <div className="absolute bottom-14 left-6 text-4xl animate-wiggle">🍄</div>
      <div className="absolute bottom-14 right-8 text-3xl animate-wiggle" style={{ animationDelay: "0.7s" }}>🌸</div>
      <div className="absolute bottom-14 left-1/2 -translate-x-1/2 text-3xl">🌼</div>
    </div>
  );
}

function MapScreen() {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="min-h-screen pb-24">
      <div className="panel-wood mx-4 mt-4 p-3 flex items-center justify-between">
        <span className="font-game text-2xl text-white drop-shadow">🗺️ Карта мира</span>
        <div className="coin-display px-3 py-1 font-game text-sm text-amber-900">🪙 1 250</div>
      </div>

      <div className="mx-4 mt-3 rounded-2xl overflow-hidden border-4 border-amber-400 shadow-xl" style={{ boxShadow: "0 6px 0 #a36010" }}>
        <img src={MAP_IMG} alt="Карта мира" className="w-full object-cover max-h-48" />
      </div>

      <div className="px-4 mt-4 grid grid-cols-2 gap-3">
        {WORLDS.map((world, idx) => (
          <div
            key={world.id}
            className={`card-game p-3 cursor-pointer transition-all duration-200 animate-pop-in ${selected === world.id ? "scale-95" : ""} ${world.locked ? "opacity-60" : ""}`}
            style={{ animationDelay: `${idx * 0.08}s`, opacity: 0, animationFillMode: "forwards" }}
            onClick={() => !world.locked && setSelected(world.id === selected ? null : world.id)}
          >
            <div className={`rounded-xl bg-gradient-to-b ${world.color} flex items-center justify-center h-16 mb-2 text-4xl`}>
              {world.locked ? "🔒" : world.emoji}
            </div>
            <div className="font-game text-sm text-center text-amber-900 mb-1">{world.name}</div>
            <StarBar count={Math.floor(world.stars / 6)} max={3} />
            <div className="text-center text-xs text-amber-700 mt-1 font-bold">{world.stars} / {world.levels * 3} ⭐</div>
          </div>
        ))}
      </div>

      {selected !== null && (
        <div className="mx-4 mt-4 card-game p-4 animate-slide-up">
          {(() => {
            const w = WORLDS.find(x => x.id === selected)!;
            return (
              <>
                <div className="font-game text-xl text-amber-900 mb-2">{w.emoji} {w.name}</div>
                <p className="text-sm text-amber-800 mb-3">8 уровней · Собери все звёзды для разблокировки бонусного уровня!</p>
                <button className="btn-game w-full py-3 text-base">▶ Начать</button>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function CharactersScreen() {
  const [active, setActive] = useState(0);
  const char = CHARACTERS[active];

  return (
    <div className="min-h-screen pb-24">
      <div className="panel-wood mx-4 mt-4 p-3">
        <span className="font-game text-2xl text-white drop-shadow">🐻 Персонажи</span>
      </div>

      <div className="flex gap-3 px-4 mt-4 overflow-x-auto pb-1">
        {CHARACTERS.map((c, i) => (
          <div
            key={c.id}
            onClick={() => setActive(i)}
            className={`flex-shrink-0 cursor-pointer transition-all duration-200 rounded-2xl overflow-hidden border-4 ${active === i ? "border-amber-400 scale-105 shadow-xl" : "border-amber-200"}`}
            style={{ width: 80 }}
          >
            <img src={c.img} alt={c.name} className={`w-full h-20 object-cover ${!c.unlocked ? "grayscale opacity-60" : ""}`} />
            <div className="bg-amber-50 text-center py-1">
              <span className="text-xs font-bold text-amber-900">{c.name}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mx-4 mt-4 card-game p-4 animate-pop-in">
        <div className="flex gap-4">
          <div className="flex-shrink-0">
            <div className="rounded-2xl overflow-hidden border-4 border-amber-300 shadow-lg" style={{ width: 110, height: 110 }}>
              <img src={char.img} alt={char.name} className={`w-full h-full object-cover ${!char.unlocked ? "grayscale" : ""}`} />
            </div>
          </div>
          <div className="flex-1">
            <div className="font-game text-2xl text-amber-900">{char.name}</div>
            <div className="text-sm text-amber-700 mb-2 font-bold">{char.role}</div>
            <div className="panel-sky px-3 py-1 text-sm font-bold text-blue-900 text-center rounded-xl mb-2">
              ✨ {char.ability}
            </div>
            {!char.unlocked && (
              <div className="bg-gray-200 text-gray-600 rounded-xl px-3 py-1 text-xs text-center font-bold">🔒 Заблокирован</div>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="bg-amber-50 rounded-xl p-3">
            <div className="text-xs font-bold text-amber-700 mb-1">❤️ Здоровье</div>
            <StatBar value={char.hp} />
          </div>
          <div className="bg-amber-50 rounded-xl p-3">
            <div className="text-xs font-bold text-amber-700 mb-1">⚡ Скорость</div>
            <StatBar value={char.speed} />
          </div>
        </div>

        {char.unlocked ? (
          <button className="btn-game w-full mt-4 py-3 text-base">✅ Выбрать персонажа</button>
        ) : (
          <button className="btn-game w-full mt-4 py-3 text-base opacity-80">🔓 Разблокировать за 🪙 800</button>
        )}
      </div>
    </div>
  );
}

function ShopScreen() {
  const [tab, setTab] = useState<"all" | "hat" | "outfit" | "boost" | "special">("all");
  const tabs: { key: typeof tab; label: string }[] = [
    { key: "all", label: "Всё" },
    { key: "hat", label: "🎩 Шапки" },
    { key: "boost", label: "⚡ Бусты" },
    { key: "special", label: "✨ Особые" },
  ];
  const items = tab === "all" ? SHOP_ITEMS : SHOP_ITEMS.filter(i => i.type === tab);

  return (
    <div className="min-h-screen pb-24">
      <div className="panel-wood mx-4 mt-4 p-3 flex items-center justify-between">
        <span className="font-game text-2xl text-white drop-shadow">🛒 Магазин</span>
        <div className="coin-display px-3 py-1 font-game text-sm text-amber-900">🪙 1 250</div>
      </div>

      <div className="flex gap-2 px-4 mt-4 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-shrink-0 px-4 py-2 font-game text-sm rounded-2xl border-2 transition-all ${
              tab === t.key
                ? "bg-amber-400 border-amber-600 text-amber-900 shadow-md"
                : "bg-white border-amber-200 text-amber-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 mt-3 grid grid-cols-2 gap-3">
        {items.map((item, idx) => (
          <div
            key={item.id}
            className="card-game p-4 text-center animate-pop-in"
            style={{ animationDelay: `${idx * 0.07}s`, opacity: 0, animationFillMode: "forwards" }}
          >
            <div className="text-5xl mb-2">{item.emoji}</div>
            <div className="font-game text-sm text-amber-900 mb-2">{item.name}</div>
            {item.owned ? (
              <div className="bg-green-100 text-green-700 rounded-xl px-3 py-1 text-xs font-bold border border-green-300">✅ Куплено</div>
            ) : (
              <button className="btn-game w-full py-2 text-xs">🪙 {item.price}</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AchievementsScreen() {
  const done = ACHIEVEMENTS.filter(a => a.done).length;

  return (
    <div className="min-h-screen pb-24">
      <div className="panel-wood mx-4 mt-4 p-3">
        <span className="font-game text-2xl text-white drop-shadow">🏆 Достижения</span>
      </div>

      <div className="mx-4 mt-3 card-game p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-game text-amber-900">Прогресс</span>
          <span className="font-game text-amber-700">{done} / {ACHIEVEMENTS.length}</span>
        </div>
        <div className="bg-amber-100 rounded-full h-4 border-2 border-amber-300 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-1000"
            style={{ width: `${(done / ACHIEVEMENTS.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="px-4 mt-3 flex flex-col gap-2">
        {ACHIEVEMENTS.map((a, idx) => (
          <div
            key={a.id}
            className={`card-game p-3 flex items-center gap-3 animate-slide-up ${!a.done ? "opacity-60" : ""}`}
            style={{ animationDelay: `${idx * 0.06}s`, opacity: 0, animationFillMode: "forwards" }}
          >
            <div className={`w-14 h-14 flex items-center justify-center rounded-2xl text-3xl flex-shrink-0 ${a.done ? "bg-amber-100 border-2 border-amber-300" : "bg-gray-100 border-2 border-gray-200"}`}>
              {a.done ? a.emoji : "❓"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-game text-sm text-amber-900">{a.title}</div>
              <div className="text-xs text-amber-700 truncate">{a.desc}</div>
            </div>
            <div className="flex-shrink-0">
              {a.done ? (
                <div className="bg-green-100 rounded-full p-1">
                  <Icon name="Check" size={18} className="text-green-600" />
                </div>
              ) : (
                <div className="bg-gray-100 rounded-full p-1">
                  <Icon name="Lock" size={18} className="text-gray-400" />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const NAV_ITEMS: { screen: Screen; emoji: string; label: string }[] = [
  { screen: "home", emoji: "🏠", label: "Главная" },
  { screen: "map", emoji: "🗺️", label: "Карта" },
  { screen: "characters", emoji: "🐻", label: "Герои" },
  { screen: "shop", emoji: "🛒", label: "Магазин" },
  { screen: "achievements", emoji: "🏆", label: "Успехи" },
];

export default function Index() {
  const [screen, setScreen] = useState<Screen>("home");

  return (
    <div
      className="min-h-screen"
      style={{
        background: "linear-gradient(180deg, #87d4f5 0%, #b8eeaa 55%, #5cb84a 100%)",
        maxWidth: 480,
        margin: "0 auto",
        position: "relative",
      }}
    >
      <div key={screen}>
        {screen === "home" && <HomeScreen onNav={setScreen} />}
        {screen === "map" && <MapScreen />}
        {screen === "characters" && <CharactersScreen />}
        {screen === "shop" && <ShopScreen />}
        {screen === "achievements" && <AchievementsScreen />}
      </div>

      <nav
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-50"
        style={{
          background: "linear-gradient(180deg, #5cb84a 0%, #3a8c2f 100%)",
          borderTop: "4px solid #2d6b22",
          boxShadow: "0 -2px 16px rgba(0,0,0,0.25)",
        }}
      >
        <div className="flex">
          {NAV_ITEMS.map(item => (
            <button
              key={item.screen}
              onClick={() => setScreen(item.screen)}
              className={`flex-1 py-2 flex flex-col items-center gap-0.5 transition-all duration-150 ${
                screen === item.screen
                  ? "bg-amber-400 border-t-4 border-amber-500"
                  : "border-t-4 border-transparent hover:bg-green-500"
              }`}
            >
              <span className={`text-2xl ${screen === item.screen ? "animate-bounce" : ""}`} style={{ lineHeight: 1 }}>
                {item.emoji}
              </span>
              <span className={`text-[10px] font-bold font-game leading-none ${screen === item.screen ? "text-amber-900" : "text-white"}`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
