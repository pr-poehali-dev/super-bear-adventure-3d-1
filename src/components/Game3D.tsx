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
interface ChatMsg { id: number; role: "host" | "guest"; text: string }

interface GameState {
  coins: number; lives: number; score: number;
  status: "playing" | "dead" | "win";
  emotion: Emotion; attackType: AttackType; hasPartner: boolean; zone: string;
}

interface Props {
  onExit: () => void; worldName: string; worldEmoji: string;
  coopCode?: string; coopRole?: "host" | "guest";
}

const EMOTION_COLORS: Record<Emotion, number> = {
  idle: 0xc07840, happy: 0xf0a030, hurt: 0xe05050, angry: 0xcc3300, scared: 0xd0c0a0,
};

const ZONE_DEFS = [
  { name:"Лесной лес",     start:0,   end:120, fog:0x87ceeb, ground:0x4caf50, dirt:0x8B5E3C, emoji:"🌲" },
  { name:"Снежные горы",   start:120, end:240, fog:0xd0eeff, ground:0xddeeff, dirt:0xaabbcc, emoji:"❄️" },
  { name:"Солнечный пляж", start:240, end:360, fog:0x7ecff7, ground:0xf5d77a, dirt:0xc8a020, emoji:"🏖️" },
  { name:"Огненный вулкан",start:360, end:480, fog:0xff8844, ground:0x5a1a00, dirt:0x3a0a00, emoji:"🌋" },
  { name:"Облачный замок", start:480, end:620, fog:0xeef8ff, ground:0xffffff, dirt:0xddddff, emoji:"☁️" },
];
const WORLD_END = 570;

function getZone(x: number) { return ZONE_DEFS.find(z => x >= z.start && x < z.end) || ZONE_DEFS[0]; }

function buildBear(color = 0xc07840): THREE.Group {
  const g = new THREE.Group();
  const m = (c: number) => new THREE.MeshLambertMaterial({ color: c });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), m(color));
  body.geometry.scale(1, 1.1, 0.9); body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), m(color));
  head.position.set(0, 0.75, 0.1); g.add(head);
  for (const ex of [-0.28, 0.28]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), m(color));
    ear.position.set(ex, 1.1, 0.05); g.add(ear);
    const ie = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), m(0xe8a080));
    ie.position.set(ex, 1.1, 0.14); g.add(ie);
  }
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), m(0xe8c090));
  snout.scale.set(1, 0.7, 0.8); snout.position.set(0, 0.65, 0.48); g.add(snout);
  for (const ex of [-0.15, 0.15]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), m(0x1a1a1a));
    eye.position.set(ex, 0.82, 0.42); g.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), m(0x333333));
  nose.position.set(0, 0.68, 0.55); g.add(nose);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), m(0xe8c090));
  belly.scale.set(1, 1.2, 0.5); belly.position.set(0, -0.05, 0.42); g.add(belly);
  const lm = m(0xa06030);
  for (const [lx,ly,lz] of [[-0.25,-0.5,0],[0.25,-0.5,0],[-0.2,-0.3,0.35],[0.2,-0.3,0.35]]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.12,0.3,4,6), lm);
    leg.position.set(lx,ly,lz); g.add(leg);
  }
  const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.44,0.44,0.08,12), m(0x8B5E3C));
  hb.position.set(0,1.18,0.05); g.add(hb);
  const ht = new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.4,0.38,12), m(0x7B4E2C));
  ht.position.set(0,1.42,0.05); g.add(ht);
  (g as THREE.Group & { bodyMesh: THREE.Mesh }).bodyMesh = body;
  return g;
}

export default function Game3D({ onExit, worldName, worldEmoji, coopCode, coopRole }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const gRef = useRef<{
    renderer?: THREE.WebGLRenderer; scene?: THREE.Scene; camera?: THREE.PerspectiveCamera;
    bear?: THREE.Group; partnerBear?: THREE.Group;
    platforms: THREE.Mesh[]; coins: THREE.Mesh[]; enemies: THREE.Mesh[];
    projectiles: { mesh: THREE.Mesh; vx: number; life: number }[];
    waveEffects: { mesh: THREE.Mesh; life: number }[];
    pawEffects: { mesh: THREE.Mesh; life: number }[];
    animFrameId?: number;
    keys: { left: boolean; right: boolean; jump: boolean };
    velocity: THREE.Vector3; onGround: boolean;
    clock: THREE.Clock; coinRotation: number; enemyDir: number[];
    attackCooldown: number; emotionTimer: number; invincible: number;
    coopSyncTimer: number; lastChatId: number;
  }>({
    platforms:[], coins:[], enemies:[], projectiles:[], waveEffects:[], pawEffects:[],
    keys:{ left:false, right:false, jump:false },
    velocity: new THREE.Vector3(), onGround:false,
    clock: new THREE.Clock(), coinRotation:0, enemyDir:[],
    attackCooldown:0, emotionTimer:0, invincible:0,
    coopSyncTimer:0, lastChatId:0,
  });

  const [gameState, setGameState] = useState<GameState>({
    coins:0, lives:3, score:0, status:"playing",
    emotion:"idle", attackType:null, hasPartner:false, zone:"🌲 Лесной лес",
  });
  const [totalCoins, setTotalCoins] = useState(0);
  const stateRef = useRef(gameState); stateRef.current = gameState;

  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const playerId = getPlayerId();
  const joyRef = useRef({ active:false, startX:0, startY:0, dx:0, dy:0 });

  const setEmotion = useCallback((em: Emotion, dur = 1200) => {
    const g = gRef.current; g.emotionTimer = dur;
    setGameState(prev => ({ ...prev, emotion: em }));
    if (!g.bear) return;
    const body = (g.bear as THREE.Group & { bodyMesh?: THREE.Mesh }).bodyMesh;
    if (body) (body.material as THREE.MeshLambertMaterial).color.setHex(EMOTION_COLORS[em]);
    if (em === "happy")  g.velocity.y = Math.max(g.velocity.y, 4);
    if (em === "angry")  g.bear.scale.set(1.15,1.15,1.15);
    if (em === "scared") g.bear.rotation.z = 0.25;
  }, []);

  const resetEmotion = useCallback(() => {
    const g = gRef.current; if (!g.bear) return;
    const body = (g.bear as THREE.Group & { bodyMesh?: THREE.Mesh }).bodyMesh;
    if (body) (body.material as THREE.MeshLambertMaterial).color.setHex(EMOTION_COLORS.idle);
    g.bear.scale.set(1,1,1); g.bear.rotation.z = 0;
    setGameState(prev => ({ ...prev, emotion:"idle", attackType:null }));
  }, []);

  const resetBear = useCallback(() => {
    const g = gRef.current; if (!g.bear) return;
    g.bear.position.set(0, 1.5, 0); g.velocity.set(0,0,0); g.onGround=false; g.invincible=2000;
    setEmotion("hurt", 800);
  }, [setEmotion]);

  const doPawAttack = useCallback(() => {
    const g = gRef.current; if (!g.bear||g.attackCooldown>0) return;
    g.attackCooldown=600; setEmotion("angry",500);
    setGameState(p=>({...p,attackType:"paw"}));
    const dir = g.bear.rotation.y>0?1:-1;
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.7,8,6), new THREE.MeshLambertMaterial({color:0xffaa00,transparent:true,opacity:0.7}));
    paw.position.copy(g.bear.position).add(new THREE.Vector3(dir*1.1,0,0));
    g.scene?.add(paw); g.pawEffects.push({mesh:paw,life:300});
    g.enemies.forEach(e => { if(!e.visible)return; if(g.bear!.position.distanceTo(e.position)<1.8){e.visible=false;setGameState(p=>({...p,score:p.score+300}));} });
  }, [setEmotion]);

  const doRockAttack = useCallback(() => {
    const g = gRef.current; if (!g.bear||g.attackCooldown>0) return;
    g.attackCooldown=900; setEmotion("angry",400);
    setGameState(p=>({...p,attackType:"rock"}));
    const rock = new THREE.Mesh(new THREE.SphereGeometry(0.22,8,6), new THREE.MeshLambertMaterial({color:0x888888}));
    rock.position.copy(g.bear.position).add(new THREE.Vector3(0,0.4,0));
    g.scene?.add(rock);
    g.projectiles.push({mesh:rock, vx:(g.bear.rotation.y>0?1:-1)*14, life:2000});
  }, [setEmotion]);

  const doWaveAttack = useCallback(() => {
    const g = gRef.current; if (!g.bear||g.attackCooldown>0) return;
    g.attackCooldown=1200; setEmotion("angry",600);
    setGameState(p=>({...p,attackType:"wave"}));
    const wave = new THREE.Mesh(new THREE.RingGeometry(0.3,2.2,16), new THREE.MeshLambertMaterial({color:0x44aaff,transparent:true,opacity:0.6,side:THREE.DoubleSide}));
    wave.rotation.x=-Math.PI/2; wave.position.copy(g.bear.position);
    g.scene?.add(wave); g.waveEffects.push({mesh:wave,life:500});
    g.enemies.forEach(e => { if(!e.visible)return; if(g.bear!.position.distanceTo(e.position)<2.5){e.visible=false;setGameState(p=>({...p,score:p.score+250}));} });
  }, [setEmotion]);

  const sendChat = useCallback(async (text: string) => {
    if (!coopCode||!text.trim()) return;
    try {
      await fetch(`${COOP_URL}?action=chat`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({code:coopCode, player_id:playerId, message:text.trim()}),
      });
    } catch (_) { /* ignore */ }
  }, [coopCode, playerId]);

  const syncCoop = useCallback(async () => {
    if (!coopCode) return;
    const g = gRef.current; if (!g.bear) return;
    try {
      const coinsStr = g.coins.map((c,i)=>c.visible?"":String(i)).filter(Boolean).join(",");
      const enemiesStr = g.enemies.map((e,i)=>e.visible?"":String(i)).filter(Boolean).join(",");
      const res = await fetch(`${COOP_URL}?action=sync`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          code:coopCode, player_id:playerId,
          x:g.bear.position.x, y:g.bear.position.y,
          emotion:stateRef.current.emotion,
          coins_collected:coinsStr, enemies_alive:enemiesStr,
          since_id:g.lastChatId,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setGameState(prev=>({...prev,hasPartner:data.has_partner}));
      const pd = coopRole==="host"?data.guest:data.host;
      if (g.partnerBear&&data.has_partner) {
        g.partnerBear.visible=true;
        g.partnerBear.position.x+=(pd.x-g.partnerBear.position.x)*0.35;
        g.partnerBear.position.y+=(pd.y-g.partnerBear.position.y)*0.35;
        const pb=(g.partnerBear as THREE.Group & {bodyMesh?:THREE.Mesh}).bodyMesh;
        if(pb)(pb.material as THREE.MeshLambertMaterial).color.setHex(EMOTION_COLORS[(pd.emotion||"idle") as Emotion]);
      }
      if (data.messages?.length) {
        const msgs = data.messages as ChatMsg[];
        g.lastChatId = msgs[msgs.length-1].id;
        setChatMessages(prev => {
          const ids = new Set(prev.map(m=>m.id));
          const newMsgs = msgs.filter(m=>!ids.has(m.id));
          if (newMsgs.length) setUnread(u=>u+newMsgs.length);
          return [...prev,...newMsgs].slice(-60);
        });
      }
    } catch (_) { /* ignore */ }
  }, [coopCode, coopRole, playerId]);

  useEffect(() => {
    const mount = mountRef.current; if (!mount) return;
    const g = gRef.current;

    const renderer = new THREE.WebGLRenderer({antialias:true});
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x87ceeb);
    mount.appendChild(renderer.domElement); g.renderer=renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x87ceeb, 40, 130);
    g.scene=scene;

    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth/mount.clientHeight, 0.1, 200);
    camera.position.set(0,5,12); g.camera=camera;

    scene.add(new THREE.AmbientLight(0xffeebb,0.7));
    const sun = new THREE.DirectionalLight(0xfff5cc,1.4);
    sun.position.set(20,40,20); sun.castShadow=true;
    sun.shadow.mapSize.set(1024,1024);
    sun.shadow.camera.left=-60; sun.shadow.camera.right=60;
    sun.shadow.camera.top=40; sun.shadow.camera.bottom=-40; sun.shadow.camera.far=200;
    scene.add(sun);

    // Ground per zone
    ZONE_DEFS.forEach(zone => {
      const len = zone.end-zone.start, cx=zone.start+len/2;
      const gr = new THREE.Mesh(new THREE.BoxGeometry(len,1,40), new THREE.MeshLambertMaterial({color:zone.ground}));
      gr.position.set(cx,-0.5,0); gr.receiveShadow=true; scene.add(gr); g.platforms.push(gr);
      const dr = new THREE.Mesh(new THREE.BoxGeometry(len,2,40), new THREE.MeshLambertMaterial({color:zone.dirt}));
      dr.position.set(cx,-1.5,0); scene.add(dr);
    });

    // Platforms
    const pDefs = [
      // Forest 0-120
      {x:8,y:2,z:0,w:4,d:3,c:0x8BC34A},{x:14,y:3.5,z:0,w:3,d:3,c:0x7CB342},
      {x:22,y:2.5,z:0,w:5,d:3,c:0x66BB6A},{x:30,y:4,z:-1,w:3,d:3,c:0x558B2F},
      {x:38,y:2.5,z:0,w:4,d:3,c:0x8BC34A},{x:46,y:5,z:1,w:3,d:3,c:0x7CB342},
      {x:55,y:3,z:0,w:6,d:3,c:0x8BC34A},{x:65,y:1.5,z:0,w:4,d:3,c:0x558B2F},
      {x:75,y:4,z:0,w:3,d:3,c:0x8BC34A},{x:85,y:2,z:0,w:5,d:3,c:0x7CB342},
      {x:100,y:3,z:0,w:4,d:3,c:0x66BB6A},{x:112,y:2,z:0,w:5,d:3,c:0x8BC34A},
      // Snow 120-240
      {x:128,y:3,z:0,w:4,d:3,c:0xddeeff},{x:136,y:5,z:0,w:3,d:3,c:0xbbddff},
      {x:145,y:3.5,z:0,w:5,d:3,c:0xcceeff},{x:155,y:6.5,z:0,w:3,d:3,c:0xaaccee},
      {x:165,y:4,z:0,w:4,d:3,c:0xddeeff},{x:175,y:2.5,z:0,w:4,d:3,c:0xbbddff},
      {x:185,y:5,z:0,w:3,d:3,c:0xcceeff},{x:198,y:3,z:0,w:6,d:3,c:0xddeeff},
      {x:212,y:4.5,z:0,w:4,d:3,c:0xaaccee},{x:228,y:2,z:0,w:5,d:3,c:0xbbddff},
      // Beach 240-360
      {x:248,y:2,z:0,w:4,d:3,c:0xf5d060},{x:258,y:3.5,z:0,w:4,d:3,c:0xe8b840},
      {x:270,y:2,z:0,w:5,d:3,c:0xf0c840},{x:282,y:4.5,z:0,w:3,d:3,c:0xd4a020},
      {x:295,y:3,z:0,w:4,d:3,c:0xf5d060},{x:308,y:2,z:0,w:5,d:3,c:0xe8b840},
      {x:320,y:5,z:0,w:3,d:3,c:0xf0c840},{x:335,y:3,z:0,w:5,d:3,c:0xd4a020},
      {x:348,y:2,z:0,w:4,d:3,c:0xf5d060},
      // Volcano 360-480
      {x:368,y:3,z:0,w:3,d:3,c:0x7a1a00},{x:377,y:5.5,z:0,w:3,d:3,c:0x6a1000},
      {x:388,y:3.5,z:0,w:4,d:3,c:0x7a1a00},{x:400,y:6.5,z:0,w:3,d:3,c:0x8a2200},
      {x:412,y:4,z:0,w:4,d:3,c:0x7a1a00},{x:425,y:2.5,z:0,w:5,d:3,c:0x6a1000},
      {x:438,y:5.5,z:0,w:3,d:3,c:0x8a2200},{x:453,y:3,z:0,w:6,d:3,c:0x7a1a00},
      {x:468,y:4,z:0,w:4,d:3,c:0x6a1000},
      // Cloud 480+
      {x:492,y:4.5,z:0,w:5,d:3,c:0xffffff},{x:503,y:7,z:0,w:3,d:3,c:0xeeeeff},
      {x:514,y:5,z:0,w:4,d:3,c:0xffffff},{x:526,y:8,z:0,w:3,d:3,c:0xddeeff},
      {x:538,y:5.5,z:0,w:5,d:3,c:0xffffff},{x:552,y:4,z:0,w:4,d:3,c:0xeeeeff},
      {x:562,y:6,z:0,w:5,d:3,c:0xffffff},
    ];
    pDefs.forEach(p => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.w,0.6,p.d), new THREE.MeshLambertMaterial({color:p.c}));
      mesh.position.set(p.x,p.y,p.z); mesh.castShadow=true; mesh.receiveShadow=true;
      scene.add(mesh); g.platforms.push(mesh);
      const topC = new THREE.Color(p.c); topC.addScalar(0.1);
      const top = new THREE.Mesh(new THREE.BoxGeometry(p.w,0.1,p.d), new THREE.MeshLambertMaterial({color:topC}));
      top.position.set(p.x,p.y+0.35,p.z); scene.add(top);
    });

    // Coins
    const cPos: [number,number,number][] = [
      [4,1.8,0],[5,1.8,0],[6,1.8,0],[8,3.5,0],[14,5,0],[22,4,0],[30,5.5,0],
      [38,4,0],[46,6.5,0],[55,4.5,0],[65,3,0],[75,5.5,0],[85,3.5,0],[100,4.5,0],[112,3.5,0],
      [128,4.5,0],[136,6.5,0],[145,5,0],[155,8,0],[165,5.5,0],[175,4,0],[185,6.5,0],[198,4.5,0],[212,6,0],[228,3.5,0],
      [248,3.5,0],[258,5,0],[270,3.5,0],[282,6,0],[295,4.5,0],[308,3.5,0],[320,6.5,0],[335,4.5,0],[348,3.5,0],
      [368,4.5,0],[377,7,0],[388,5,0],[400,8,0],[412,5.5,0],[425,4,0],[438,7,0],[453,4.5,0],[468,5.5,0],
      [492,6,0],[503,8.5,0],[514,6.5,0],[526,9.5,0],[538,7,0],[552,5.5,0],[562,7.5,0],
    ];
    const coinGeo = new THREE.CylinderGeometry(0.28,0.28,0.1,12);
    const coinMat = new THREE.MeshLambertMaterial({color:0xFFD700,emissive:0xFFAA00,emissiveIntensity:0.3});
    cPos.forEach(([cx,cy,cz]) => {
      const coin = new THREE.Mesh(coinGeo,coinMat);
      coin.position.set(cx,cy,cz); coin.rotation.x=Math.PI/2; coin.castShadow=true;
      scene.add(coin); g.coins.push(coin);
    });
    setTotalCoins(cPos.length);

    // Enemies
    const eDefs: [number,number,number,number][] = [
      [12,1,0,0xe53935],[25,1,0,0xe53935],[45,1,0,0xe53935],[68,1,0,0xe53935],[95,1,0,0xe53935],
      [130,1,0,0x5588ff],[155,1,0,0x5588ff],[178,1,0,0x5588ff],[210,1,0,0x5588ff],[232,1,0,0x5588ff],
      [258,1,0,0xffbb00],[285,1,0,0xffbb00],[310,1,0,0xffbb00],[340,1,0,0xffbb00],[355,1,0,0xffbb00],
      [370,1,0,0xff4400],[392,1,0,0xff4400],[415,1,0,0xff4400],[440,1,0,0xff4400],[465,1,0,0xff4400],
      [495,4.5,0,0xaaddff],[516,4.5,0,0xaaddff],[540,5.5,0,0xaaddff],[560,5.5,0,0xaaddff],
    ];
    eDefs.forEach(([ex,ey,ez,ec]) => {
      const enemy = new THREE.Mesh(new THREE.SphereGeometry(0.4,8,6), new THREE.MeshLambertMaterial({color:ec}));
      enemy.position.set(ex,ey,ez);
      const hc = new THREE.Color(ec); hc.multiplyScalar(0.6);
      const hm = new THREE.MeshLambertMaterial({color:hc});
      for (const hx of [-0.2,0,0.2]) { const horn=new THREE.Mesh(new THREE.ConeGeometry(0.1,0.3,4),hm); horn.position.set(hx,0.55,0); enemy.add(horn); }
      scene.add(enemy); g.enemies.push(enemy); g.enemyDir.push(1);
    });

    // ── DECOR ──────────────────────────────────────────────────────────────
    // Forest trees
    for (let x=-5; x<118; x+=7+Math.random()*4) {
      for (const z of [-10-Math.random()*5, 10+Math.random()*5]) {
        const tree=new THREE.Group();
        const tr=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.3,1.8,8),new THREE.MeshLambertMaterial({color:0x6D4C41}));
        tr.position.y=0.9; tree.add(tr);
        [[1.4,2.0,0x388E3C,2.6],[1.0,1.6,0x43A047,3.8],[0.6,1.2,0x66BB6A,4.8]].forEach(([r,h,c,py])=>{
          const l=new THREE.Mesh(new THREE.ConeGeometry(r as number,h as number,8),new THREE.MeshLambertMaterial({color:c as number}));
          l.position.y=py as number; tree.add(l);
        });
        tree.position.set(x,0,z as number); scene.add(tree);
      }
    }
    // Snow pines
    for (let x=122; x<238; x+=8+Math.random()*3) {
      for (const z of [-9-Math.random()*4, 9+Math.random()*4]) {
        const tree=new THREE.Group();
        const tr=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.28,1.6,8),new THREE.MeshLambertMaterial({color:0x5d8aa8}));
        tr.position.y=0.8; tree.add(tr);
        [[1.2,1.8,0xaaddff,2.4],[0.8,1.4,0xbbeeFF,3.5],[0.5,1.0,0xffffff,4.3]].forEach(([r,h,c,py])=>{
          const l=new THREE.Mesh(new THREE.ConeGeometry(r as number,h as number,8),new THREE.MeshLambertMaterial({color:c as number}));
          l.position.y=py as number; tree.add(l);
        });
        tree.position.set(x,0,z as number); scene.add(tree);
        const cap=new THREE.Mesh(new THREE.SphereGeometry(0.5,8,6),new THREE.MeshLambertMaterial({color:0xffffff}));
        cap.scale.set(1,0.4,1); cap.position.set(x,4.5,z as number); scene.add(cap);
      }
    }
    // Beach palms + water
    for (let x=243; x<358; x+=12+Math.random()*4) {
      for (const z of [-10-Math.random()*4, 10+Math.random()*4]) {
        const palm=new THREE.Group();
        const tr=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.22,3,8),new THREE.MeshLambertMaterial({color:0xa0522d}));
        tr.position.y=1.5; palm.add(tr);
        const lm2=new THREE.MeshLambertMaterial({color:0x2e8b57});
        for (let li=0;li<5;li++) {
          const leaf=new THREE.Mesh(new THREE.ConeGeometry(0.3,1.4,4),lm2);
          const ang=(li/5)*Math.PI*2;
          leaf.position.set(Math.cos(ang)*0.6,3.4,Math.sin(ang)*0.6);
          leaf.rotation.z=Math.PI/3; leaf.rotation.y=ang; palm.add(leaf);
        }
        palm.position.set(x,0,z as number); scene.add(palm);
      }
    }
    const water=new THREE.Mesh(new THREE.PlaneGeometry(120,8),new THREE.MeshLambertMaterial({color:0x2196f3,transparent:true,opacity:0.5}));
    water.rotation.x=-Math.PI/2; water.position.set(300,0.01,-18); scene.add(water);
    // Beach umbrellas
    for (let i=0;i<5;i++) {
      const umb=new THREE.Group();
      const pole2=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,2,6),new THREE.MeshLambertMaterial({color:0xffccaa}));
      pole2.position.y=1; umb.add(pole2);
      const top2=new THREE.Mesh(new THREE.ConeGeometry(1.2,0.5,8),new THREE.MeshLambertMaterial({color:[0xff5522,0xffdd00,0xff5522,0x22bbff,0xff5522][i]}));
      top2.position.y=2.2; umb.add(top2);
      umb.position.set(252+i*22,0,(i%2===0?-7:7)); scene.add(umb);
    }
    // Volcano rocks + lava
    for (let x=362; x<478; x+=5+Math.random()*4) {
      const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(0.4+Math.random()*0.5,0),new THREE.MeshLambertMaterial({color:0x4a1000}));
      rock.position.set(x,0.3,(Math.random()-0.5)*20); scene.add(rock);
    }
    for (let i=0;i<7;i++) {
      const lava=new THREE.Mesh(new THREE.PlaneGeometry(6+Math.random()*4,4),new THREE.MeshLambertMaterial({color:0xff4400,emissive:0xff2200,emissiveIntensity:0.5}));
      lava.rotation.x=-Math.PI/2; lava.position.set(365+i*16,0.02,(Math.random()-0.5)*12); scene.add(lava);
    }
    const vol=new THREE.Mesh(new THREE.ConeGeometry(18,30,8),new THREE.MeshLambertMaterial({color:0x4a1500}));
    vol.position.set(420,15,-28); scene.add(vol);
    const lvCap=new THREE.Mesh(new THREE.ConeGeometry(5,4,8),new THREE.MeshLambertMaterial({color:0xff4400,emissive:0xff2200,emissiveIntensity:0.6}));
    lvCap.position.set(420,31,-28); scene.add(lvCap);
    // Volcano particles (static glows)
    for (let i=0;i<12;i++) {
      const spark=new THREE.Mesh(new THREE.SphereGeometry(0.18,6,4),new THREE.MeshLambertMaterial({color:0xff6600,emissive:0xff4400,emissiveIntensity:0.8}));
      spark.position.set(415+Math.random()*10,16+Math.random()*8,-25+Math.random()*6); scene.add(spark);
    }
    // Cloud castle
    const cbase=new THREE.Mesh(new THREE.BoxGeometry(14,3,10),new THREE.MeshLambertMaterial({color:0xf0e8d0}));
    cbase.position.set(540,8,-5); scene.add(cbase);
    for (const [tx,tz] of [[-5,-3],[5,-3],[-5,3],[5,3]]) {
      const tower=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.2,5,8),new THREE.MeshLambertMaterial({color:0xe0d8c0}));
      tower.position.set(540+tx,11,-5+tz); scene.add(tower);
      const roof2=new THREE.Mesh(new THREE.ConeGeometry(1.6,2,8),new THREE.MeshLambertMaterial({color:0xcc4444}));
      roof2.position.set(540+tx,14,-5+tz); scene.add(roof2);
    }
    const gate=new THREE.Mesh(new THREE.BoxGeometry(3,3,1),new THREE.MeshLambertMaterial({color:0x5a3a1a}));
    gate.position.set(540,9,0.5); scene.add(gate);
    // Floating cloud platforms (bg decor)
    for (let i=0;i<18;i++) {
      const cl=new THREE.Group();
      [0,0.5,-0.5,0.9,-0.9].forEach((ox,ci)=>{
        const puff=new THREE.Mesh(new THREE.SphereGeometry(0.5+(ci===0?0.3:0),8,6),new THREE.MeshLambertMaterial({color:0xffffff}));
        puff.position.set(ox,ci===0?0.2:0,0); cl.add(puff);
      });
      cl.position.set(483+i*6,9+Math.sin(i)*2,-16+Math.random()*8);
      cl.scale.setScalar(1.1+Math.random()*0.5); scene.add(cl);
    }
    // Sky clouds everywhere
    for (let i=0;i<24;i++) {
      const cl=new THREE.Group();
      [0,0.6,-0.6,1.1,-1.1].forEach((cx,ci)=>{
        const puff=new THREE.Mesh(new THREE.SphereGeometry(0.4+(ci===0?0.2:0),8,6),new THREE.MeshLambertMaterial({color:0xffffff}));
        puff.position.set(cx,ci===0?0.1:0,0); cl.add(puff);
      });
      cl.position.set(i*28-10,15+Math.random()*5,-18+Math.random()*10);
      cl.scale.setScalar(1.5+Math.random()*0.8); scene.add(cl);
    }
    // GOAL
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,6,6),new THREE.MeshLambertMaterial({color:0xbdbdbd}));
    pole.position.set(WORLD_END,3,0); scene.add(pole);
    const flag=new THREE.Mesh(new THREE.PlaneGeometry(1.5,1),new THREE.MeshLambertMaterial({color:0xFFD700,side:THREE.DoubleSide}));
    flag.position.set(WORLD_END+0.9,5.5,0); scene.add(flag);

    // Bears
    const bear=buildBear(0xc07840); bear.position.set(0,1.5,0); scene.add(bear); g.bear=bear;
    if (coopCode) {
      const partner=buildBear(0x4466dd); partner.position.set(2,1.5,0); partner.visible=false;
      scene.add(partner); g.partnerBear=partner;
    }

    // ── GAME LOOP ───────────────────────────────────────────────────────────
    const GRAVITY=-18, SPEED=7, JUMP=9;
    const bSize=new THREE.Vector3(0.9,1.7,0.9);
    const fogTarget=new THREE.Color(0x87ceeb);

    const animate=()=>{
      g.animFrameId=requestAnimationFrame(animate);
      const dt=Math.min(g.clock.getDelta(),0.05), dtMs=dt*1000;
      const state=stateRef.current;
      if(state.status!=="playing"||!g.bear){renderer.render(scene,camera);return;}

      if(g.attackCooldown>0) g.attackCooldown-=dtMs;
      if(g.invincible>0){g.invincible-=dtMs; g.bear.visible=Math.floor(g.invincible/100)%2===0;}
      else g.bear.visible=true;
      if(g.emotionTimer>0){g.emotionTimer-=dtMs; if(g.emotionTimer<=0)resetEmotion();}

      g.coopSyncTimer+=dtMs;
      if(coopCode&&g.coopSyncTimer>160){g.coopSyncTimer=0;syncCoop();}

      // Zone/fog
      const zone=getZone(g.bear.position.x);
      fogTarget.set(zone.fog);
      (scene.fog as THREE.Fog).color.lerp(fogTarget,0.025);
      renderer.setClearColor((scene.fog as THREE.Fog).color);
      const zLabel=zone.emoji+" "+zone.name;
      if(state.zone!==zLabel) setGameState(p=>({...p,zone:zLabel}));

      // Input
      const {keys,velocity,bear}=g;
      const jdx=joyRef.current.active?joyRef.current.dx/40:0;
      const left=keys.left||jdx<-0.2, right=keys.right||jdx>0.2;
      if(left){velocity.x=-SPEED;bear.rotation.y=-Math.PI*0.15;}
      else if(right){velocity.x=SPEED;bear.rotation.y=Math.PI*0.15;}
      else{velocity.x*=0.75;bear.rotation.y*=0.8;}
      if(keys.jump&&g.onGround){velocity.y=JUMP;g.onGround=false;keys.jump=false;}

      velocity.y+=GRAVITY*dt;
      bear.position.x+=velocity.x*dt;
      bear.position.y+=velocity.y*dt;
      bear.position.z+=(0-bear.position.z)*0.1;

      let nearEnemy=false;
      g.enemies.forEach(e=>{if(e.visible&&g.bear!.position.distanceTo(e.position)<2.5)nearEnemy=true;});
      if(nearEnemy&&state.emotion==="idle")setEmotion("scared",200);

      if(bear.position.y<-10){
        setGameState(p=>{const l=p.lives-1;return l<=0?{...p,lives:0,status:"dead"}:{...p,lives:l};});
        resetBear();return;
      }

      g.onGround=false;
      const bBox=new THREE.Box3().setFromCenterAndSize(bear.position,bSize);
      g.platforms.forEach(pl=>{
        const pb=new THREE.Box3().setFromObject(pl);
        if(!bBox.intersectsBox(pb))return;
        const bb=bear.position.y-bSize.y/2,pt=pb.max.y;
        const bt=bear.position.y+bSize.y/2,pb2=pb.min.y;
        if(velocity.y<=0&&bb<=pt&&bb>=pt-0.6){bear.position.y=pt+bSize.y/2;velocity.y=0;g.onGround=true;}
        else if(velocity.y>0&&bt>=pb2&&bt<=pb2+0.6){velocity.y=-0.5;}
        else{
          if(bear.position.x<pb.min.x+0.3)bear.position.x=pb.min.x-bSize.x/2;
          else if(bear.position.x>pb.max.x-0.3)bear.position.x=pb.max.x+bSize.x/2;
        }
      });

      g.coinRotation+=dt*2;
      g.coins.forEach((coin,i)=>{
        if(!coin.visible)return;
        coin.rotation.y=g.coinRotation;
        coin.position.y+=Math.sin(Date.now()*0.003+i)*0.003;
        if(bear.position.distanceTo(coin.position)<0.8){
          coin.visible=false; setEmotion("happy",700);
          setGameState(p=>({...p,coins:p.coins+1,score:p.score+100}));
        }
      });

      g.enemies.forEach((enemy,i)=>{
        if(!enemy.visible)return;
        enemy.position.x+=g.enemyDir[i]*2.5*dt;
        const base=enemy.userData.baseX||(enemy.userData.baseX=enemy.position.x);
        if(enemy.position.x>base+3)g.enemyDir[i]=-1;
        if(enemy.position.x<base-3)g.enemyDir[i]=1;
        enemy.rotation.y+=dt*2;
        if(g.invincible>0)return;
        const dist=bear.position.distanceTo(enemy.position);
        if(dist<1.0){
          const bb=bear.position.y-bSize.y/2;
          if(bb>enemy.position.y+0.1&&velocity.y<0){
            enemy.visible=false;velocity.y=6;setEmotion("happy",600);
            setGameState(p=>({...p,score:p.score+200}));
          } else {
            setGameState(p=>{const l=p.lives-1;return l<=0?{...p,lives:0,status:"dead"}:{...p,lives:l};});
            setEmotion("hurt",800);resetBear();
          }
        }
      });

      for(let pi=g.projectiles.length-1;pi>=0;pi--){
        const proj=g.projectiles[pi]; proj.life-=dtMs;
        proj.mesh.position.x+=proj.vx*dt; proj.mesh.rotation.y+=dt*5;
        g.enemies.forEach(e=>{
          if(!e.visible||proj.life<=0)return;
          if(proj.mesh.position.distanceTo(e.position)<0.7){e.visible=false;proj.life=0;setGameState(p=>({...p,score:p.score+300}));}
        });
        if(proj.life<=0){g.scene?.remove(proj.mesh);g.projectiles.splice(pi,1);}
      }
      for(let pi=g.pawEffects.length-1;pi>=0;pi--){
        const fx=g.pawEffects[pi]; fx.life-=dtMs;
        const t=1-fx.life/300;
        (fx.mesh.material as THREE.MeshLambertMaterial).opacity=0.7*(1-t);
        fx.mesh.scale.setScalar(1+t*0.5);
        if(fx.life<=0){g.scene?.remove(fx.mesh);g.pawEffects.splice(pi,1);}
      }
      for(let wi=g.waveEffects.length-1;wi>=0;wi--){
        const fx=g.waveEffects[wi]; fx.life-=dtMs;
        const t=1-fx.life/500;
        (fx.mesh.material as THREE.MeshLambertMaterial).opacity=0.6*(1-t);
        fx.mesh.scale.setScalar(1+t*1.5);
        if(fx.life<=0){g.scene?.remove(fx.mesh);g.waveEffects.splice(wi,1);}
      }

      if(bear.position.x>WORLD_END-2){setGameState(p=>({...p,status:"win"}));setEmotion("happy",9999);}

      camera.position.x+=(bear.position.x-camera.position.x)*0.08;
      camera.position.y+=(bear.position.y+5-camera.position.y)*0.08;
      camera.lookAt(bear.position.x,bear.position.y+1,0);
      renderer.render(scene,camera);
    };

    g.clock.start(); animate();

    const onResize=()=>{
      if(!mount)return;
      renderer.setSize(mount.clientWidth,mount.clientHeight);
      camera.aspect=mount.clientWidth/mount.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize",onResize);
    const onKeyDown=(e:KeyboardEvent)=>{
      if(e.key==="ArrowLeft"||e.key==="a")g.keys.left=true;
      if(e.key==="ArrowRight"||e.key==="d")g.keys.right=true;
      if(e.key===" "||e.key==="ArrowUp"||e.key==="w"){e.preventDefault();g.keys.jump=true;}
      if(e.key==="z"||e.key==="Z")doPawAttack();
      if(e.key==="x"||e.key==="X")doRockAttack();
      if(e.key==="c"||e.key==="C")doWaveAttack();
    };
    const onKeyUp=(e:KeyboardEvent)=>{
      if(e.key==="ArrowLeft"||e.key==="a")g.keys.left=false;
      if(e.key==="ArrowRight"||e.key==="d")g.keys.right=false;
      if(e.key===" "||e.key==="ArrowUp"||e.key==="w")g.keys.jump=false;
    };
    window.addEventListener("keydown",onKeyDown); window.addEventListener("keyup",onKeyUp);
    return()=>{
      if(g.animFrameId)cancelAnimationFrame(g.animFrameId);
      window.removeEventListener("resize",onResize);
      window.removeEventListener("keydown",onKeyDown); window.removeEventListener("keyup",onKeyUp);
      renderer.dispose();
      if(mount.contains(renderer.domElement))mount.removeChild(renderer.domElement);
    };
  },[resetBear,resetEmotion,setEmotion,doPawAttack,doRockAttack,doWaveAttack,syncCoop,coopCode]);

  useEffect(()=>{ if(chatOpen)chatEndRef.current?.scrollIntoView({behavior:"smooth"}); },[chatMessages,chatOpen]);

  const handleJoyStart=(e:React.TouchEvent)=>{
    const t=e.changedTouches[0];
    joyRef.current={active:true,startX:t.clientX,startY:t.clientY,dx:0,dy:0};
  };
  const handleJoyMove=(e:React.TouchEvent)=>{
    if(!joyRef.current.active)return;
    const t=e.changedTouches[0];
    joyRef.current.dx=t.clientX-joyRef.current.startX;
    joyRef.current.dy=t.clientY-joyRef.current.startY;
  };
  const handleJoyEnd=()=>{
    joyRef.current={active:false,startX:0,startY:0,dx:0,dy:0};
    gRef.current.keys.left=false; gRef.current.keys.right=false;
  };
  const handleJump=()=>{gRef.current.keys.jump=true;setTimeout(()=>{gRef.current.keys.jump=false;},120);};
  const restart=()=>{
    setGameState({coins:0,lives:3,score:0,status:"playing",emotion:"idle",attackType:null,hasPartner:!!coopCode,zone:"🌲 Лесной лес"});
    gRef.current.coins.forEach(c=>{c.visible=true;});
    gRef.current.enemies.forEach(e=>{e.visible=true;});
    gRef.current.enemyDir=gRef.current.enemies.map(()=>1);
    gRef.current.attackCooldown=0;
    resetBear();
  };

  const EMOTION_EMOJI:Record<Emotion,string>={idle:"",happy:"🎉",hurt:"😵",angry:"⚡",scared:"😨"};
  const ATTACK_LABEL:Record<NonNullable<AttackType>,string>={paw:"👊 Удар!",rock:"🪨 Бросок!",wave:"🌊 Волна!"};
  const jOff=joyRef.current.active?{x:Math.max(-35,Math.min(35,joyRef.current.dx)),y:Math.max(-35,Math.min(35,joyRef.current.dy))}:{x:0,y:0};
  const myRole=coopRole||"host";

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" style={{maxWidth:480,left:"50%",transform:"translateX(-50%)"}}>
      <div ref={mountRef} className="flex-1 w-full relative overflow-hidden">

        {/* HUD */}
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between pointer-events-none z-10">
          <div className="panel-wood px-3 py-1 flex items-center gap-1">
            {Array.from({length:3}).map((_,i)=>(
              <span key={i} className={`text-lg ${i<gameState.lives?"":"opacity-25"}`}>❤️</span>
            ))}
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="panel-wood px-3 py-1"><span className="font-game text-xs text-white">{gameState.zone}</span></div>
            {coopCode&&(
              <div className={`px-2 py-0.5 rounded-xl text-xs font-bold font-game ${gameState.hasPartner?"bg-green-500 text-white":"bg-gray-600 text-gray-300"}`}>
                {gameState.hasPartner?"👥 Онлайн":"⏳ Ждём..."}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1 items-end">
            <div className="coin-display px-2 py-0.5 font-game text-xs text-amber-900">🪙 {gameState.coins}/{totalCoins}</div>
            <div className="panel-wood px-2 py-0.5 font-game text-xs text-yellow-300">⭐ {gameState.score}</div>
          </div>
        </div>

        {/* Emotion */}
        {gameState.emotion!=="idle"&&(
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
            <div className="bg-white rounded-full px-4 py-2 shadow-lg border-2 border-amber-300 animate-bounce-in font-game text-2xl">
              {EMOTION_EMOJI[gameState.emotion]}
            </div>
          </div>
        )}
        {gameState.attackType&&(
          <div className="absolute top-32 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
            <div className="bg-orange-500 text-white rounded-2xl px-4 py-1 shadow font-game text-sm animate-bounce-in">
              {ATTACK_LABEL[gameState.attackType]}
            </div>
          </div>
        )}

        {/* Exit */}
        <button className="absolute z-20 btn-game px-3 py-1 text-xs" style={{top:52,left:12}} onClick={onExit}>✖ Выйти</button>

        {/* Chat button */}
        {coopCode&&(
          <button
            className="absolute z-20 rounded-2xl font-game text-xs px-3 py-1.5 pointer-events-auto"
            style={{top:52,right:12,background:"#0288d1",border:"2px solid #0277a8",boxShadow:"0 3px 0 #014e72",color:"white"}}
            onClick={()=>{setChatOpen(o=>!o);setUnread(0);}}
          >
            💬{unread>0&&!chatOpen?<span className="bg-red-500 text-white rounded-full px-1 ml-1 text-xs">{unread}</span>:" Чат"}
          </button>
        )}

        {/* Chat window */}
        {coopCode&&chatOpen&&(
          <div className="absolute z-30 right-2 bottom-2 w-64" style={{height:210}}>
            <div className="card-game h-full flex flex-col p-2">
              <div className="flex-1 overflow-y-auto flex flex-col gap-1 mb-2 pr-1">
                {chatMessages.length===0&&(
                  <div className="text-center text-amber-600 text-xs font-game mt-6">Напишите первое сообщение! 🐻</div>
                )}
                {chatMessages.map(m=>(
                  <div key={m.id} className={`flex ${m.role===myRole?"justify-end":"justify-start"}`}>
                    <div className="rounded-2xl px-2 py-1 text-xs max-w-[85%] font-body leading-snug"
                      style={{
                        background:m.role===myRole?"linear-gradient(135deg,#f5c842,#f5a623)":"linear-gradient(135deg,#4ec9e8,#2ab0d4)",
                        color:m.role===myRole?"#5a2d00":"#003a4a",
                        borderRadius:m.role===myRole?"14px 4px 14px 14px":"4px 14px 14px 14px",
                      }}
                    >
                      <span className="opacity-50 mr-0.5">{m.role==="host"?"🐻":"🐾"}</span>{m.text}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef}/>
              </div>
              <div className="flex gap-1">
                <input
                  className="flex-1 rounded-xl border-2 border-amber-300 bg-amber-50 text-xs px-2 py-1 text-amber-900 outline-none"
                  placeholder="Сообщение..."
                  value={chatInput}
                  onChange={e=>setChatInput(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter"&&chatInput.trim()){sendChat(chatInput);setChatInput("");}}}
                  maxLength={120}
                />
                <button className="btn-game px-2 py-1 text-xs"
                  onClick={()=>{if(chatInput.trim()){sendChat(chatInput);setChatInput("");}}}
                >▶</button>
              </div>
            </div>
          </div>
        )}

        {/* Win */}
        {gameState.status==="win"&&(
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-30">
            <div className="card-game p-6 text-center mx-6 animate-bounce-in">
              <div className="text-5xl mb-2">🎉</div>
              <div className="font-game text-2xl text-amber-900 mb-1">Мир пройден!</div>
              <div className="font-game text-lg text-amber-700 mb-3">🪙 {gameState.coins}/{totalCoins} · ⭐ {gameState.score}</div>
              <StarBar count={gameState.coins>=totalCoins?3:gameState.coins>=Math.floor(totalCoins*0.6)?2:1}/>
              <div className="flex gap-3 mt-4">
                <button className="btn-game flex-1 py-2 text-sm" onClick={restart}>🔄 Заново</button>
                <button className="btn-game flex-1 py-2 text-sm" onClick={onExit}>🗺️ Карта</button>
              </div>
            </div>
          </div>
        )}
        {/* Dead */}
        {gameState.status==="dead"&&(
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
      <div className="flex items-center justify-between px-4 pb-3 pt-2 gap-2"
        style={{background:"linear-gradient(180deg,rgba(0,0,0,0.7) 0%,rgba(0,0,0,0.9) 100%)"}}>
        <div className="relative flex items-center justify-center rounded-full flex-shrink-0"
          style={{width:90,height:90,background:"rgba(255,255,255,0.1)",border:"3px solid rgba(255,255,255,0.25)"}}
          onTouchStart={handleJoyStart} onTouchMove={handleJoyMove} onTouchEnd={handleJoyEnd}>
          <div className="absolute rounded-full" style={{
            width:40,height:40,
            background:"radial-gradient(circle at 40% 35%,#f5c842,#d4881e)",
            border:"3px solid #a36010",boxShadow:"0 3px 8px rgba(0,0,0,0.5)",
            transform:`translate(${jOff.x}px,${jOff.y}px)`,
            transition:joyRef.current.active?"none":"transform 0.15s ease",
          }}/>
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          {[
            {label:"👊 ATK",bg:"#e65c00",sh:"#7a2e00",fn:doPawAttack},
            {label:"🪨 ROCK",bg:"#607d8b",sh:"#263238",fn:doRockAttack},
            {label:"🌊 WAVE",bg:"#0288d1",sh:"#014e72",fn:doWaveAttack},
          ].map(b=>(
            <button key={b.label}
              className="rounded-2xl font-game text-xs text-white px-3 py-1 active:scale-90 transition-transform"
              style={{background:b.bg,border:`2px solid ${b.sh}`,boxShadow:`0 3px 0 ${b.sh}`,WebkitTapHighlightColor:"transparent"}}
              onTouchStart={e=>{e.preventDefault();b.fn();}} onMouseDown={b.fn}
            >{b.label}</button>
          ))}
        </div>
        <button
          className="flex items-center justify-center rounded-full flex-shrink-0 active:scale-90 transition-transform"
          style={{
            width:80,height:80,
            background:"radial-gradient(circle at 40% 35%,#5cb84a,#2d6b22)",
            border:"4px solid #1e4a17",boxShadow:"0 5px 0 #1e4a17",
            fontFamily:"'Fredoka One',cursive",fontSize:13,color:"white",
            textShadow:"0 1px 0 rgba(0,0,0,0.4)",WebkitTapHighlightColor:"transparent",
          }}
          onTouchStart={e=>{e.preventDefault();handleJump();}} onMouseDown={handleJump}
        >ПРЫЖОК</button>
      </div>
    </div>
  );
}

function StarBar({count,max=3}:{count:number;max?:number}){
  return(
    <div className="flex gap-1 justify-center">
      {Array.from({length:max}).map((_,i)=>(<span key={i} className={`text-2xl ${i<count?"":"opacity-25"}`}>⭐</span>))}
    </div>
  );
}
