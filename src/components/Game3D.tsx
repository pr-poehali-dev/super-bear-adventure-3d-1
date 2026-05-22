import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";

interface GameState {
  coins: number;
  lives: number;
  score: number;
  status: "playing" | "dead" | "win" | "paused";
}

interface Props {
  onExit: () => void;
  worldName: string;
  worldEmoji: string;
}

export default function Game3D({ onExit, worldName, worldEmoji }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<{
    renderer?: THREE.WebGLRenderer;
    scene?: THREE.Scene;
    camera?: THREE.PerspectiveCamera;
    bear?: THREE.Group;
    platforms: THREE.Mesh[];
    coins: THREE.Mesh[];
    enemies: THREE.Mesh[];
    trees: THREE.Group[];
    animFrameId?: number;
    keys: { left: boolean; right: boolean; jump: boolean; forward: boolean };
    velocity: THREE.Vector3;
    onGround: boolean;
    bearBox: THREE.Box3;
    clock: THREE.Clock;
    coinRotation: number;
    enemyDir: number[];
  }>({
    platforms: [],
    coins: [],
    enemies: [],
    trees: [],
    keys: { left: false, right: false, jump: false, forward: false },
    velocity: new THREE.Vector3(),
    onGround: false,
    bearBox: new THREE.Box3(),
    clock: new THREE.Clock(),
    coinRotation: 0,
    enemyDir: [],
  });

  const [gameState, setGameState] = useState<GameState>({
    coins: 0,
    lives: 3,
    score: 0,
    status: "playing",
  });
  const [totalCoins, setTotalCoins] = useState(0);
  const stateRef = useRef(gameState);
  stateRef.current = gameState;

  // Joystick state
  const joyRef = useRef({ active: false, startX: 0, startY: 0, dx: 0, dy: 0 });

  const resetBear = useCallback(() => {
    const g = gameRef.current;
    if (!g.bear) return;
    g.bear.position.set(0, 1.5, 0);
    g.velocity.set(0, 0, 0);
    g.onGround = false;
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const g = gameRef.current;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x87ceeb);
    mount.appendChild(renderer.domElement);
    g.renderer = renderer;

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x87ceeb, 0.025);
    g.scene = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 200);
    camera.position.set(0, 5, 12);
    g.camera = camera;

    // Lights
    const ambient = new THREE.AmbientLight(0xffeebb, 0.7);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff5cc, 1.4);
    sun.position.set(20, 40, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    scene.add(sun);

    // Sky gradient via background
    const skyGeo = new THREE.SphereGeometry(100, 16, 8);
    skyGeo.scale(-1, 1, 1);
    const skyMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
    });
    const skyColors: number[] = [];
    const posArr = skyGeo.attributes.position.array;
    const col = new THREE.Color();
    for (let i = 0; i < posArr.length / 3; i++) {
      const y = posArr[i * 3 + 1];
      const t = Math.max(0, Math.min(1, (y + 50) / 100));
      col.lerpColors(new THREE.Color(0xb8f0ff), new THREE.Color(0x2980b9), 1 - t);
      skyColors.push(col.r, col.g, col.b);
    }
    skyGeo.setAttribute("color", new THREE.Float32BufferAttribute(skyColors, 3));
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    // ── LEVEL GEOMETRY ────────────────────────────────────────────────────────

    // Ground
    const groundGeo = new THREE.BoxGeometry(200, 1, 40);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x4caf50 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.set(50, -0.5, 0);
    ground.receiveShadow = true;
    scene.add(ground);
    g.platforms.push(ground);

    // Ground dirt side
    const dirtMat = new THREE.MeshLambertMaterial({ color: 0x8B5E3C });
    const dirt = new THREE.Mesh(new THREE.BoxGeometry(200, 2, 40), dirtMat);
    dirt.position.set(50, -1.5, 0);
    scene.add(dirt);

    // Decorative grass tufts on top
    for (let i = 0; i < 30; i++) {
      const gx = Math.random() * 160 - 10;
      const gz = (Math.random() - 0.5) * 30;
      const tuftGeo = new THREE.ConeGeometry(0.2, 0.5, 4);
      const tuftMat = new THREE.MeshLambertMaterial({ color: 0x66bb6a });
      const tuft = new THREE.Mesh(tuftGeo, tuftMat);
      tuft.position.set(gx, 0.25, gz);
      scene.add(tuft);
    }

    // Floating platforms
    const platformData = [
      { x: 8, y: 2, z: 0, w: 4, d: 3, color: 0x8BC34A },
      { x: 14, y: 3.5, z: 0, w: 3, d: 3, color: 0x7CB342 },
      { x: 20, y: 2, z: 1, w: 5, d: 3, color: 0x8BC34A },
      { x: 28, y: 4, z: -1, w: 3, d: 3, color: 0x558B2F },
      { x: 34, y: 2.5, z: 0, w: 4, d: 3, color: 0x8BC34A },
      { x: 42, y: 5, z: 1, w: 3, d: 3, color: 0x7CB342 },
      { x: 50, y: 3, z: 0, w: 6, d: 3, color: 0x8BC34A },
      { x: 58, y: 1.5, z: 0, w: 4, d: 3, color: 0x558B2F },
      { x: 66, y: 4, z: 0, w: 3, d: 3, color: 0x7CB342 },
      { x: 74, y: 2, z: 0, w: 5, d: 3, color: 0x8BC34A },
    ];
    platformData.forEach(p => {
      const pGeo = new THREE.BoxGeometry(p.w, 0.6, p.d);
      const pMat = new THREE.MeshLambertMaterial({ color: p.color });
      const mesh = new THREE.Mesh(pGeo, pMat);
      mesh.position.set(p.x, p.y, p.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      g.platforms.push(mesh);

      // Green top strip
      const topGeo = new THREE.BoxGeometry(p.w, 0.12, p.d);
      const topMat = new THREE.MeshLambertMaterial({ color: 0x66bb6a });
      const top = new THREE.Mesh(topGeo, topMat);
      top.position.set(p.x, p.y + 0.36, p.z);
      scene.add(top);
    });

    // ── BEAR ──────────────────────────────────────────────────────────────────
    const bear = new THREE.Group();
    // Body
    const bodyGeo = new THREE.SphereGeometry(0.55, 12, 8);
    bodyGeo.scale(1, 1.1, 0.9);
    const bearMat = new THREE.MeshLambertMaterial({ color: 0xc07840 });
    const body = new THREE.Mesh(bodyGeo, bearMat);
    body.castShadow = true;
    bear.add(body);
    // Head
    const headGeo = new THREE.SphereGeometry(0.42, 12, 8);
    const head = new THREE.Mesh(headGeo, bearMat);
    head.position.set(0, 0.75, 0.1);
    head.castShadow = true;
    bear.add(head);
    // Ears
    const earGeo = new THREE.SphereGeometry(0.14, 8, 6);
    [-0.28, 0.28].forEach(ex => {
      const ear = new THREE.Mesh(earGeo, bearMat);
      ear.position.set(ex, 1.1, 0.05);
      bear.add(ear);
      const innerEar = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), new THREE.MeshLambertMaterial({ color: 0xe8a080 }));
      innerEar.position.set(ex, 1.1, 0.14);
      bear.add(innerEar);
    });
    // Snout
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshLambertMaterial({ color: 0xe8c090 }));
    snout.scale.set(1, 0.7, 0.8);
    snout.position.set(0, 0.65, 0.48);
    bear.add(snout);
    // Eyes
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const eyeGeo = new THREE.SphereGeometry(0.06, 6, 5);
    [-0.15, 0.15].forEach(ex => {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(ex, 0.82, 0.42);
      bear.add(eye);
    });
    // Nose
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshLambertMaterial({ color: 0x333333 }));
    nose.position.set(0, 0.68, 0.55);
    bear.add(nose);
    // Belly
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), new THREE.MeshLambertMaterial({ color: 0xe8c090 }));
    belly.scale.set(1, 1.2, 0.5);
    belly.position.set(0, -0.05, 0.42);
    bear.add(belly);
    // Legs
    const legGeo = new THREE.CapsuleGeometry(0.12, 0.3, 4, 6);
    const legMat = new THREE.MeshLambertMaterial({ color: 0xa06030 });
    [[-0.25, -0.5, 0], [0.25, -0.5, 0], [-0.2, -0.3, 0.35], [0.2, -0.3, 0.35]].forEach(([lx, ly, lz]) => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, ly, lz);
      bear.add(leg);
    });
    // Hat (adventurer)
    const hatBase = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.08, 12), new THREE.MeshLambertMaterial({ color: 0x8B5E3C }));
    hatBase.position.set(0, 1.18, 0.05);
    bear.add(hatBase);
    const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.38, 12), new THREE.MeshLambertMaterial({ color: 0x7B4E2C }));
    hatTop.position.set(0, 1.42, 0.05);
    bear.add(hatTop);

    bear.position.set(0, 1.5, 0);
    scene.add(bear);
    g.bear = bear;

    // ── COINS ─────────────────────────────────────────────────────────────────
    const coinPositions = [
      [4, 1.8, 0], [5, 1.8, 0], [6, 1.8, 0],
      [8, 3.5, 0], [14, 5, 0], [20, 3.5, 0], [21, 3.5, 0],
      [28, 5.5, 0], [34, 4, 0], [35, 4, 0], [36, 4, 0],
      [42, 6.5, 0], [50, 4.5, 0], [51, 4.5, 0],
      [58, 3, 0], [66, 5.5, 0], [74, 3.5, 0], [75, 3.5, 0],
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

    // ── ENEMIES ───────────────────────────────────────────────────────────────
    const enemyPositions = [
      [12, 1.0, 0], [25, 1.0, 0], [38, 1.0, 0], [55, 1.0, 0], [70, 1.0, 0],
    ];
    const enemyGeo = new THREE.SphereGeometry(0.4, 8, 6);
    const enemyMat = new THREE.MeshLambertMaterial({ color: 0xe53935, emissive: 0x7b0000, emissiveIntensity: 0.2 });
    enemyPositions.forEach(([ex, ey, ez]) => {
      const enemy = new THREE.Mesh(enemyGeo, enemyMat);
      enemy.position.set(ex, ey, ez);
      // Spiky horns
      const hornGeo = new THREE.ConeGeometry(0.1, 0.3, 4);
      const hornMat = new THREE.MeshLambertMaterial({ color: 0xb71c1c });
      [-0.2, 0, 0.2].forEach(hx => {
        const horn = new THREE.Mesh(hornGeo, hornMat);
        horn.position.set(hx, 0.55, 0);
        enemy.add(horn);
      });
      scene.add(enemy);
      g.enemies.push(enemy);
      g.enemyDir.push(1);
    });

    // ── TREES ─────────────────────────────────────────────────────────────────
    const treePositions = [
      [-4, 0, -8], [3, 0, -12], [10, 0, -9], [18, 0, -11], [24, 0, -7],
      [30, 0, -13], [38, 0, -8], [45, 0, -10], [52, 0, -7], [60, 0, -12],
      [68, 0, -9], [76, 0, -11], [80, 0, -8],
      [-4, 0, 10], [8, 0, 12], [16, 0, 9], [28, 0, 11], [42, 0, 10],
    ];
    treePositions.forEach(([tx, ty, tz]) => {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.3, 1.8, 8),
        new THREE.MeshLambertMaterial({ color: 0x6D4C41 })
      );
      trunk.position.y = 0.9;
      tree.add(trunk);
      const leaves1 = new THREE.Mesh(
        new THREE.ConeGeometry(1.4, 2.0, 8),
        new THREE.MeshLambertMaterial({ color: 0x388E3C })
      );
      leaves1.position.y = 2.6;
      tree.add(leaves1);
      const leaves2 = new THREE.Mesh(
        new THREE.ConeGeometry(1.0, 1.6, 8),
        new THREE.MeshLambertMaterial({ color: 0x43A047 })
      );
      leaves2.position.y = 3.8;
      tree.add(leaves2);
      const leaves3 = new THREE.Mesh(
        new THREE.ConeGeometry(0.6, 1.2, 8),
        new THREE.MeshLambertMaterial({ color: 0x66BB6A })
      );
      leaves3.position.y = 4.8;
      tree.add(leaves3);
      tree.position.set(tx, ty, tz);
      scene.add(tree);
      g.trees.push(tree);
    });

    // Goal flag at end
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 5, 6);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0xbdbdbd });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(80, 2.5, 0);
    scene.add(pole);
    const flagGeo = new THREE.PlaneGeometry(1.2, 0.8);
    const flagMat = new THREE.MeshLambertMaterial({ color: 0xFFD700, side: THREE.DoubleSide });
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(80.7, 4.4, 0);
    scene.add(flag);

    // Clouds
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    for (let i = 0; i < 12; i++) {
      const cloud = new THREE.Group();
      [0, 0.6, -0.6, 1.1, -1.1].forEach((cx, ci) => {
        const puff = new THREE.Mesh(
          new THREE.SphereGeometry(0.4 + (ci === 0 ? 0.2 : 0), 8, 6),
          cloudMat
        );
        puff.position.set(cx, ci === 0 ? 0.1 : 0, 0);
        cloud.add(puff);
      });
      cloud.position.set(i * 14 - 10, 12 + Math.random() * 4, -15 + Math.random() * 10);
      cloud.scale.setScalar(1.5 + Math.random() * 0.8);
      scene.add(cloud);
    }

    // ── GAME LOOP ─────────────────────────────────────────────────────────────
    const GRAVITY = -18;
    const SPEED = 7;
    const JUMP_FORCE = 9;
    const bearSize = new THREE.Vector3(0.9, 1.7, 0.9);

    const animate = () => {
      g.animFrameId = requestAnimationFrame(animate);
      const dt = Math.min(g.clock.getDelta(), 0.05);
      const state = stateRef.current;
      if (state.status !== "playing" || !g.bear) {
        renderer.render(scene, camera);
        return;
      }

      const { keys, velocity, bear } = g;

      // Input
      const jdx = joyRef.current.active ? joyRef.current.dx / 40 : 0;
      const moveLeft = keys.left || jdx < -0.2;
      const moveRight = keys.right || jdx > 0.2;

      if (moveLeft) velocity.x = -SPEED;
      else if (moveRight) velocity.x = SPEED;
      else velocity.x *= 0.75;

      if (keys.jump && g.onGround) {
        velocity.y = JUMP_FORCE;
        g.onGround = false;
        keys.jump = false;
      }

      velocity.y += GRAVITY * dt;

      bear.position.x += velocity.x * dt;
      bear.position.y += velocity.y * dt;

      // Keep bear in Z lane
      bear.position.z += (0 - bear.position.z) * 0.1;

      // Bear tilt
      if (moveLeft) bear.rotation.y = -Math.PI * 0.15;
      else if (moveRight) bear.rotation.y = Math.PI * 0.15;
      else bear.rotation.y *= 0.8;

      // Leg animation
      if (g.onGround && (moveLeft || moveRight)) {
        const t = Date.now() * 0.01;
        body.rotation.x = Math.sin(t) * 0.12;
      } else {
        body.rotation.x *= 0.9;
      }

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
      g.bearBox.setFromCenterAndSize(bear.position, bearSize);

      g.platforms.forEach(platform => {
        const pb = new THREE.Box3().setFromObject(platform);
        if (g.bearBox.intersectsBox(pb)) {
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
        }
      });

      // Coins
      g.coinRotation += dt * 2;
      g.coins.forEach((coin, i) => {
        if (!coin.visible) return;
        coin.rotation.y = g.coinRotation;
        coin.position.y += Math.sin(Date.now() * 0.003 + i) * 0.003;
        const dist = bear.position.distanceTo(coin.position);
        if (dist < 0.8) {
          coin.visible = false;
          setGameState(prev => ({ ...prev, coins: prev.coins + 1, score: prev.score + 100 }));
        }
      });

      // Enemies
      g.enemies.forEach((enemy, i) => {
        if (!enemy.visible) return;
        enemy.position.x += g.enemyDir[i] * 2.5 * dt;
        if (enemy.position.x > 15 + i * 13) g.enemyDir[i] = -1;
        if (enemy.position.x < 9 + i * 13) g.enemyDir[i] = 1;
        enemy.rotation.y += dt * 2;

        const dist = bear.position.distanceTo(enemy.position);
        if (dist < 1.0) {
          const bearBottom = bear.position.y - bearSize.y / 2;
          if (bearBottom > enemy.position.y + 0.1 && velocity.y < 0) {
            enemy.visible = false;
            velocity.y = 6;
            setGameState(prev => ({ ...prev, score: prev.score + 200 }));
          } else {
            setGameState(prev => {
              const lives = prev.lives - 1;
              if (lives <= 0) return { ...prev, lives: 0, status: "dead" };
              return { ...prev, lives };
            });
            resetBear();
          }
        }
      });

      // Win condition (reach flag)
      if (bear.position.x > 79) {
        setGameState(prev => ({ ...prev, status: "win" }));
      }

      // Camera follow
      camera.position.x += (bear.position.x - camera.position.x + 0) * 0.08;
      camera.position.y += (bear.position.y + 5 - camera.position.y) * 0.08;
      camera.lookAt(bear.position.x, bear.position.y + 1, 0);

      renderer.render(scene, camera);
    };

    g.clock.start();
    animate();

    // Resize
    const onResize = () => {
      if (!mount) return;
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // Keyboard
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a") g.keys.left = true;
      if (e.key === "ArrowRight" || e.key === "d") g.keys.right = true;
      if (e.key === " " || e.key === "ArrowUp" || e.key === "w") g.keys.jump = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a") g.keys.left = false;
      if (e.key === "ArrowRight" || e.key === "d") g.keys.right = false;
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
  }, [resetBear]);

  // ── JOYSTICK HANDLERS ──────────────────────────────────────────────────────
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
    setTimeout(() => { gameRef.current.keys.jump = false; }, 100);
  };

  const restart = () => {
    setGameState({ coins: 0, lives: 3, score: 0, status: "playing" });
    gameRef.current.coins.forEach(c => { c.visible = true; });
    gameRef.current.enemies.forEach(e => { e.visible = true; });
    gameRef.current.enemyDir = gameRef.current.enemies.map(() => 1);
    resetBear();
  };

  const joystickOffset = joyRef.current.active
    ? { x: Math.max(-35, Math.min(35, joyRef.current.dx)), y: Math.max(-35, Math.min(35, joyRef.current.dy)) }
    : { x: 0, y: 0 };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" style={{ maxWidth: 480, left: "50%", transform: "translateX(-50%)" }}>
      {/* 3D Canvas */}
      <div ref={mountRef} className="flex-1 w-full relative overflow-hidden">

        {/* HUD */}
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between pointer-events-none z-10">
          {/* Left: lives */}
          <div className="panel-wood px-3 py-1 flex items-center gap-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <span key={i} className={`text-lg ${i < gameState.lives ? "" : "opacity-25"}`}>❤️</span>
            ))}
          </div>
          {/* Center: world name */}
          <div className="panel-wood px-3 py-1">
            <span className="font-game text-sm text-white">{worldEmoji} {worldName}</span>
          </div>
          {/* Right: coins + score */}
          <div className="flex flex-col gap-1 items-end">
            <div className="coin-display px-2 py-0.5 font-game text-xs text-amber-900">
              🪙 {gameState.coins}/{totalCoins}
            </div>
            <div className="panel-wood px-2 py-0.5 font-game text-xs text-yellow-300">
              ⭐ {gameState.score}
            </div>
          </div>
        </div>

        {/* Exit button */}
        <button
          className="absolute top-3 left-1/2 -translate-x-1/2 mt-10 z-20 btn-game px-3 py-1 text-xs pointer-events-auto"
          style={{ top: "auto", bottom: "calc(100% - 100%)", left: 12, transform: "none", position: "absolute", top: 52 }}
          onClick={onExit}
        >
          ✖ Выйти
        </button>

        {/* Win screen */}
        {gameState.status === "win" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-30">
            <div className="card-game p-6 text-center mx-6 animate-bounce-in">
              <div className="text-5xl mb-2">🎉</div>
              <div className="font-game text-2xl text-amber-900 mb-1">Уровень пройден!</div>
              <div className="font-game text-lg text-amber-700 mb-3">
                🪙 {gameState.coins}/{totalCoins} · ⭐ {gameState.score}
              </div>
              <StarBar count={gameState.coins >= totalCoins ? 3 : gameState.coins >= Math.floor(totalCoins * 0.6) ? 2 : 1} />
              <div className="flex gap-3 mt-4">
                <button className="btn-game flex-1 py-2 text-sm" onClick={restart}>🔄 Ещё раз</button>
                <button className="btn-game flex-1 py-2 text-sm" onClick={onExit}>🗺️ Карта</button>
              </div>
            </div>
          </div>
        )}

        {/* Death screen */}
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
      <div
        className="flex items-center justify-between px-6 pb-4 pt-2 select-none"
        style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.9) 100%)" }}
      >
        {/* Joystick */}
        <div
          className="relative flex items-center justify-center rounded-full"
          style={{
            width: 100, height: 100,
            background: "rgba(255,255,255,0.1)",
            border: "3px solid rgba(255,255,255,0.25)",
          }}
          onTouchStart={handleJoyStart}
          onTouchMove={handleJoyMove}
          onTouchEnd={handleJoyEnd}
        >
          <div
            className="absolute rounded-full transition-transform"
            style={{
              width: 44, height: 44,
              background: "radial-gradient(circle at 40% 35%, #f5c842, #d4881e)",
              border: "3px solid #a36010",
              boxShadow: "0 3px 8px rgba(0,0,0,0.5)",
              transform: `translate(${joystickOffset.x}px, ${joystickOffset.y}px)`,
            }}
          />
          {/* Arrows hint */}
          <span className="absolute top-1 left-1/2 -translate-x-1/2 text-white/30 text-xs">▲</span>
          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-white/30 text-xs">▼</span>
          <span className="absolute left-1 top-1/2 -translate-y-1/2 text-white/30 text-xs">◀</span>
          <span className="absolute right-1 top-1/2 -translate-y-1/2 text-white/30 text-xs">▶</span>
        </div>

        {/* Info */}
        <div className="text-center text-white/50 text-xs font-game">
          <div>WASD / ←→</div>
          <div>тоже работают</div>
        </div>

        {/* Jump button */}
        <button
          className="flex items-center justify-center rounded-full select-none active:scale-90 transition-transform"
          style={{
            width: 84, height: 84,
            background: "radial-gradient(circle at 40% 35%, #5cb84a, #2d6b22)",
            border: "4px solid #1e4a17",
            boxShadow: "0 6px 0 #1e4a17, 0 8px 20px rgba(0,0,0,0.5)",
            fontFamily: "'Fredoka One', cursive",
            fontSize: 14,
            color: "white",
            textShadow: "0 1px 0 rgba(0,0,0,0.4)",
            WebkitTapHighlightColor: "transparent",
          }}
          onTouchStart={e => { e.preventDefault(); handleJump(); }}
          onMouseDown={handleJump}
        >
          ПРЫЖОК
        </button>
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
