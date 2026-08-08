/* ===== core: renderer, shared state, utils, collision, particles ===== */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c4ec);
scene.fog = new THREE.Fog(0x9fd7f2, 70, 300);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 700);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
/* touch/coarse-pointer devices: cap pixel ratio lower than desktop for performance */
const TOUCH_DEVICE = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH_DEVICE ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
if (TOUCH_DEVICE) document.body.classList.add('touch-device');

/* map limits: 320x320 world, playable inside BOUND */
const MAP_HALF = 160, BOUND = 152;

/* ---- state ---- */
const MODE = { WEAPON: 'weapon', BUILD: 'build', VEHICLE: 'vehicle', HELI: 'heli' };
let mode = MODE.WEAPON;
let state = 'start'; // auth | start | playing | paused | over
let keys = {}, velY = 0, onGround = true;
let shooting = false, aiming = false, recoil = 0;
let health, score, wave, enemies = [], nextWaveAt = 0;
let elapsed = 0;
const resources = { wood: 0, stone: 0, metal: 0 };
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const CENTER = new THREE.Vector2(0, 0);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _dir = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/* ---- camera shake + pickaxe hit-stop ---- */
let shakeT = 0, shakeAmp = 0, hitStop = 0;
function addShake(amp, dur) {
  shakeAmp = Math.max(shakeAmp, amp);
  shakeT = Math.max(shakeT, dur);
}

/* ---- deterministic RNG for world layout ---- */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ---- shared geometry / material helpers ---- */
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const matCache = {};
function getMat(color) {
  if (!matCache[color]) matCache[color] = new THREE.MeshLambertMaterial({ color });
  return matCache[color];
}
/* parts: [sx,sy,sz, x,y,z, color, ry?] — builds a group of scaled shared unit boxes */
function buildModel(parts, shadow) {
  const g = new THREE.Group();
  for (const p of parts) {
    const m = new THREE.Mesh(unitBox, getMat(p[6]));
    m.scale.set(p[0], p[1], p[2]);
    m.position.set(p[3], p[4], p[5]);
    if (p[7]) m.rotation.y = p[7];
    if (p[8]) m.rotation.x = p[8];
    if (shadow) m.castShadow = true;
    g.add(m);
  }
  return g;
}

/* ---- collision ----
   obstacles: static AABBs (buildings, trees, rocks...) with active flag.
   buildBlockers: walls/window walls from the build system.
   supports: floors/ramps that give standing height.
   carSolid: live AABB of the car. */
const obstacles = [];
const buildBlockers = [];
const supports = [];
const solids = []; // meshes bullets/build-raycasts can hit
let carSolid = null;
let heliSolid = null;

function addObstacle(x, z, w, d, h, ref) {
  const o = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: 0, maxY: h, active: true, ref };
  obstacles.push(o);
  return o;
}
function boxHit(b, x, z, r, feet, height) {
  return x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r &&
    feet < b.maxY && feet + height > b.minY;
}
function blocked(x, z, r, feet, height, skipCar, skipHeli) {
  if (feet === undefined) feet = 0;
  if (height === undefined) height = 1.8;
  if (Math.abs(x) > BOUND || Math.abs(z) > BOUND) return true;
  for (const b of obstacles) if (b.active && boxHit(b, x, z, r, feet, height)) return true;
  for (const b of buildBlockers) if (boxHit(b, x, z, r, feet, height)) return true;
  if (!skipCar && carSolid && boxHit(carSolid, x, z, r, feet, height)) return true;
  if (!skipHeli && heliSolid && boxHit(heliSolid, x, z, r, feet, height)) return true;
  return false;
}
function slideMove(obj, dx, dz, r, feet, height) {
  if (!blocked(obj.position.x + dx, obj.position.z + dz, r, feet, height)) { obj.position.x += dx; obj.position.z += dz; }
  else if (!blocked(obj.position.x + dx, obj.position.z, r, feet, height)) obj.position.x += dx;
  else if (!blocked(obj.position.x, obj.position.z + dz, r, feet, height)) obj.position.z += dz;
}
/* highest floor/ramp surface at x,z (0 = ground) */
function supportHeightAt(x, z, maxFeet) {
  let best = 0;
  for (const s of supports) {
    const dx = x - s.x, dz = z - s.z;
    let h = -1;
    if (s.kind === 'floor') {
      if (Math.abs(dx) <= 2.1 && Math.abs(dz) <= 2.1) h = s.y + 0.2;
    } else { // ramp: rises along local +z
      const c = Math.cos(s.yaw), si = Math.sin(s.yaw);
      const lx = c * dx - si * dz, lz = si * dx + c * dz;
      if (Math.abs(lx) <= 2.05 && Math.abs(lz) <= 2.05) {
        h = s.y + Math.max(0, Math.min(1, (lz + 2) / 4)) * 3;
      }
    }
    if (h > best && (maxFeet === undefined || h <= maxFeet)) best = h;
  }
  return best;
}
function removeFromSolids(group) {
  for (const c of group.children) {
    if (c.isMesh) {
      const i = solids.indexOf(c);
      if (i !== -1) solids.splice(i, 1);
    } else {
      removeFromSolids(c);
    }
  }
}
function addToSolids(group) {
  for (const c of group.children) {
    if (c.isMesh) { if (solids.indexOf(c) === -1) solids.push(c); }
    else addToSolids(c);
  }
}

/* ---- pooled particles ---- */
const particleGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
const particlePool = [];
for (let i = 0; i < 48; i++) {
  const m = new THREE.Mesh(particleGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  m.visible = false;
  scene.add(m);
  particlePool.push({ mesh: m, vel: new THREE.Vector3(), life: 0 });
}
let particleCursor = 0;
function spawnBurst(pos, color, n, power) {
  for (let i = 0; i < n; i++) {
    const p = particlePool[particleCursor];
    particleCursor = (particleCursor + 1) % particlePool.length;
    p.mesh.visible = true;
    p.mesh.position.copy(pos);
    p.mesh.material.color.setHex(color);
    p.vel.set((Math.random() - 0.5) * power, Math.random() * power * 0.8 + 1, (Math.random() - 0.5) * power);
    p.life = 0.45 + Math.random() * 0.2;
  }
}
function updateParticles(dt) {
  for (const p of particlePool) {
    if (!p.mesh.visible) continue;
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    p.vel.y -= 16 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    if (p.mesh.position.y < 0.05) p.mesh.visible = false;
  }
}
function clearParticles() {
  for (const p of particlePool) p.mesh.visible = false;
}
