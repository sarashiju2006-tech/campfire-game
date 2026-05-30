// ─────────────────────────────────────────────────────────────
//  CampfireGame.jsx  ─  src/scenes/campfire/CampfireGame.jsx
//
//  Nighttime central lawns minigame.
//  3-night progression: tutorial → survival → scattered sticks
//
//  Props:
//    onEnd() – called when the scene is done (win cutscene dismiss)
//
//  Wire up in App.jsx:
//    import CampfireGame from "./scenes/campfire/CampfireGame";
//    {scene === "campfire" && <CampfireGame onEnd={() => setScene("...")} />}
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback } from "react";

// ── Asset imports ─────────────────────────────────────────────
import bgSrc from "../../assets/backgrounds/fire_background.png";

import daiwikFireSrc from "../../assets/characters/daiwik_fire.png";
import daiwikFrontSrc from "../../assets/characters/daiwik_fire_front.png";
import fire0 from "../../assets/sprites/fire_0.png";
import fire1 from "../../assets/sprites/fire_1.png";
import fire2 from "../../assets/sprites/fire_2.png";
import fire3 from "../../assets/sprites/fire_3.png";
import fire4 from "../../assets/sprites/fire_4.png";
import stickPileSrc from "../../assets/sprites/stick_pile.png";
import stickSrc from "../../assets/sprites/stick.png";

const FIRE_SPRITES = [fire0, fire1, fire2, fire3, fire4];

// ─────────────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────────────
const GAME_W        = 800;
const GAME_H        = 400;
const PLAYER_SIZE   = 200;
const FIRE_SIZE     = 150;
const INTERACT_DIST = 56;
const WARN_MS       = 5500;
const PLAYER_SPEED  = 3.2;

// Fire starting positions as fractions of arena
const FIRE_LAYOUT = [
  { id: 0, xPct: 0.16, yPct: 0.65 },
  { id: 1, xPct: 0.84, yPct: 0.65 },
  { id: 2, xPct: 0.50, yPct: 0.93 },
];

const STICK_POS = { x: GAME_W * 0.450, y: GAME_H * 0.50 };

const BASE_DECAY_MS = [0, 13000, 10500, 8500, 7500];
const DIFFICULTY_RAMP = 0.026;

// ─────────────────────────────────────────────────────────────
//  [NEW] NIGHT CONFIGURATION
//  All per-night tuning lives here — no logic duplication needed.
// ─────────────────────────────────────────────────────────────
const NIGHT_CONFIG = {
  1: {
    duration:        45,
    // Easy: fires start at level 4 and decay very slowly
    decayMultiplier: 1.0,   // multiplies BASE_DECAY_MS → slower decay
    difficultyRamp:  0.003, // almost no ramp
    scatteredSticks: false,
  },
  2: {
    duration:        90,
    decayMultiplier: 0.8,   // original difficulty
    difficultyRamp:  DIFFICULTY_RAMP,
    scatteredSticks: false,
  },
  3: {
    duration:        90,
    decayMultiplier: 1.0,
    difficultyRamp:  DIFFICULTY_RAMP,
    scatteredSticks: true,  // [NEW] replaces central pile with roaming sticks
  },
};

// [NEW] Candidate positions for scattered sticks (Night 3)
// Chosen to avoid fire/player spawn overlap and encourage movement.
const SCATTER_POSITIONS = [
  { x: GAME_W * 0.10, y: GAME_H * 0.38 },
  { x: GAME_W * 0.90, y: GAME_H * 0.38 },

  { x: GAME_W * 0.25, y: GAME_H * 0.50 },
  { x: GAME_W * 0.75, y: GAME_H * 0.50 },

  { x: GAME_W * 0.15, y: GAME_H * 0.65 },
  { x: GAME_W * 0.85, y: GAME_H * 0.65 },

  { x: GAME_W * 0.35, y: GAME_H * 0.82 },
  { x: GAME_W * 0.65, y: GAME_H * 0.82 },
];

// How long (ms) before a consumed stick respawns (Night 3)
const STICK_RESPAWN_MS = 3500;

// ─────────────────────────────────────────────────────────────
//  STYLES  (unchanged from original)
// ─────────────────────────────────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323:wght@400&display=swap');

  .cf-root {
    position: relative;
    width: 100vw; height: 100vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #06030f;
    image-rendering: pixelated;
  }

  .cf-bg {
    position: absolute;
    inset: 0;
    width: 100%; height: 100%;
    object-fit: cover;
    object-position: center;
    opacity: 0.65;
    z-index: 0;
  }

  .cf-vignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(
      ellipse 72% 60% at 50% 44%,
      transparent 25%,
      rgba(4,2,12,0.78) 100%
    );
    z-index: 1;
    pointer-events: none;
  }

  .cf-hud {
    position: absolute;
    top: -10; left: 0; right: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2px 20px;
    z-index: 30;
    pointer-events: none;
    background: linear-gradient(180deg, rgba(0,0,0,0.55) 0%, transparent 100%);
  }

  .cf-timer {
    font-family: 'Press Start 2P', monospace;
    font-size: clamp(10px, 1.8vw, 14px);
    color: #ffd080;
    text-shadow: 0 0 10px rgba(255,180,50,0.7), 1px 1px 0 #000;
    letter-spacing: 0.1em;
  }
  .cf-timer.urgent {
    color: #ff5050;
    animation: cf-urgentBlink 0.55s step-end infinite;
  }
  @keyframes cf-urgentBlink {
    0%,100% { opacity: 1; }
    50%     { opacity: 0.3; }
  }

  .cf-carry {
    font-family: 'Press Start 2P', monospace;
    font-size: clamp(7px, 1.2vw, 10px);
    color: #a0e880;
    text-shadow: 0 0 6px rgba(120,230,60,0.5), 1px 1px 0 #000;
    letter-spacing: 0.05em;
  }
  .cf-carry.empty { color: #504858; }

  .cf-arena {
    position: relative;
    width: ${GAME_W}px;
    height: ${GAME_H}px;
    z-index: 10;
    flex-shrink: 0;
  }

  .cf-sticks {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 96x;
  height: 72px;

  background: transparent;
  border: none;
  box-shadow: none;

  display: flex;
  align-items: center;
  justify-content: center;

  z-index: 11;
}
  .cf-sticks.near {
    box-shadow:
      0 0 0 2px #301808,
      0 0 0 4 px rgba(200,230,80,0.65),
      2px 2px 0 #200f04;
  }

  /* [NEW] Scattered stick: same look as central pile but slightly smaller */
  .cf-stick-scatter {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 80px;
  height: 60px;

  background: transparent;
  border: none;
  box-shadow: none;

  display: flex;
  align-items: center;
  justify-content: center;

  z-index: 11;
}
  .cf-stick-scatter.near {
    box-shadow:
      0 0 0 2px #301808,
      0 0 0 7px rgba(200,230,80,0.65),
      2px 2px 0 #200f04;
  }

  .cf-fire-wrap {
    position: absolute;
    transform: translate(-50%, -50%);
    width: ${FIRE_SIZE}px;
    height: ${FIRE_SIZE}px;
    z-index: 11;
  }

  .cf-fire-img {
    width: 100%; height: 100%;
    image-rendering: pixelated;
    display: block;
    transition: filter 0.35s ease;
  }
  .cf-fire-img.dead   { opacity: 0.28; filter: grayscale(0.9) brightness(0.5); }
  .cf-fire-img.warn   { animation: cf-warnFlicker 0.5s ease-in-out infinite alternate; }
  .cf-fire-img.win-glow {
    filter: drop-shadow(0 0 22px rgba(255,210,60,1))
            drop-shadow(0 0 55px rgba(255,110,20,0.8)) !important;
    animation: cf-winFirePulse 0.9s ease-in-out infinite alternate !important;
  }
  @keyframes cf-warnFlicker {
    from { filter: drop-shadow(0 0 6px rgba(255,50,10,0.6)) brightness(0.9); }
    to   { filter: drop-shadow(0 0 20px rgba(255,50,10,1))  brightness(1.1); }
  }
  @keyframes cf-winFirePulse {
    from { transform: scale(1); }
    to   { transform: scale(1.1); }
  }

  .cf-warn-icon {
    position: absolute;
    top: -20px; left: 50%;
    transform: translateX(-50%);
    font-family: 'Press Start 2P', monospace;
    font-size: 10px;
    color: #ff3010;
    text-shadow: 0 0 6px rgba(255,50,10,0.9), 1px 1px 0 #000;
    animation: cf-warnBob 0.45s ease-in-out infinite alternate;
    pointer-events: none;
  }
  @keyframes cf-warnBob {
    from { transform: translateX(-50%) translateY(0); }
    to   { transform: translateX(-50%) translateY(-5px); }
  }

  .cf-hint {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    font-family: 'VT323', monospace;
    font-size: 15px;
    color: #c8f070;
    text-shadow: 1px 1px 0 #000;
    white-space: nowrap;
    pointer-events: none;
    z-index: 20;
    animation: cf-hintBob 0.55s ease-in-out infinite alternate;
  }
  @keyframes cf-hintBob {
    from { transform: translateX(-50%) translateY(0); }
    to   { transform: translateX(-50%) translateY(-4px); }
  }

  .cf-player {
    position: absolute;
    transform: translate(-50%, -50%);
    width: ${PLAYER_SIZE}px;
    height: ${PLAYER_SIZE}px;
    image-rendering: pixelated;
    z-index: 15;
  }
  .cf-player.flipped {
    transform: translate(-50%, -50%) scaleX(-1);
  }

  .cf-win-overlay {
    position: absolute;
    inset: 0;
    background: rgba(255,160,40,0.14);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 22px;
    z-index: 50;
    animation: cf-overlayFade 0.7s ease both;
  }

  .cf-lose-overlay {
    position: absolute;
    inset: 0;
    background: rgba(6,3,18,0.76);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 24px;
    z-index: 50;
    animation: cf-overlayFade 0.55s ease both;
  }

  /* [NEW] Transition screen between nights — same dark atmosphere */
  .cf-transition-overlay {
    position: absolute;
    inset: 0;
    background: rgba(6,3,18,0.88);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
    z-index: 50;
    animation: cf-overlayFade 0.7s ease both;
  }

  /* [NEW] Night 3 pre-night briefing — uses same transition overlay style */
  .cf-briefing-overlay {
    position: absolute;
    inset: 0;
    background: rgba(6,3,18,0.90);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
    z-index: 50;
    animation: cf-overlayFade 0.7s ease both;
  }

  @keyframes cf-overlayFade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .cf-win-title {
    font-family: 'Press Start 2P', monospace;
    font-size: clamp(12px, 2.2vw, 18px);
    color: #ffd070;
    text-shadow: 0 0 18px rgba(255,180,50,0.9), 2px 2px 0 #000;
    letter-spacing: 0.08em;
    text-align: center;
    line-height: 1.7;
  }
    .cf-stick-img {
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  object-fit: contain;
  display: block;
}
    .cf-stick-pile-img {
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  object-fit: contain;
  display: block;
}
  .cf-win-sub {
    font-family: 'VT323', monospace;
    font-size: clamp(17px, 2.6vw, 26px);
    color: #ffe8a0;
    text-shadow: 1px 1px 0 #000;
    letter-spacing: 0.06em;
    opacity: 0.78;
  }

  .cf-lose-title {
    font-family: 'Press Start 2P', monospace;
    font-size: clamp(11px, 2vw, 17px);
    color: #7878c8;
    text-shadow: 0 0 14px rgba(100,80,220,0.55), 1px 1px 0 #000;
    letter-spacing: 0.07em;
    text-align: center;
    line-height: 1.8;
  }

  /* [NEW] Transition / briefing title styling */
  .cf-night-title {
    font-family: 'Press Start 2P', monospace;
    font-size: clamp(11px, 2vw, 16px);
    color: #ffd070;
    text-shadow: 0 0 14px rgba(255,180,50,0.8), 2px 2px 0 #000;
    letter-spacing: 0.1em;
    text-align: center;
    line-height: 1.8;
  }
  .cf-night-sub {
    font-family: 'VT323', monospace;
    font-size: clamp(18px, 2.8vw, 28px);
    color: #d8c8a0;
    text-shadow: 1px 1px 0 #000;
    letter-spacing: 0.05em;
    text-align: center;
    line-height: 1.5;
    max-width: 480px;
    opacity: 0.85;
    /* preserve \n line breaks */
    white-space: pre-line;
  }

  /* [NEW] Night indicator in HUD */
  .cf-night-label {
    font-family: 'Press Start 2P', monospace;
    font-size: clamp(7px, 1.1vw, 9px);
    color: #b090e0;
    text-shadow: 0 0 6px rgba(160,100,230,0.5), 1px 1px 0 #000;
    letter-spacing: 0.08em;
  }

  .cf-btn {
    font-family: 'Press Start 2P', monospace;
    font-size: clamp(8px, 1.3vw, 11px);
    letter-spacing: 0.08em;
    color: #1a0f08;
    background: linear-gradient(180deg, #ffd080 0%, #ffb040 50%, #ff9020 100%);
    border: none;
    outline: none;
    padding: 12px 30px;
    cursor: pointer;
    image-rendering: pixelated;
    box-shadow:
      0 -2px 0 0 #ffe8a0,
      -2px 0 0 0 #ffd888,
      2px 0 0 0 #b85010,
      0 2px 0 0 #b85010,
      0 0 0 2px #d87020,
      3px 4px 0 1px rgba(80,30,0,0.3);
    transition: transform 0.08s, filter 0.08s;
  }
  .cf-btn:hover  { transform: translateY(-2px); filter: brightness(1.08); }
  .cf-btn:active { transform: translateY(1px);  filter: brightness(0.95); }

  .cf-controls {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    font-family: 'VT323', monospace;
    font-size: clamp(12px, 1.6vw, 16px);
    color: rgba(200,180,160,0.5);
    letter-spacing: 0.06em;
    white-space: nowrap;
    z-index: 30;
    pointer-events: none;
  }
`;

// ─────────────────────────────────────────────────────────────
//  HELPERS  (unchanged)
// ─────────────────────────────────────────────────────────────
const dist = (ax, ay, bx, by) =>
  Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);

const fmt = (sec) => {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

const FIRE_PERSONALITIES = [0.7, 1.8, 1.0];

// [CHANGED] makeFires now accepts a decayMultiplier so Night 1 can be easier.
const makeFires = (decayMultiplier = 1.0) =>
  FIRE_LAYOUT.map((f, i) => ({
    id: f.id,
    x: f.xPct * GAME_W,
    y: f.yPct * GAME_H,
    level: 4,
    decayMultiplier: FIRE_PERSONALITIES[i],
    decayTimer:
      (BASE_DECAY_MS[4] + i * 2200) *
      FIRE_PERSONALITIES[i] *
      decayMultiplier,  // [NEW] apply night-level multiplier
  }));

// ─────────────────────────────────────────────────────────────
//  [NEW] makeScatteredSticks — initial set for Night 3
//  Returns 3 sticks drawn from random positions in SCATTER_POSITIONS.
// ─────────────────────────────────────────────────────────────
let _stickIdCounter = 0;
const makeScatteredSticks = (count = 3) => {
  const shuffled = [...SCATTER_POSITIONS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map(pos => ({
    id: ++_stickIdCounter,
    x: pos.x,
    y: pos.y,
    visible: true,
  }));
};

// ─────────────────────────────────────────────────────────────
//  INNER GAME — accepts `nightConfig` prop instead of hard-coding
// ─────────────────────────────────────────────────────────────
// [CHANGED] Added `nightConfig` and `nightNumber` props.
function GameCore({ onWin, onLose, nightConfig, nightNumber }) {
  const {
    duration,
    decayMultiplier,
    difficultyRamp,
    scatteredSticks,
  } = nightConfig;

  const keysRef      = useRef({});
  const playerRef    = useRef({
    x: GAME_W * 0.5,
    y: GAME_H * 0.7,
    facingLeft: false,
    direction: "front",
  });
  const windTimerRef = useRef(0);
  // [CHANGED] Pass decayMultiplier into makeFires
  const firesRef     = useRef(makeFires(decayMultiplier));
  const carryRef     = useRef(false);
  const timeRef      = useRef(duration);          // [CHANGED] use config duration
  const lastTsRef    = useRef(null);
  const rafRef       = useRef(null);
  const aliveRef     = useRef(true);

  // [NEW] For scattered sticks: ref holds the live array, state drives render
  const scatteredRef = useRef(scatteredSticks ? makeScatteredSticks(3) : []);
  // [NEW] Which scattered stick ID the player is near (null if none or central pile mode)
  const nearScatterIdRef = useRef(null);

  const [fires,         setFires]         = useState(() => makeFires(decayMultiplier));
  const [player,        setPlayer]        = useState({
    x: GAME_W * 0.5,
    y: GAME_H * 0.5,
    facingLeft: false,
    direction: "front",
  });
  const [carrying,      setCarrying]      = useState(false);
  const [timeLeft,      setTimeLeft]      = useState(duration);
  const [nearStick,     setNearStick]     = useState(false);
  const [nearFireId,    setNearFireId]    = useState(null);
  const [windFireId,    setWindFireId]    = useState(null);
  // [NEW] Scattered stick render state
  const [scatteredList, setScatteredList] = useState(
    scatteredSticks ? makeScatteredSticks(3) : []
  );
  const [nearScatterId, setNearScatterId] = useState(null);

  useEffect(() => {
    // Sync ref with initial state for scattered mode
    if (scatteredSticks) {
      scatteredRef.current = scatteredList;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Game loop ─────────────────────────────────────────────
  useEffect(() => {
    aliveRef.current = true;

    // ── Interact handler — works for both central pile and scattered sticks ──
    const interact = () => {
      const { x, y } = playerRef.current;

      if (!carryRef.current) {
        if (!scatteredSticks) {
          // Original central pile behaviour
          if (dist(x, y, STICK_POS.x, STICK_POS.y) < INTERACT_DIST) {
            carryRef.current = true;
            if (aliveRef.current) setCarrying(true);
          }
        } else {
          // [NEW] Scattered: pick up whichever visible stick we're near
          let bestId = null, bestD = Infinity;
          for (const s of scatteredRef.current) {
            if (!s.visible) continue;
            const d = dist(x, y, s.x, s.y);
            if (d < INTERACT_DIST && d < bestD) { bestId = s.id; bestD = d; }
          }
          if (bestId !== null) {
            // Mark it invisible immediately
            scatteredRef.current = scatteredRef.current.map(s =>
              s.id === bestId ? { ...s, visible: false } : s
            );
            carryRef.current = true;
            if (aliveRef.current) {
              setCarrying(true);
              setScatteredList([...scatteredRef.current]);
            }

            // [NEW] Schedule respawn after STICK_RESPAWN_MS at a random position
            setTimeout(() => {
              if (!aliveRef.current) return;
              const occupied = scatteredRef.current
                .filter(s => s.visible)
                .map(s => ({ x: s.x, y: s.y }));
              const candidates = SCATTER_POSITIONS.filter(p =>
                !occupied.some(o => Math.abs(o.x - p.x) < 10)
              );
              const pos = candidates.length
                ? candidates[Math.floor(Math.random() * candidates.length)]
                : SCATTER_POSITIONS[Math.floor(Math.random() * SCATTER_POSITIONS.length)];

              scatteredRef.current = scatteredRef.current.map(s =>
                s.id === bestId
                  ? { ...s, x: pos.x, y: pos.y, visible: true }
                  : s
              );
              if (aliveRef.current) setScatteredList([...scatteredRef.current]);
            }, STICK_RESPAWN_MS);
          }
        }
        return;
      }

      // Carrying → try to feed a nearby fire (unchanged logic)
      let bestId = null, bestD = Infinity;
      for (const f of firesRef.current) {
        if (f.level === 0) continue;
        const d = dist(x, y, f.x, f.y);
        if (d < INTERACT_DIST && d < bestD) { bestId = f.id; bestD = d; }
      }

      if (bestId !== null) {
        firesRef.current = firesRef.current.map(f => {
          if (f.id !== bestId) return f;
          const nl = Math.min(4, f.level + 1);
          const refillMultiplier = 0.8 + Math.random() * 0.5;
          return {
            ...f,
            level: nl,
            decayTimer:
              BASE_DECAY_MS[nl] *
              refillMultiplier *
              f.decayMultiplier *
              decayMultiplier,   // [CHANGED] also honour night-level multiplier on refill
          };
        });

        carryRef.current = false;
        if (aliveRef.current) {
          setCarrying(false);
          setFires([...firesRef.current]);
        }
      }
    };

    const onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (
        ["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"," "].includes(k)
        || e.code === "Space"
      ) {
        e.preventDefault();
      }
      keysRef.current[k] = true;
      if (e.code === "Space") interact();
    };
    const onKeyUp = (e) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup",   onKeyUp);

    const tick = (ts) => {
      if (!aliveRef.current) return;

      const dt = lastTsRef.current
        ? Math.min(ts - lastTsRef.current, 50)
        : 16;
      lastTsRef.current = ts;

      // ── Movement (unchanged) ──
      const keys = keysRef.current;
      let { x, y, facingLeft } = playerRef.current;
      let direction = playerRef.current.direction;

      if (keys["a"] || keys["arrowleft"])  { x -= PLAYER_SPEED; facingLeft = true;  direction = "side"; }
      if (keys["d"] || keys["arrowright"]) { x += PLAYER_SPEED; facingLeft = false; direction = "side"; }
      if (keys["w"] || keys["arrowup"])    { y -= PLAYER_SPEED; direction = "front"; }
      if (keys["s"] || keys["arrowdown"])  { y += PLAYER_SPEED; direction = "front"; }

      const FIELD_TOP = 140;

x = Math.max(0, Math.min(GAME_W, x));
y = Math.max(FIELD_TOP, Math.min(GAME_H, y));
      playerRef.current = { x, y, facingLeft, direction };

      // ── Difficulty (unchanged, uses per-night difficultyRamp) ──
      const elapsed    = duration - timeRef.current;   // [CHANGED] use config duration
      const difficulty = Math.max(0.45, 1 - elapsed * difficultyRamp); // [CHANGED]
      windTimerRef.current -= dt;
      if (windTimerRef.current <= 0) {
        windTimerRef.current = 15000 + Math.random() * 15000;
        const livingFires = firesRef.current.filter(f => f.level > 0);
        if (livingFires.length > 0) {
          const victim = livingFires[Math.floor(Math.random() * livingFires.length)];
          setWindFireId(victim.id);
          setTimeout(() => { setWindFireId(null); }, 1200);
          firesRef.current = firesRef.current.map(f =>
            f.id !== victim.id ? f : { ...f, decayTimer: Math.max(1000, f.decayTimer - 2500) }
          );
        }
      }

      // ── Fire decay (unchanged) ──
      let dead = false;
      const updated = firesRef.current.map(f => {
        if (f.level === 0) return f;
        const nt = f.decayTimer - dt;
        if (nt <= 0) {
          const nl = f.level - 1;
          if (nl === 0) dead = true;
          return {
            ...f,
            level: nl,
            decayTimer: nl > 0
              ? BASE_DECAY_MS[nl] * difficulty * f.decayMultiplier * decayMultiplier
              : 0,
          };
        }
        return { ...f, decayTimer: nt };
      });
      firesRef.current = updated;

      if (dead) { onLose(); return; }

      // ── Timer ──
      timeRef.current = Math.max(0, timeRef.current - dt / 1000);
      if (timeRef.current <= 0) {
        firesRef.current = firesRef.current.map(f => ({ ...f, level: 4 }));
        if (aliveRef.current) setFires([...firesRef.current]);
        onWin();
        return;
      }

      // ── Proximity (central pile or scattered) ──
      const ns = !scatteredSticks &&
        dist(x, y, STICK_POS.x, STICK_POS.y) < INTERACT_DIST;

      // [NEW] Find nearest visible scattered stick within range
      let nsid = null, nsd = Infinity;
      if (scatteredSticks) {
        for (const s of scatteredRef.current) {
          if (!s.visible) continue;
          const d = dist(x, y, s.x, s.y);
          if (d < INTERACT_DIST && d < nsd) { nsid = s.id; nsd = d; }
        }
      }
      nearScatterIdRef.current = nsid;

      let nf = null, nfd = Infinity;
      for (const f of updated) {
        if (f.level === 0) continue;
        const d = dist(x, y, f.x, f.y);
        if (d < INTERACT_DIST && d < nfd) { nf = f.id; nfd = d; }
      }

      // ── Sync React state ──
      if (aliveRef.current) {
        setPlayer({ x, y, facingLeft, direction });
        setFires([...updated]);
        setTimeLeft(timeRef.current);
        setNearStick(ns);
        setNearFireId(nf);
        setNearScatterId(nsid);  // [NEW]
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      aliveRef.current = false;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup",   onKeyUp);
    };
  }, [onWin, onLose, duration, decayMultiplier, difficultyRamp, scatteredSticks]);

  const playerSprite = player.direction === "front" ? daiwikFrontSrc : daiwikFireSrc;

  return (
    <div className="cf-arena">

      {/* HUD */}
      <div style={{
        position: "absolute", top: -95, left: 0, right: 0,
        display: "flex", justifyContent: "space-between",
        alignItems: "center", pointerEvents: "none",
      }}>
        {/* [NEW] Night label on the left alongside timer */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div className="cf-night-label">NIGHT {nightNumber} / 3</div>
          <div className={`cf-timer${timeLeft < 30 ? " urgent" : ""}`}>
            ⏱ {fmt(timeLeft)}
          </div>
        </div>
        <div className={`cf-carry${carrying ? "" : " empty"}`}>
          {carrying ? "🪵 carrying stick" : "[ empty hands ]"}
        </div>
      </div>

      {/* Central stick pile — only in non-scattered nights */}
      {!scatteredSticks && (
        <>
          <div
  className={`cf-sticks ${nearStick ? "near" : ""}`}
  style={{
    left: STICK_POS.x,
    top: STICK_POS.y,
  }}
>
  <img
    src={stickPileSrc}
    alt=""
    className="cf-stick-pile-img"
  />
</div>
          {nearStick && !carrying && (
            <div
              className="cf-hint"
              style={{ position: "absolute", left: STICK_POS.x, top: STICK_POS.y - 12 }}
            >
              [SPACE] pick up
            </div>
          )}
        </>
      )}

      {/* [NEW] Scattered sticks — only in Night 3 */}
      {scatteredSticks && scatteredList.map(s => {
        if (!s.visible) return null;
        const isNear = nearScatterId === s.id && !carrying;
        return (
          <div key={s.id}>
            <div
  key={s.id}
  className={`cf-stick-scatter ${
    nearScatterId === s.id ? "near" : ""
  }`}
  style={{
    left: s.x,
    top: s.y,
  }}
>
  <img
    src={stickSrc}
    alt=""
    className="cf-stick-img"
  />
</div>
            {isNear && (
              <div
                className="cf-hint"
                style={{ position: "absolute", left: s.x, top: s.y - 12 }}
              >
                [SPACE] pick up
              </div>
            )}
          </div>
        );
      })}

      {/* Fires (unchanged) */}
      {fires.map(f => {
        const warn  = f.level > 0 && f.decayTimer < WARN_MS;
        const nearF = nearFireId === f.id && carrying;
        const dead  = f.level === 0;
        let imgCls  = "cf-fire-img";
        if (dead)       imgCls += " dead";
        else if (warn)  imgCls += " warn";

        return (
          <div key={f.id} className="cf-fire-wrap" style={{ left: f.x, top: f.y }}>
            <img src={FIRE_SPRITES[f.level]} alt="" className={imgCls} />
            {warn && !dead && <div className="cf-warn-icon">!</div>}
            {windFireId === f.id && <div className="cf-warn-icon">💨</div>}
            {nearF && !dead && <div className="cf-hint">[SPACE] feed</div>}
          </div>
        );
      })}

      {/* Player (unchanged) */}
      <img
        src={playerSprite}
        alt="player"
        className={`cf-player${player.facingLeft ? " flipped" : ""}`}
        style={{ left: player.x, top: player.y }}
      />

      {/* Controls legend */}
      <div className="cf-controls" style={{ position: "absolute", bottom: -28, left: "50%", transform: "translateX(-50%)" }}>
        WASD / arrows — move  ·  SPACE — interact
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  OUTER SHELL — handles night progression + win/lose/retry
// ─────────────────────────────────────────────────────────────
export default function CampfireGame() {
  // [CHANGED] phase now includes night transition and briefing states:
  //   "playing" | "night-complete" | "night3-brief" | "win" | "lose"
  const [phase,   setPhase]   = useState("instructions");
  const [night,   setNight]   = useState(1);         // [NEW] current night (1–3)
  const [gameKey, setGameKey] = useState(0);

  const handleWin = useCallback(() => {
    if (night < 3) {
      // [NEW] Between nights: show transition screen instead of final win
      setPhase("night-complete");
    } else {
      // Night 3 complete → final win screen
      setPhase("win");
    }
  }, [night]);

  const handleLose = useCallback(() => setPhase("lose"), []);

  // [NEW] Advance from night-complete transition to next night (or Night 3 briefing)
  const handleContinueNight = () => {
    const nextNight = night + 1;
    setNight(nextNight);
    if (nextNight === 3) {
      setPhase("night3-brief");   // show special briefing before Night 3 starts
    } else {
      setPhase("playing");
      setGameKey(k => k + 1);
    }
  };

  // [NEW] Start Night 3 after briefing is dismissed
  const handleStartNight3 = () => {
    setPhase("playing");
    setGameKey(k => k + 1);
  };

  const handleRetry = () => {
    setPhase("playing");
    setGameKey(k => k + 1);
  };

  const cfg = NIGHT_CONFIG[night];

  return (
    <>
      <style>{styles}</style>
      <div className="cf-root">

        {/* Background */}
        <img src={bgSrc} alt="" className="cf-bg" />
        <div className="cf-vignette" />
        {phase === "instructions" && (
  <div className="cf-briefing-overlay">
    <div className="cf-night-title">
      🔥 HOW TO PLAY 🔥
    </div>

    <div className="cf-night-sub">
      Keep all three campfires burning until sunrise.

      {"\n\n"}

      WASD / Arrow Keys → Move

      {"\n"}

      SPACE → Interact

      {"\n\n"}

      Walk to the stick pile and press SPACE to pick up a stick.

      {"\n"}

      Walk to a fire and press SPACE to feed it.

      {"\n\n"}

      Don't let any fire burn out.
    </div>

    <button
      className="cf-btn"
      onClick={() => setPhase("playing")}
    >
      Begin ▶
    </button>
  </div>
)}

        {/* ── Active game ── */}
        {phase === "playing" && (
          <GameCore
            key={gameKey}
            onWin={handleWin}
            onLose={handleLose}
            nightConfig={cfg}     // [NEW]
            nightNumber={night}   // [NEW]
          />
        )}

        {/* ── [NEW] Night-complete transition screen ── */}
        {phase === "night-complete" && (
          <div className="cf-transition-overlay">
            <div className="cf-night-title">
              🔥 NIGHT {night} COMPLETE 🔥
            </div>
            <div className="cf-night-sub">
              {night === 1
                ? "The campfire burns on..."
                : "You've used up the stick pile."}
            </div>
            <button className="cf-btn" onClick={handleContinueNight}>
              Continue ▶
            </button>
          </div>
        )}

        {/* ── [NEW] Night 3 pre-game briefing ── */}
        {phase === "night3-brief" && (
          <div className="cf-briefing-overlay">
            <div className="cf-night-title">⚠ NIGHT 3 ⚠</div>
            <div className="cf-night-sub">
              {"The stick pile is empty.\nFind sticks scattered around the campsite\nand bring them back to the fires."}
            </div>
            <button className="cf-btn" onClick={handleStartNight3}>
              Start ▶
            </button>
          </div>
        )}

        {/* ── Final win (after Night 3) — original win screen ── */}
        {phase === "win" && (
          <>
            <div className="cf-arena" style={{ pointerEvents: "none" }}>
              {FIRE_LAYOUT.map(f => (
                <div
                  key={f.id}
                  className="cf-fire-wrap"
                  style={{ left: f.xPct * GAME_W, top: f.yPct * GAME_H }}
                >
                  <img src={fire4} alt="" className="cf-fire-img win-glow" />
                </div>
              ))}
            </div>
            <div className="cf-win-overlay">
              <div className="cf-win-title">
                🔥 SURVIVED UNTIL SUNRISE 🔥
              </div>
              <div className="cf-win-sub">
                all campfires remained lit
              </div>
              <button
                className="cf-btn"
                onClick={() => window.location.reload()}
              >
                Continue ▶
              </button>
            </div>
          </>
        )}

        {/* ── Lose overlay (unchanged) ── */}
        {phase === "lose" && (
          <div className="cf-lose-overlay">
            <div className="cf-lose-title">
              the night went cold...
            </div>
            <button className="cf-btn" onClick={handleRetry}>
              Try Again ▶
            </button>
          </div>
        )}

      </div>
    </>
  );
}