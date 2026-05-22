import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";

const COOP_URL = "https://functions.poehali.dev/d7956c4f-8709-4a1d-abe4-e6d04544f993";

function getPlayerId(): string {
  let id = localStorage.getItem("bear_player_id");
  if (!id) {
    id = "p_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem("bear_player_id", id);
  }
  return id;
}

type Emotion = "idle" | "happy" | "hurt" | "angry" | "scared";
type AttackType = "paw" | "rock" | "wave" | null;

interface GameState {
  coins: number;
  lives: number;
  score: number;
  status: "playing" | "dead" | "win";
  emotion: Emotion;
  attackType: AttackType;
  hasPartner: boolean;
}

interface Props {
  onExit: () => void;
  worldName: string;
  worldEmoji: string;
  coopCode?: string;
  coopRole?: "host" | "guest";
}

const EMOTION_COLORS: Record<Emotion, number> = {
  idle: 0xc07840,
  happy: 0xf0a030,
  hurt: 0xe05050,
  angry: 0xcc3300,
  scared: 0xd0c0a0,
};

function buildBear(color = 0xc07840): THREE.Group {
  const bear = new THREE.Group();
  const mat = (c: number) => new THREE.MeshLambertMaterial({ color: c });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), mat(color));
  (body.geometry as THREE.SphereGeometry).scale(1, 1.1, 0.9);
  body.castShadow = true;
  bear.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), mat(color));
  head.position.set(0, 0.75, 0.1);
  head.castShadow = true;
  bear.add(head);

  for (const ex of [-0.28, 0.28]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat(color));
    ear.position.set(ex, 1.1, 0.05);
    bear.add(ear);
    const innerEar = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), mat(0xe8a080));
    innerEar.position.set(ex, 1.1, 0.14);
    bear.add(innerEar);
  }

  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), mat(0xe8c090));
  snout.scale.set(1, 0.7, 0.8);
  snout.position.set(0, 0.65, 0.48);
  bear.add(snout);

  const eyeGeo = new THREE.SphereGeometry(0.06, 6, 5);
  for (const ex of [-0.15, 0.15]) {
    const eye = new THREE.Mesh(eyeGeo, mat(0x1a1a1a));
    eye.position.set(ex, 0.82, 0.42);
    bear.add(eye);
  }

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), mat(0x333333));
  nose.position.set(0, 0.68, 0.55);
  bear.add(nose);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), mat(0xe8c090));
  belly.scale.set(1, 1.2, 0.5);
  belly.position.set(0, -0.05, 0.42);
  bear.add(belly);

  const legMat = mat(0xa06030);
  for (const [lx, ly, lz] of [[-0.25, -0.5, 0], [0.25, -0.5, 0], [-0.2, -0.3, 0.35], [0.2, -0.3, 0.35]]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.3, 4, 6), legMat);
    leg.position.set(lx, ly, lz);
    bear.add(leg);
  }

  const hatBase = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.08, 12), mat(0x8B5E3C));
  hatBase.position.set(0, 1.18, 0.05);
  bear.add(hatBase);
  const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.38, 12), mat(0x7B4E2C));
  hatTop.position.set(0, 1.42, 0.05);
  bear.add(hatTop);

  (bear as THREE.Group & { bodyMesh: THREE.Mesh }).bodyMesh = body;
  return bear;
}

export default function Game3D({ onExit, worldName, worldEmoji, coopCode, coopRole }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<{
    renderer?: THREE.WebGLRenderer;
    scene?: THREE.Scene;
    camera?: THREE.PerspectiveCamera;
    bear?: THREE.Group;
    partnerBear?: THREE.Group;
    platforms: THREE.Mesh[];
    coins: THREE.Mesh[];
    enemies: THREE.Mesh[];
    projectiles: { mesh: THREE.Mesh; vx: number; life: number }[];
    waveEffects: { mesh: THREE.Mesh; life: number }[];
    pawEffects: { mesh: THREE.Mesh; life: number }[];
    animFrameId?: number;
    keys: { left: boolean; right: boolean; jump: boolean };
    velocity: THREE.Vector3;
    onGround: boolean;
    clock: THREE.Clock;
    coinRotation: number;
    enemyDir: number[];
    attackCooldown: number;
    emotionTimer: number;
    invincible: number;
    coopSyncTimer: number;
  }>({
    platforms: [], coins: [], enemies: [],
    projectiles: [], waveEffects: [], pawEffects: [],
    keys: { left: false, right: false, jump: false },
    velocity: new THREE.Vector3(),
    onGround: false,
    clock: new THREE.Clock(),
    coinRotation: 0,
    enemyDir: [],
    attackCooldown: 0,
    emotionTimer: 0,
    invincible: 0,
    coopSyncTimer: 0,
  });

  const [gameState, setGameState] = useState<GameState>({
    coins: 0, lives: 3, score: 0, status: "playing",
    emotion: "idle", attackType: null, hasPartner: false,
  });
  const [totalCoins, setTotalCoins] = useState(0);
  const stateRef = useRef(gameState);
  stateRef.current = gameState;

  const joyRef = useRef({ active: false, startX: 0, startY: 0, dx: 0, dy: 0 });
  const playerId = getPlayerId();

  // ── EMOTION HELPER ────────────────────────────────────────────────────────
  const setEmotion = useCallback((em: Emotion, duration = 1200) => {
    const g = gameRef.current;
    g.emotionTimer = duration;
    setGameState(prev => ({ ...prev, emotion: em }));
    if (g.bear) {
      const body = (g.bear as THREE.Group & { bodyMesh?: THREE.Mesh }).bodyMesh;
      if (body) (body.material as THREE.MeshLambertMaterial).color.setHex(EMOTION_COLORS[em]);
      if (em === "happy") {
        g.bear.position.y += 0.3;
        g.velocity.y = Math.max(g.velocity.y, 4);
      }
      if (em === "angry") {
        g.bear.scale.set(1.15, 1.15, 1.15);
      }
      if (em === "scared") {
        g.bear.rotation.z = 0.25;
      }
    }
  }, []);

  const resetEmotion = useCallback(() => {
    const g = gameRef.current;
    if (!g.bear) return;
    const body = (g.bear as THREE.Group & { bodyMesh?: THREE.Mesh }).bodyMesh;
    if (body) (body.material as THREE.MeshLambertMaterial).color.setHex(EMOTION_COLORS.idle);
    g.bear.scale.set(1, 1, 1);
    g.bear.rotation.z = 0;
    setGameState(prev => ({ ...prev, emotion: "idle", attackType: null }));
  }, []);

  const resetBear = useCallback(() => {
    const g = gameRef.current;
    if (!g.bear) return;
    g.bear.position.set(0, 1.5, 0);
    g.velocity.set(0, 0, 0);
    g.onGround = false;
    g.invincible = 2000;
    setEmotion("hurt", 800);
  }, [setEmotion]);

  // ── ATTACK: PAW ───────────────────────────────────────────────────────────
  const doPawAttack = useCallback(() => {
    const g = gameRef.current;
    if (!g.bear || g.attackCooldown > 0) return;
    g.attackCooldown = 600;
    setEmotion("angry", 500);
    setGameState(prev => ({ ...prev, attackType: "paw" }));

    // Paw flash mesh
    const pawGeo = new THREE.SphereGeometry(0.7, 8, 6);
    const pawMat = new THREE.MeshLambertMaterial({ color: 0xffaa00, transparent: true, opacity: 0.7 });
    const paw = new THREE.Mesh(pawGeo, pawMat);
    const dir = g.bear.rotation.y > 0 ? 1 : -1;
    paw.position.copy(g.bear.position).add(new THREE.Vector3(dir * 1.1, 0, 0));
    g.scene?.add(paw);
    g.pawEffects.push({ mesh: paw, life: 300 });

    // Hit enemies in range
    g.enemies.forEach(enemy => {
      if (!enemy.visible) return;
      const dist = g.bear!.position.distanceTo(enemy.position);
      if (dist < 1.8) {
        enemy.visible = false;
        setGameState(prev => ({ ...prev, score: prev.score + 300 }));
      }
    });
  }, [setEmotion]);

  // ── ATTACK: ROCK ──────────────────────────────────────────────────────────
  const doRockAttack = useCallback(() => {
    const g = gameRef.current;
    if (!g.bear || g.attackCooldown > 0) return;
    g.attackCooldown = 900;
    setEmotion("angry", 400);
    setGameState(prev => ({ ...prev, attackType: "rock" }));

    const rockGeo = new THREE.SphereGeometry(0.22, 8, 6);
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.copy(g.bear.position).add(new THREE.Vector3(0, 0.4, 0));
    g.scene?.add(rock);
    const dir = g.bear.rotation.y > 0 ? 1 : -1;
    g.projectiles.push({ mesh: rock, vx: dir * 14, life: 2000 });
  }, [setEmotion]);

  // ── ATTACK: WAVE ──────────────────────────────────────────────────────────
  const doWaveAttack = useCallback(() => {
    const g = gameRef.current;
    if (!g.bear || g.attackCooldown > 0) return;
    g.attackCooldown = 1200;
    setEmotion("angry", 600);
    setGameState(prev => ({ ...prev, attackType: "wave" }));

    const waveGeo = new THREE.RingGeometry(0.3, 2.2, 16);
    const waveMat = new THREE.MeshLambertMaterial({ color: 0x44aaff, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    const wave = new THREE.Mesh(waveGeo, waveMat);
    wave.rotation.x = -Math.PI / 2;
    wave.position.copy(g.bear.position);
    g.scene?.add(wave);
    g.waveEffects.push({ mesh: wave, life: 500 });

    g.enemies.forEach(enemy => {
      if (!enemy.visible) return;
      const dist = g.bear!.position.distanceTo(enemy.position);
      if (dist < 2.5) {
        enemy.visible = false;
        setGameState(prev => ({ ...prev, score: prev.score + 250 }));
      }
    });
  }, [setEmotion]);

  // ── COOP SYNC ─────────────────────────────────────────────────────────────
  const syncCoop = useCallback(async (coinsStr: string, enemiesStr: string) => {
    if (!coopCode) return;
    const g = gameRef.current;
    if (!g.bear) return;
    try {
      const res = await fetch(`${COOP_URL}?action=sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: coopCode,
          player_id: playerId,
          x: g.bear.position.x,
          y: g.bear.position.y,
          emotion: stateRef.current.emotion,
          coins_collected: coinsStr,
          enemies_alive: enemiesStr,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setGameState(prev => ({ ...prev, hasPartner: data.has_partner }));

      // Move partner bear
      const partnerData = coopRole === "host" ? data.guest : data.host;
      if (g.partnerBear && data.has_partner) {
        g.partnerBear.visible = true;
        g.partnerBear.position.x += (partnerData.x - g.partnerBear.position.x) * 0.3;
        g.partnerBear.position.y += (partnerData.y - g.partnerBear.position.y) * 0.3;
        // Partner emotion color
        const partnerEmo = (partnerData.emotion || "idle") as Emotion;
        const partnerBody = (g.partnerBear as THREE.Group & { bodyMesh?: THREE.Mesh }).bodyMesh;
        if (partnerBody) (partnerBody.material as THREE.MeshLambertMaterial).color.setHex(EMOTION_COLORS[partnerEmo]);
      }
    } catch (_) { /* ignore */ }
  }, [coopCode, coopRole, playerId]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const g = gameRef.current;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x87ceeb);
    mount.appendChild(renderer.domElement);
    g.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x87ceeb, 0.025);
    g.scene = scene;

    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 200);
    camera.position.set(0, 5, 12);
    g.camera = camera;

    scene.add(new THREE.AmbientLight(0xffeebb, 0.7));
    const sun = new THREE.DirectionalLight(0xfff5cc, 1.4);
    sun.position.set(20, 40, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
    sun.shadow.camera.far = 200;
    scene.add(sun);

    // Sky sphere
    const skyGeo = new THREE.SphereGeometry(100, 16, 8);
    skyGeo.scale(-1, 1, 1);
    const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const skyColors: number[] = [];
    const posArr = skyGeo.attributes.position.array;
    const col = new THREE.Color();
    for (let i = 0; i < posArr.length / 3; i++) {
      const yv = posArr[i * 3 + 1];
      const t = Math.max(0, Math.min(1, (yv + 50) / 100));
      col.lerpColors(new THREE.Color(0xb8f0ff), new THREE.Color(0x2980b9), 1 - t);
      skyColors.push(col.r, col.g, col.b);
    }
    skyGeo.setAttribute("color", new THREE.Float32BufferAttribute(skyColors, 3));
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    // Ground
    const ground = new THREE.Mesh(new THREE.BoxGeometry(200, 1, 40), new THREE.MeshLambertMaterial({ color: 0x4caf50 }));
    ground.position.set(50, -0.5, 0);
    ground.receiveShadow = true;
    scene.add(ground);
    g.platforms.push(ground);
    scene.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(200, 2, 40), new THREE.MeshLambertMaterial({ color: 0x8B5E3C })), { position: new THREE.Vector3(50, -1.5, 0) }));

    // Grass tufts
    for (let i = 0; i < 30; i++) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 4), new THREE.MeshLambertMaterial({ color: 0x66bb6a }));
      tuft.position.set(Math.random() * 160 - 10, 0.25, (Math.random() - 0.5) * 30);
      scene.add(tuft);
    }

    // Platforms
    const platformData = [
      { x: 8, y: 2, z: 0, w: 4, d: 3 }, { x: 14, y: 3.5, z: 0, w: 3, d: 3 },
      { x: 20, y: 2, z: 1, w: 5, d: 3 }, { x: 28, y: 4, z: -1, w: 3, d: 3 },
      { x: 34, y: 2.5, z: 0, w: 4, d: 3 }, { x: 42, y: 5, z: 1, w: 3, d: 3 },
      { x: 50, y: 3, z: 0, w: 6, d: 3 }, { x: 58, y: 1.5, z: 0, w: 4, d: 3 },
      { x: 66, y: 4, z: 0, w: 3, d: 3 }, { x: 74, y: 2, z: 0, w: 5, d: 3 },
    ];
    platformData.forEach(p => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.w, 0.6, p.d), new THREE.MeshLambertMaterial({ color: 0x8BC34A }));
      mesh.position.set(p.x, p.y, p.z);
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
      g.platforms.push(mesh);
      const top = new THREE.Mesh(new THREE.BoxGeometry(p.w, 0.12, p.d), new THREE.MeshLambertMaterial({ color: 0x66bb6a }));
      top.position.set(p.x, p.y + 0.36, p.z);
      scene.add(top);
    });

    // Coins
    const coinPositions: [number, number, number][] = [
      [4,1.8,0],[5,1.8,0],[6,1.8,0],[8,3.5,0],[14,5,0],[20,3.5,0],[21,3.5,0],
      [28,5.5,0],[34,4,0],[35,4,0],[36,4,0],[42,6.5,0],[50,4.5,0],[51,4.5,0],
      [58,3,0],[66,5.5,0],[74,3.5,0],[75,3.5,0],
    ];
    const coinGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.1, 12);
    const coinMat = new THREE.MeshLambertMaterial({ color: 0xFFD700, emissive: 0xFFAA00, emissiveIntensity: 0.3 });
    coinPositions.forEach(([cx, cy, cz]) => {
      const coin = new THREE.Mesh(coinGeo, coinMat);
      coin.position.set(cx, cy, cz);
      coin.rotation.x = Math.PI / 2;
      coin.castShadow = true;
      scene.add(coin);
      g.coins.push(coin);
    });
    setTotalCoins(coinPositions.length);

    // Enemies
    const enemyPositions: [number, number, number][] = [
      [12,1.0,0],[25,1.0,0],[38,1.0,0],[55,1.0,0],[70,1.0,0],
    ];
    const enemyMat = new THREE.MeshLambertMaterial({ color: 0xe53935, emissive: 0x7b0000, emissiveIntensity: 0.2 });
    enemyPositions.forEach(([ex, ey, ez]) => {
      const enemy = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), enemyMat);
      enemy.position.set(ex, ey, ez);
      const hornMat = new THREE.MeshLambertMaterial({ color: 0xb71c1c });
      for (const hx of [-0.2, 0, 0.2]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 4), hornMat);
        horn.position.set(hx, 0.55, 0);
        enemy.add(horn);
      }
      scene.add(enemy);
      g.enemies.push(enemy);
      g.enemyDir.push(1);
    });

    // Bear (player)
    const bear = buildBear(0xc07840);
    bear.position.set(0, 1.5, 0);
    scene.add(bear);
    g.bear = bear;

    // Partner bear (coop)
    if (coopCode) {
      const partner = buildBear(0x5080e0);
      partner.position.set(2, 1.5, 0);
      partner.visible = false;
      scene.add(partner);
      g.partnerBear = partner;

      // Partner label
      const canvas = document.createElement("canvas");
      canvas.width = 128; canvas.height = 32;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#4444ff";
      ctx.font = "bold 18px sans-serif";
      ctx.fillText("Напарник", 4, 22);
      const tex = new THREE.CanvasTexture(canvas);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
      label.position.set(0, 2.2, 0);
      partner.add(label);
    }

    // Trees
    const treePositions: [number, number, number][] = [
      [-4,0,-8],[3,0,-12],[10,0,-9],[18,0,-11],[24,0,-7],[30,0,-13],
      [38,0,-8],[45,0,-10],[52,0,-7],[60,0,-12],[68,0,-9],[76,0,-11],[80,0,-8],
      [-4,0,10],[8,0,12],[16,0,9],[28,0,11],[42,0,10],
    ];
    treePositions.forEach(([tx, ty, tz]) => {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.8, 8), new THREE.MeshLambertMaterial({ color: 0x6D4C41 }));
      trunk.position.y = 0.9;
      tree.add(trunk);
      [[1.4, 2.0, 0x388E3C, 2.6],[1.0, 1.6, 0x43A047, 3.8],[0.6, 1.2, 0x66BB6A, 4.8]].forEach(([r, h, c, py]) => {
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(r as number, h as number, 8), new THREE.MeshLambertMaterial({ color: c as number }));
        leaves.position.y = py as number;
        tree.add(leaves);
      });
      tree.position.set(tx, ty, tz);
      scene.add(tree);
    });

    // Clouds
    for (let i = 0; i < 12; i++) {
      const cloud = new THREE.Group();
      [0, 0.6, -0.6, 1.1, -1.1].forEach((cx, ci) => {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.4 + (ci === 0 ? 0.2 : 0), 8, 6), new THREE.MeshLambertMaterial({ color: 0xffffff }));
        puff.position.set(cx, ci === 0 ? 0.1 : 0, 0);
        cloud.add(puff);
      });
      cloud.position.set(i * 14 - 10, 12 + Math.random() * 4, -15 + Math.random() * 10);
      cloud.scale.setScalar(1.5 + Math.random() * 0.8);
      scene.add(cloud);
    }

    // Goal flag
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 6), new THREE.MeshLambertMaterial({ color: 0xbdbdbd }));
    pole.position.set(80, 2.5, 0);
    scene.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshLambertMaterial({ color: 0xFFD700, side: THREE.DoubleSide }));
    flag.position.set(80.7, 4.4, 0);
    scene.add(flag);

    // ── GAME LOOP ─────────────────────────────────────────────────────────────
    const GRAVITY = -18, SPEED = 7, JUMP_FORCE = 9;
    const bearSize = new THREE.Vector3(0.9, 1.7, 0.9);

    const animate = () => {
      g.animFrameId = requestAnimationFrame(animate);
      const dt = Math.min(g.clock.getDelta(), 0.05);
      const dtMs = dt * 1000;
      const state = stateRef.current;
      if (state.status !== "playing" || !g.bear) {
        renderer.render(scene, camera);
        return;
      }

      // Cooldowns & timers
      if (g.attackCooldown > 0) g.attackCooldown -= dtMs;
      if (g.invincible > 0) {
        g.invincible -= dtMs;
        g.bear.visible = Math.floor(g.invincible / 100) % 2 === 0 ? true : g.invincible > 0 ? !g.bear.visible : true;
      }
      if (g.emotionTimer > 0) {
        g.emotionTimer -= dtMs;
        if (g.emotionTimer <= 0) resetEmotion();
      }

      // Coop sync every 150ms
      g.coopSyncTimer += dtMs;
      if (coopCode && g.coopSyncTimer > 150) {
        g.coopSyncTimer = 0;
        const coinsStr = g.coins.map((c, i) => c.visible ? "" : i).filter(Boolean).join(",");
        const enemiesStr = g.enemies.map((e, i) => e.visible ? "" : i).filter(Boolean).join(",");
        syncCoop(coinsStr, enemiesStr);
      }

      const { keys, velocity, bear } = g;
      const jdx = joyRef.current.active ? joyRef.current.dx / 40 : 0;
      const moveLeft = keys.left || jdx < -0.2;
      const moveRight = keys.right || jdx > 0.2;

      if (moveLeft) { velocity.x = -SPEED; bear.rotation.y = -Math.PI * 0.15; }
      else if (moveRight) { velocity.x = SPEED; bear.rotation.y = Math.PI * 0.15; }
      else { velocity.x *= 0.75; bear.rotation.y *= 0.8; }

      if (keys.jump && g.onGround) {
        velocity.y = JUMP_FORCE;
        g.onGround = false;
        keys.jump = false;
      }

      velocity.y += GRAVITY * dt;
      bear.position.x += velocity.x * dt;
      bear.position.y += velocity.y * dt;
      bear.position.z += (0 - bear.position.z) * 0.1;

      // Scared emotion near enemy
      let nearEnemy = false;
      g.enemies.forEach(enemy => {
        if (!enemy.visible) return;
        if (g.bear!.position.distanceTo(enemy.position) < 2.5) nearEnemy = true;
      });
      if (nearEnemy && state.emotion === "idle") setEmotion("scared", 200);

      // Death pit
      if (bear.position.y < -8) {
        setGameState(prev => {
          const lives = prev.lives - 1;
          if (lives <= 0) return { ...prev, lives: 0, status: "dead" };
          return { ...prev, lives };
        });
        resetBear();
        return;
      }

      // Platform collision
      g.onGround = false;
      const bearBox = new THREE.Box3().setFromCenterAndSize(bear.position, bearSize);
      g.platforms.forEach(platform => {
        const pb = new THREE.Box3().setFromObject(platform);
        if (!bearBox.intersectsBox(pb)) return;
        const bearBottom = bear.position.y - bearSize.y / 2;
        const platTop = pb.max.y;
        const bearTop = bear.position.y + bearSize.y / 2;
        const platBottom = pb.min.y;
        if (velocity.y <= 0 && bearBottom <= platTop && bearBottom >= platTop - 0.6) {
          bear.position.y = platTop + bearSize.y / 2;
          velocity.y = 0;
          g.onGround = true;
        } else if (velocity.y > 0 && bearTop >= platBottom && bearTop <= platBottom + 0.6) {
          velocity.y = -0.5;
        } else {
          if (bear.position.x < pb.min.x + 0.3) bear.position.x = pb.min.x - bearSize.x / 2;
          else if (bear.position.x > pb.max.x - 0.3) bear.position.x = pb.max.x + bearSize.x / 2;
        }
      });

      // Coins
      g.coinRotation += dt * 2;
      g.coins.forEach((coin, i) => {
        if (!coin.visible) return;
        coin.rotation.y = g.coinRotation;
        coin.position.y += Math.sin(Date.now() * 0.003 + i) * 0.003;
        if (bear.position.distanceTo(coin.position) < 0.8) {
          coin.visible = false;
          setEmotion("happy", 700);
          setGameState(prev => ({ ...prev, coins: prev.coins + 1, score: prev.score + 100 }));
        }
      });

      // Enemies
      g.enemies.forEach((enemy, i) => {
        if (!enemy.visible) return;
        enemy.position.x += g.enemyDir[i] * 2.5 * dt;
        const baseX = 9 + i * 13;
        if (enemy.position.x > baseX + 3) g.enemyDir[i] = -1;
        if (enemy.position.x < baseX - 3) g.enemyDir[i] = 1;
        enemy.rotation.y += dt * 2;

        if (g.invincible > 0) return;
        const dist = bear.position.distanceTo(enemy.position);
        if (dist < 1.0) {
          const bearBottom = bear.position.y - bearSize.y / 2;
          if (bearBottom > enemy.position.y + 0.1 && velocity.y < 0) {
            enemy.visible = false;
            velocity.y = 6;
            setEmotion("happy", 600);
            setGameState(prev => ({ ...prev, score: prev.score + 200 }));
          } else {
            setGameState(prev => {
              const lives = prev.lives - 1;
              if (lives <= 0) return { ...prev, lives: 0, status: "dead" };
              return { ...prev, lives };
            });
            setEmotion("hurt", 800);
            resetBear();
          }
        }
      });

      // Projectiles (rocks)
      g.projectiles.forEach((proj, pi) => {
        if (proj.life <= 0) {
          g.scene?.remove(proj.mesh);
          g.projectiles.splice(pi, 1);
          return;
        }
        proj.life -= dtMs;
        proj.mesh.position.x += proj.vx * dt;
        proj.mesh.rotation.y += dt * 5;
        g.enemies.forEach(enemy => {
          if (!enemy.visible) return;
          if (proj.mesh.position.distanceTo(enemy.position) < 0.7) {
            enemy.visible = false;
            proj.life = 0;
            setGameState(prev => ({ ...prev, score: prev.score + 300 }));
          }
        });
      });

      // Paw effects
      g.pawEffects.forEach((fx, pi) => {
        fx.life -= dtMs;
        const t = 1 - fx.life / 300;
        (fx.mesh.material as THREE.MeshLambertMaterial).opacity = 0.7 * (1 - t);
        fx.mesh.scale.setScalar(1 + t * 0.5);
        if (fx.life <= 0) {
          g.scene?.remove(fx.mesh);
          g.pawEffects.splice(pi, 1);
        }
      });

      // Wave effects
      g.waveEffects.forEach((fx, wi) => {
        fx.life -= dtMs;
        const t = 1 - fx.life / 500;
        (fx.mesh.material as THREE.MeshLambertMaterial).opacity = 0.6 * (1 - t);
        fx.mesh.scale.setScalar(1 + t * 1.5);
        if (fx.life <= 0) {
          g.scene?.remove(fx.mesh);
          g.waveEffects.splice(wi, 1);
        }
      });

      // Win condition
      if (bear.position.x > 79) {
        setGameState(prev => ({ ...prev, status: "win" }));
        setEmotion("happy", 9999);
      }

      // Camera
      camera.position.x += (bear.position.x + 0 - camera.position.x) * 0.08;
      camera.position.y += (bear.position.y + 5 - camera.position.y) * 0.08;
      camera.lookAt(bear.position.x, bear.position.y + 1, 0);

      renderer.render(scene, camera);
    };

    g.clock.start();
    animate();

    const onResize = () => {
      if (!mount) return;
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a") g.keys.left = true;
      if (e.key === "ArrowRight" || e.key === "d") g.keys.right = true;
      if (e.key === " " || e.key === "ArrowUp" || e.key === "w") { e.preventDefault(); g.keys.jump = true; }
      if (e.key === "z" || e.key === "Z") doPawAttack();
      if (e.key === "x" || e.key === "X") doRockAttack();
      if (e.key === "c" || e.key === "C") doWaveAttack();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a") g.keys.left = false;
      if (e.key === "ArrowRight" || e.key === "d") g.keys.right = false;
      if (e.key === " " || e.key === "ArrowUp" || e.key === "w") g.keys.jump = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      if (g.animFrameId) cancelAnimationFrame(g.animFrameId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, [resetBear, resetEmotion, setEmotion, doPawAttack, doRockAttack, doWaveAttack, syncCoop, coopCode]);

  const handleJoyStart = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    joyRef.current = { active: true, startX: t.clientX, startY: t.clientY, dx: 0, dy: 0 };
  };
  const handleJoyMove = (e: React.TouchEvent) => {
    if (!joyRef.current.active) return;
    const t = e.changedTouches[0];
    joyRef.current.dx = t.clientX - joyRef.current.startX;
    joyRef.current.dy = t.clientY - joyRef.current.startY;
  };
  const handleJoyEnd = () => {
    joyRef.current = { active: false, startX: 0, startY: 0, dx: 0, dy: 0 };
    gameRef.current.keys.left = false;
    gameRef.current.keys.right = false;
  };
  const handleJump = () => {
    gameRef.current.keys.jump = true;
    setTimeout(() => { gameRef.current.keys.jump = false; }, 120);
  };

  const restart = () => {
    setGameState({ coins: 0, lives: 3, score: 0, status: "playing", emotion: "idle", attackType: null, hasPartner: !!coopCode });
    gameRef.current.coins.forEach(c => { c.visible = true; });
    gameRef.current.enemies.forEach(e => { e.visible = true; });
    gameRef.current.enemyDir = gameRef.current.enemies.map(() => 1);
    gameRef.current.attackCooldown = 0;
    resetBear();
  };

  const EMOTION_EMOJI: Record<Emotion, string> = {
    idle: "", happy: "🎉", hurt: "😵", angry: "⚡", scared: "😨"
  };
  const ATTACK_LABEL: Record<NonNullable<AttackType>, string> = {
    paw: "👊 Удар!", rock: "🪨 Бросок!", wave: "🌊 Волна!"
  };
  const joystickOffset = joyRef.current.active
    ? { x: Math.max(-35, Math.min(35, joyRef.current.dx)), y: Math.max(-35, Math.min(35, joyRef.current.dy)) }
    : { x: 0, y: 0 };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" style={{ maxWidth: 480, left: "50%", transform: "translateX(-50%)" }}>
      <div ref={mountRef} className="flex-1 w-full relative overflow-hidden">

        {/* HUD */}
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between pointer-events-none z-10">
          <div className="panel-wood px-3 py-1 flex items-center gap-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <span key={i} className={`text-lg ${i < gameState.lives ? "" : "opacity-25"}`}>❤️</span>
            ))}
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="panel-wood px-3 py-1">
              <span className="font-game text-sm text-white">{worldEmoji} {worldName}</span>
            </div>
            {coopCode && (
              <div className={`px-2 py-0.5 rounded-xl text-xs font-bold font-game ${gameState.hasPartner ? "bg-green-500 text-white" : "bg-gray-600 text-gray-300"}`}>
                {gameState.hasPartner ? "👥 Напарник онлайн" : "⏳ Ждём напарника..."}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1 items-end">
            <div className="coin-display px-2 py-0.5 font-game text-xs text-amber-900">🪙 {gameState.coins}/{totalCoins}</div>
            <div className="panel-wood px-2 py-0.5 font-game text-xs text-yellow-300">⭐ {gameState.score}</div>
          </div>
        </div>

        {/* Emotion bubble */}
        {gameState.emotion !== "idle" && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
            <div className="bg-white rounded-full px-4 py-2 shadow-lg border-2 border-amber-300 animate-bounce-in font-game text-2xl">
              {EMOTION_EMOJI[gameState.emotion]}
            </div>
          </div>
        )}

        {/* Attack label */}
        {gameState.attackType && (
          <div className="absolute top-32 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
            <div className="bg-orange-500 text-white rounded-2xl px-4 py-1 shadow font-game text-sm animate-bounce-in">
              {ATTACK_LABEL[gameState.attackType]}
            </div>
          </div>
        )}

        {/* Exit */}
        <button className="absolute z-20 btn-game px-3 py-1 text-xs" style={{ top: 52, left: 12 }} onClick={onExit}>
          ✖ Выйти
        </button>

        {/* Win */}
        {gameState.status === "win" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-30">
            <div className="card-game p-6 text-center mx-6 animate-bounce-in">
              <div className="text-5xl mb-2">🎉</div>
              <div className="font-game text-2xl text-amber-900 mb-1">Уровень пройден!</div>
              <div className="font-game text-lg text-amber-700 mb-3">🪙 {gameState.coins}/{totalCoins} · ⭐ {gameState.score}</div>
              <StarBar count={gameState.coins >= totalCoins ? 3 : gameState.coins >= Math.floor(totalCoins * 0.6) ? 2 : 1} />
              <div className="flex gap-3 mt-4">
                <button className="btn-game flex-1 py-2 text-sm" onClick={restart}>🔄 Ещё раз</button>
                <button className="btn-game flex-1 py-2 text-sm" onClick={onExit}>🗺️ Карта</button>
              </div>
            </div>
          </div>
        )}

        {/* Dead */}
        {gameState.status === "dead" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-30">
            <div className="card-game p-6 text-center mx-6 animate-bounce-in">
              <div className="text-5xl mb-2">😵</div>
              <div className="font-game text-2xl text-amber-900 mb-1">Игра окончена</div>
              <div className="font-game text-base text-amber-700 mb-4">Счёт: ⭐ {gameState.score}</div>
              <div className="flex gap-3">
                <button className="btn-game flex-1 py-2 text-sm" onClick={restart}>🔄 Заново</button>
                <button className="btn-game flex-1 py-2 text-sm" onClick={onExit}>🗺️ Карта</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between px-4 pb-3 pt-2 gap-2" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.9) 100%)" }}>
        {/* Joystick */}
        <div
          className="relative flex items-center justify-center rounded-full flex-shrink-0"
          style={{ width: 90, height: 90, background: "rgba(255,255,255,0.1)", border: "3px solid rgba(255,255,255,0.25)" }}
          onTouchStart={handleJoyStart} onTouchMove={handleJoyMove} onTouchEnd={handleJoyEnd}
        >
          <div className="absolute rounded-full" style={{
            width: 40, height: 40,
            background: "radial-gradient(circle at 40% 35%, #f5c842, #d4881e)",
            border: "3px solid #a36010",
            boxShadow: "0 3px 8px rgba(0,0,0,0.5)",
            transform: `translate(${joystickOffset.x}px, ${joystickOffset.y}px)`,
            transition: joyRef.current.active ? "none" : "transform 0.15s ease",
          }} />
        </div>

        {/* Attack buttons */}
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <button
            className="rounded-2xl font-game text-xs text-white px-3 py-1.5 active:scale-90 transition-transform"
            style={{ background: "#e65c00", border: "2px solid #b34400", boxShadow: "0 3px 0 #7a2e00", WebkitTapHighlightColor: "transparent" }}
            onTouchStart={e => { e.preventDefault(); doPawAttack(); }}
            onMouseDown={doPawAttack}
          >👊 ATK</button>
          <button
            className="rounded-2xl font-game text-xs text-white px-3 py-1.5 active:scale-90 transition-transform"
            style={{ background: "#607d8b", border: "2px solid #455a64", boxShadow: "0 3px 0 #263238", WebkitTapHighlightColor: "transparent" }}
            onTouchStart={e => { e.preventDefault(); doRockAttack(); }}
            onMouseDown={doRockAttack}
          >🪨 ROCK</button>
          <button
            className="rounded-2xl font-game text-xs text-white px-3 py-1.5 active:scale-90 transition-transform"
            style={{ background: "#0288d1", border: "2px solid #0277a8", boxShadow: "0 3px 0 #014e72", WebkitTapHighlightColor: "transparent" }}
            onTouchStart={e => { e.preventDefault(); doWaveAttack(); }}
            onMouseDown={doWaveAttack}
          >🌊 WAVE</button>
        </div>

        {/* Jump */}
        <button
          className="flex items-center justify-center rounded-full flex-shrink-0 active:scale-90 transition-transform"
          style={{
            width: 80, height: 80,
            background: "radial-gradient(circle at 40% 35%, #5cb84a, #2d6b22)",
            border: "4px solid #1e4a17",
            boxShadow: "0 5px 0 #1e4a17",
            fontFamily: "'Fredoka One', cursive",
            fontSize: 13, color: "white",
            textShadow: "0 1px 0 rgba(0,0,0,0.4)",
            WebkitTapHighlightColor: "transparent",
          }}
          onTouchStart={e => { e.preventDefault(); handleJump(); }}
          onMouseDown={handleJump}
        >ПРЫЖОК</button>
      </div>
    </div>
  );
}

function StarBar({ count, max = 3 }: { count: number; max?: number }) {
  return (
    <div className="flex gap-1 justify-center">
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={`text-2xl ${i < count ? "" : "opacity-25"}`}>⭐</span>
      ))}
    </div>
  );
}
