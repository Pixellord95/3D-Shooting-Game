/* ===== items: slots, pickaxe, data-driven weapons, harvesting ===== */
const WEAPONS = {
  rifle: {
    damage: 25, headMultiplier: 2, fireInterval: 0.11, magazine: 30, reserve: 120, maxReserve: 240,
    reloadTime: 1.1, hipSpread: 0.018, adsSpread: 0.006, automatic: true, kick: 0.55, adsFov: 45,
    ads: new THREE.Vector3(0, -0.155, -0.42), sound: () => sRifle(),
  },
  shotgun: {
    damage: 11, pellets: 8, headMultiplier: 1.5, fireInterval: 0.85, magazine: 5, reserve: 30, maxReserve: 60,
    reloadTime: 1.5, hipSpread: 0.075, adsSpread: 0.045, automatic: false, kick: 1.3, adsFov: 52,
    ads: new THREE.Vector3(0, -0.17, -0.4), sound: () => { sShotgun(); addShake(0.05, 0.12); },
  },
  bazooka: {
    name: 'Bazooka', damage: 120, explosionRadius: 7, headMultiplier: 1, fireInterval: 1.2,
    magazine: 1, reserve: 3, maxReserve: 8, reloadTime: 2.1, hipSpread: 0.012, adsSpread: 0.006,
    automatic: false, kick: 1.8, adsFov: 60, rocket: true,
    ads: new THREE.Vector3(0, -0.1, -0.92), sound: () => { sRocket(); addShake(0.07, 0.16); },
  },
  ak47: {
    name: 'AK-47', damage: 31, headMultiplier: 1.75, fireInterval: 0.105, magazine: 30, reserve: 120,
    maxReserve: 240, reloadTime: 1.4, hipSpread: 0.025, adsSpread: 0.008, automatic: true, kick: 0.7, adsFov: 48,
    ads: new THREE.Vector3(0, -0.155, -0.42), sound: () => sAk(),
  },
  sniper: {
    damage: 90, headMultiplier: 2.5, fireInterval: 1.4, magazine: 5, reserve: 20, maxReserve: 40,
    reloadTime: 1.8, hipSpread: 0.05, adsSpread: 0.0015, automatic: false, kick: 2.1, adsFov: 26,
    ads: new THREE.Vector3(0, -0.14, -0.85), sound: () => { sSniper(); addShake(0.08, 0.14); },
  },
  machinegun: {
    name: 'Machine Gun', damage: 16, headMultiplier: 1.6, fireInterval: 0.045, magazine: 75, reserve: 225,
    maxReserve: 450, reloadTime: 2.6, hipSpread: 0.032, adsSpread: 0.014, automatic: true, kick: 0.3, adsFov: 52,
    ads: new THREE.Vector3(0, -0.16, -0.6), sound: () => sSmg(),
  },
};
const SLOTS = ['pickaxe', 'rifle', 'shotgun', 'bazooka', 'ak47', 'sniper', 'machinegun'];
const ITEM_HIP = {
  pickaxe: new THREE.Vector3(0.36, -0.34, -0.58),
  rifle: new THREE.Vector3(0.28, -0.26, -0.55),
  shotgun: new THREE.Vector3(0.3, -0.28, -0.52),
  bazooka: new THREE.Vector3(0.34, -0.24, -0.5),
  ak47: new THREE.Vector3(0.29, -0.27, -0.52),
  sniper: new THREE.Vector3(0.3, -0.27, -0.64),
  machinegun: new THREE.Vector3(0.3, -0.31, -0.5),
};
let slot = 1;
const ammo = {
  rifle: { mag: 30, res: 120 }, shotgun: { mag: 5, res: 30 },
  bazooka: { mag: 1, res: 3 }, ak47: { mag: 30, res: 120 }, sniper: { mag: 5, res: 20 },
  machinegun: { mag: 75, res: 225 },
};

/* central ammo grant, capped at maxReserve; returns actual gain */
function grantAmmo(id, amount) {
  const a = ammo[id], w = WEAPONS[id];
  const before = a.res;
  a.res = Math.min(w.maxReserve, a.res + amount);
  const gained = a.res - before;
  if (gained > 0) updateAmmoHud();
  return gained;
}
let reloading = false, reloadT = 0, reloadAuto = false;
let equipT = 1, sprintPose = 0, bobT = 0, swayX = 0, swayY = 0;
let swingT = -1, swingHit = false;
let lastShotT = -Infinity, firedThisPress = false, dryPlayed = false;
let flashT = 0;
const basePos = new THREE.Vector3().copy(ITEM_HIP.rifle);
const tracerMaterial = new THREE.LineBasicMaterial({ color: 0xffe08a });
const RES_COLORS = { wood: 0xb8793f, stone: 0x9a9a9a, metal: 0x8fa3b8 };

/* ---- shared sight materials (built once, reused across weapon models) ---- */
const sightHousingMat = getMat(0x15171a);
const redDotLensMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b });
const scopeLensMat = new THREE.MeshBasicMaterial({ color: 0x2fd0ff });
const beadSightMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
const circleGeo = new THREE.CircleGeometry(1, 12); // unit disc, scaled per lens

/* ---- models ---- */
const rifleModel = buildModel([
  [0.09, 0.11, 0.62, 0, 0, -0.15, 0x2b2f38],
  [0.05, 0.05, 0.34, 0, 0.005, -0.62, 0x1d2129],
  [0.1, 0.08, 0.3, 0, -0.01, -0.42, 0x3a4150],
  [0.07, 0.22, 0.12, 0, -0.15, -0.12, 0x2f3542],
  [0.08, 0.12, 0.24, 0, -0.02, 0.18, 0x3a4150],
  [0.07, 0.16, 0.1, 0, -0.15, 0.02, 0x2f3542],
  [0.05, 0.045, 0.15, 0, 0.095, -0.19, 0x1d2129],   // red-dot sight housing
], false);
{ // red-dot lens + a low front sight post so the reticle has two references
  const lens = new THREE.Mesh(circleGeo, redDotLensMat);
  lens.scale.setScalar(0.017);
  lens.position.set(0, 0.095, -0.115);
  rifleModel.add(lens);
  const front = new THREE.Mesh(unitBox, getMat(0x14161a));
  front.scale.set(0.02, 0.05, 0.02);
  front.position.set(0, 0.065, -0.76);
  rifleModel.add(front);
}
const shotgunModel = buildModel([
  [0.1, 0.12, 0.4, 0, 0, -0.1, 0x4a3626],
  [0.07, 0.07, 0.5, 0, 0.02, -0.5, 0x2a2e35],
  [0.1, 0.09, 0.16, 0, -0.04, -0.45, 0x6b4a2f],
  [0.09, 0.13, 0.22, 0, -0.03, 0.16, 0x6b4a2f],
], false);
{ // classic bead front sight
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), beadSightMat);
  bead.position.set(0, 0.065, -0.74);
  shotgunModel.add(bead);
}
const ak47Model = buildModel([
  [0.085, 0.1, 0.5, 0, 0, -0.12, 0x2b2b28],        // receiver, dark metal
  [0.075, 0.09, 0.26, 0, -0.005, -0.5, 0x7a5230],  // wooden handguard
  [0.04, 0.04, 0.4, 0, 0.008, -0.78, 0x1d2129],    // long barrel
  [0.05, 0.05, 0.06, 0, 0.03, -0.97, 0x1d2129],    // front sight block
  [0.02, 0.06, 0.02, 0, 0.075, -0.62, 0x1d2129],
  [0.03, 0.05, 0.08, 0, 0.075, -0.1, 0x33332f],    // rear sight
  [0.08, 0.12, 0.26, 0, -0.045, 0.24, 0x7a5230],   // wooden stock
  [0.07, 0.08, 0.1, 0, -0.1, 0.12, 0x7a5230],
  [0.06, 0.14, 0.1, 0, -0.15, 0.02, 0x4a3320],     // grip
  [0.065, 0.2, 0.09, 0, -0.13, -0.15, 0x8a6a30, 0, 0.3],  // curved magazine
  [0.06, 0.12, 0.08, 0, -0.24, -0.1, 0x8a6a30, 0, 0.6],
], false);
{ // front sight hood ring, framing the existing sight post
  const hood = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.006, 6, 10), sightHousingMat);
  hood.position.set(0, 0.06, -0.97);
  ak47Model.add(hood);
}
const bazookaModel = buildModel([
  [0.14, 0.14, 0.95, 0, 0.03, -0.2, 0x3f4a3a],     // main tube
  [0.17, 0.17, 0.14, 0, 0.03, -0.72, 0x2e372c],    // muzzle ring
  [0.17, 0.17, 0.12, 0, 0.03, 0.3, 0x2e372c],      // rear ring
  [0.05, 0.1, 0.06, 0, -0.06, -0.05, 0x24262a],    // trigger grip
  [0.05, 0.12, 0.05, 0, -0.1, 0.12, 0x24262a],
  [0.04, 0.07, 0.12, 0, 0.14, -0.3, 0x24262a],     // top sight
  [0.03, 0.03, 0.05, 0, 0.18, -0.34, 0xffd34d],
  [0.1, 0.05, 0.16, -0.1, -0.02, -0.42, 0xc03828], // side stripe
], false);
{ // reflex lens on the top sight
  const lens = new THREE.Mesh(circleGeo, scopeLensMat);
  lens.scale.setScalar(0.022);
  lens.position.set(0, 0.18, -0.365);
  bazookaModel.add(lens);
}
const sniperModel = buildModel([
  [0.08, 0.1, 0.7, 0, 0, -0.2, 0x2f3b33],
  [0.04, 0.04, 0.5, 0, 0.01, -0.75, 0x1d2129],
  [0.055, 0.055, 0.28, 0, 0.105, -0.15, 0x111418],
  [0.06, 0.07, 0.04, 0, 0.08, -0.05, 0x22262c],
  [0.06, 0.07, 0.04, 0, 0.08, -0.25, 0x22262c],
  [0.07, 0.12, 0.22, 0, -0.03, 0.22, 0x3a4436],
  [0.06, 0.14, 0.09, 0, -0.13, 0.02, 0x2a2e35],
], false);
{ // full scope: objective + ocular lenses and two turret dials
  const frontLens = new THREE.Mesh(circleGeo, scopeLensMat);
  frontLens.scale.setScalar(0.044);
  frontLens.position.set(0, 0.105, -0.295);
  sniperModel.add(frontLens);
  const rearLens = new THREE.Mesh(circleGeo, scopeLensMat);
  rearLens.scale.setScalar(0.03);
  rearLens.position.set(0, 0.105, -0.012);
  sniperModel.add(rearLens);
  const turretGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.03, 8);
  const turretTop = new THREE.Mesh(turretGeo, getMat(0x2a2e35));
  turretTop.position.set(0, 0.148, -0.12);
  sniperModel.add(turretTop);
  const turretSide = new THREE.Mesh(turretGeo, getMat(0x2a2e35));
  turretSide.rotation.z = Math.PI / 2;
  turretSide.position.set(0.038, 0.105, -0.06);
  sniperModel.add(turretSide);
}
const machinegunModel = buildModel([
  [0.1, 0.12, 0.58, 0, 0, -0.12, 0x33362e],         // receiver
  [0.045, 0.045, 0.55, 0, 0.01, -0.86, 0x1c1f1a],   // heavy barrel
  [0.03, 0.05, 0.08, 0, 0.085, -0.14, 0x33362e],     // rear sight
  [0.1, 0.15, 0.3, 0, -0.06, 0.28, 0x33362e],        // stock
  [0.07, 0.16, 0.1, 0, -0.17, 0.05, 0x24261f],       // grip
  [0.1, 0.2, 0.11, 0, -0.14, -0.28, 0x3a3d33],       // box magazine
], false);
{ // front sight post + splayed bipod legs
  const front = new THREE.Mesh(unitBox, getMat(0x1a1d18));
  front.scale.set(0.045, 0.06, 0.045);
  front.position.set(0, 0.055, -1.08);
  machinegunModel.add(front);
  const legGeo = new THREE.BoxGeometry(0.03, 0.36, 0.03);
  const legMat = getMat(0x24261f);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(sx * 0.12, -0.14, -0.68);
    leg.rotation.z = sx * 0.3;
    machinegunModel.add(leg);
  }
}
const pickaxeModel = new THREE.Group();
{
  const part = (sx, sy, sz, x, y, z, c, rz) => {
    const m = new THREE.Mesh(unitBox, getMat(c));
    m.scale.set(sx, sy, sz); m.position.set(x, y, z);
    if (rz) m.rotation.z = rz;
    pickaxeModel.add(m);
  };
  part(0.055, 0.78, 0.055, 0, -0.02, 0, 0x8a5c33);          // shaft
  part(0.065, 0.2, 0.065, 0, -0.3, 0, 0x4a2f1a);            // grip wrap
  part(0.07, 0.05, 0.07, 0, -0.42, 0, 0x5f3f24);            // pommel
  part(0.34, 0.08, 0.09, -0.14, 0.36, 0, 0x8e9aa8);         // blade arm
  part(0.12, 0.14, 0.02, -0.31, 0.36, 0, 0xc4d0dc);         // flat blade
  part(0.3, 0.07, 0.07, 0.15, 0.36, 0, 0x8e9aa8, 0.18);     // spike arm
  part(0.12, 0.05, 0.05, 0.32, 0.39, 0, 0xdde6ee, 0.35);    // spike tip
  part(0.09, 0.09, 0.1, 0, 0.36, 0, 0x6b7684);              // head socket
  pickaxeModel.scale.set(0.62, 0.62, 0.62);
  pickaxeModel.rotation.set(0.35, 0.5, -0.35);
}
const tips = {
  rifle: new THREE.Object3D(), shotgun: new THREE.Object3D(),
  bazooka: new THREE.Object3D(), ak47: new THREE.Object3D(), sniper: new THREE.Object3D(),
  machinegun: new THREE.Object3D(),
};
tips.rifle.position.set(0, 0.005, -0.8);
tips.shotgun.position.set(0, 0.02, -0.78);
tips.bazooka.position.set(0, 0.03, -0.82);
tips.ak47.position.set(0, 0.008, -1.0);
tips.sniper.position.set(0, 0.01, -1.05);
tips.machinegun.position.set(0, 0.02, -1.15);
rifleModel.add(tips.rifle);
shotgunModel.add(tips.shotgun);
bazookaModel.add(tips.bazooka);
ak47Model.add(tips.ak47);
sniperModel.add(tips.sniper);
machinegunModel.add(tips.machinegun);
const models = {
  pickaxe: pickaxeModel, rifle: rifleModel, shotgun: shotgunModel,
  bazooka: bazookaModel, ak47: ak47Model, sniper: sniperModel, machinegun: machinegunModel,
};
hand.add(pickaxeModel, rifleModel, shotgunModel, bazookaModel, ak47Model, sniperModel, machinegunModel);
for (const k in models) models[k].visible = k === 'rifle';
hand.position.copy(ITEM_HIP.rifle);

const muzzleFlash = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ color: 0xffe9a0 }));
muzzleFlash.scale.set(0.12, 0.12, 0.3);
muzzleFlash.visible = false;
tips.rifle.add(muzzleFlash);

function currentItem() { return SLOTS[slot]; }
function currentWeapon() { return WEAPONS[currentItem()] || null; }

function equip(i) {
  if (i === slot && (mode === MODE.WEAPON || mode === MODE.HELI)) return;
  slot = i;
  if (mode !== MODE.HELI) mode = MODE.WEAPON; // flying already implies weapon-capable; don't kick the heli mode
  cancelReload();
  equipT = 0;
  swingT = -1;
  for (const k in models) models[k].visible = k === currentItem();
  const w = currentWeapon();
  if (w) tips[currentItem()].add(muzzleFlash);
  sEquip();
  updateSlotsHud();
  updateAmmoHud();
  tryStartReload(true); // re-equipping an empty weapon starts reloading it
}

function cancelReload() {
  reloading = false;
  reloadT = 0;
  reloadAuto = false;
  reloadHud(-1);
}

/* central reload gate — used by manual R, empty-mag fire attempts, the
   last shot that empties a magazine, and returning to weapon mode. */
function tryStartReload(automatic) {
  if (state !== 'playing' || (mode !== MODE.WEAPON && mode !== MODE.HELI)) return false;
  const item = currentItem(), w = WEAPONS[item];
  if (!w) return false; // pickaxe (and any non-gun item) never reloads
  if (reloading) return false; // no double-start
  const a = ammo[item];
  if (a.mag >= w.magazine) return false;
  if (a.res <= 0) return false;
  reloading = true;
  reloadT = 0;
  reloadAuto = !!automatic;
  sReload();
  reloadHud(0);
  return true;
}

function startReload() { // manual R key entrypoint
  tryStartReload(false);
}

/* shared ray-target list rebuilt per shot/swing (not per frame) */
const rayTargets = [];
function collectTargets() {
  rayTargets.length = 0;
  for (const e of enemies) if (!e.userData.dying) {
    for (const p of e.userData.parts) rayTargets.push(p);
  }
  for (const s of solids) rayTargets.push(s);
  return rayTargets;
}

/* ---- bazooka rockets + explosions (pooled) ---- */
const rockets = [];
for (let i = 0; i < 4; i++) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(unitBox, getMat(0x3a4046));
  body.scale.set(0.14, 0.14, 0.5);
  const nose = new THREE.Mesh(unitBox, getMat(0xc03828));
  nose.scale.set(0.1, 0.1, 0.16);
  nose.position.z = -0.3;
  g.add(body, nose);
  g.visible = false;
  scene.add(g);
  rockets.push({ mesh: g, active: false, vx: 0, vy: 0, vz: 0, life: 0, trailT: 0 });
}
const explGeo = new THREE.SphereGeometry(1, 10, 8);
const explMat = new THREE.MeshBasicMaterial({ color: 0xffa93d, transparent: true, depthWrite: false });
const explosionFx = [];
for (let i = 0; i < 2; i++) {
  const m = new THREE.Mesh(explGeo, explMat);
  m.visible = false;
  scene.add(m);
  explosionFx.push({ mesh: m, t: -1 });
}

function fireRocket() {
  let r = null;
  for (const q of rockets) if (!q.active) { r = q; break; }
  if (!r) return;
  camera.getWorldDirection(_dir);
  tips.bazooka.getWorldPosition(_v1);
  r.mesh.position.copy(_v1);
  r.mesh.lookAt(_v2.copy(_v1).sub(_dir)); // nose (-z) faces travel direction
  r.active = true;
  r.mesh.visible = true;
  const SPD = 28;
  r.vx = _dir.x * SPD; r.vy = _dir.y * SPD; r.vz = _dir.z * SPD;
  r.life = 4;
  r.trailT = 0;
  spawnBurst(_v1, 0x9aa0a8, 4, 2); // backblast smoke
}

function explodeAt(px, py, pz) {
  for (const ex of explosionFx) {
    if (ex.t < 0) { ex.t = 0; ex.mesh.visible = true; ex.mesh.position.set(px, py, pz); ex.mesh.scale.setScalar(0.5); break; }
  }
  sExplosion();
  addShake(0.14, 0.3);
  _v1.set(px, py, pz);
  spawnBurst(_v1, 0xffa93d, 10, 8);
  spawnBurst(_v1, 0x55524c, 6, 5);
  const R = WEAPONS.bazooka.explosionRadius, DMG = WEAPONS.bazooka.damage;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.userData.dying) continue;
    _v2.set(e.position.x, e.position.y + 1.1 * e.userData.baseScale, e.position.z);
    const d = _v2.distanceTo(_v1);
    if (d > R) continue;
    if (d > 0.8) { // walls shield against the blast
      _v2.sub(_v1).normalize();
      raycaster.set(_v1, _v2);
      raycaster.far = d - 0.6;
      const hitWall = raycaster.intersectObjects(solids)[0];
      raycaster.far = Infinity;
      if (hitWall) continue;
    }
    damageEnemy(e, DMG * (1 - d / R), false); // no headshots from splash
  }
  for (let i = builds.length - 1; i >= 0; i--) {
    const b = builds[i];
    const d = b.position.distanceTo(_v1);
    if (d < R * 0.75) damageBuild(b, DMG * (1 - d / R), null);
  }
  const pd = player.position.distanceTo(_v1);
  if (pd < R) damagePlayer(Math.round(DMG * (1 - pd / R) * 0.35)); // reduced self-damage
}

function updateRockets(dt) {
  for (const ex of explosionFx) {
    if (ex.t < 0) continue;
    ex.t += dt;
    ex.mesh.scale.setScalar(0.5 + ex.t * 22);
    explMat.opacity = Math.max(0, 0.85 - ex.t * 3.2);
    if (ex.t > 0.28) { ex.t = -1; ex.mesh.visible = false; }
  }
  for (const r of rockets) {
    if (!r.active) continue;
    r.life -= dt;
    const m = r.mesh.position;
    const px = m.x, py = m.y, pz = m.z;
    const nx = px + r.vx * dt, ny = py + r.vy * dt, nz = pz + r.vz * dt;
    const steps = Math.max(1, Math.ceil(Math.hypot(nx - px, ny - py, nz - pz) / 0.7));
    let hit = false, lx = px, ly = py, lz = pz;
    for (let s = 1; s <= steps; s++) {
      const f = s / steps;
      const x = px + (nx - px) * f, y = py + (ny - py) * f, z = pz + (nz - pz) * f;
      if (y <= 0.08) hit = true;
      if (!hit) {
        const sup = supportHeightAt(x, z);
        if (sup > 0.01 && ly > sup && y <= sup + 0.06) hit = true;
      }
      if (!hit && blocked(x, z, 0.2, y - 0.25, 0.5)) hit = true;
      if (!hit) {
        for (const e of enemies) {
          if (e.userData.dying) continue;
          const dx = e.position.x - x, dy = e.position.y + 1.1 * e.userData.baseScale - y, dz = e.position.z - z;
          if (dx * dx + dy * dy + dz * dz < 1.44) { hit = true; break; }
        }
      }
      if (hit) { explodeAt(lx, ly, lz); break; } // blast at the last free sample
      lx = x; ly = y; lz = z;
    }
    if (hit || r.life <= 0 || Math.abs(nx) > MAP_HALF || Math.abs(nz) > MAP_HALF) {
      if (!hit && r.life <= 0) explodeAt(lx, ly, lz);
      r.active = false;
      r.mesh.visible = false;
      continue;
    }
    m.set(nx, ny, nz);
    r.trailT += dt;
    if (r.trailT > 0.03) { r.trailT = 0; spawnBurst(m, 0xb8b2a6, 1, 1.2); }
  }
}
function resetRockets() {
  for (const r of rockets) { r.active = false; r.mesh.visible = false; }
  for (const ex of explosionFx) { ex.t = -1; ex.mesh.visible = false; }
}

function tracerLine(from, to) {
  const g = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(g, tracerMaterial);
  scene.add(line);
  setTimeout(() => { scene.remove(line); g.dispose(); }, 45);
}

function fireGun(now) {
  const item = currentItem(), w = WEAPONS[item], a = ammo[item];
  if (reloading) return;
  if (now - (a.lastShot !== undefined ? a.lastShot : -Infinity) < w.fireInterval) return;
  if (!w.automatic && firedThisPress) return;
  if (a.mag <= 0) {
    if (tryStartReload(true)) {
      // consume this press so a held semi-auto trigger can't fire a free
      // shot the instant the reload completes; automatic weapons ignore this flag
      firedThisPress = true;
      return;
    }
    if (!dryPlayed) { sDry(); dryPlayed = true; flashMsg('Out of ammo — press R', 0.9); }
    return;
  }
  firedThisPress = true;
  lastShotT = now;
  a.lastShot = now;
  a.mag--;
  if (a.mag === 0 && a.res > 0) tryStartReload(true); // last shot in the mag auto-reloads
  recoil = 1;
  pitchObj.rotation.x = Math.min(1.45, pitchObj.rotation.x + w.kick * 0.006);
  w.sound();
  flashT = 0.045;
  muzzleFlash.visible = true;
  muzzleFlash.rotation.z = Math.random() * 3;

  if (w.rocket) { fireRocket(); updateAmmoHud(); return; }

  camera.getWorldPosition(_v3);
  camera.getWorldDirection(_dir);
  _right.crossVectors(_dir, UP).normalize();
  _up.crossVectors(_right, _dir).normalize();
  const spread = aiming ? w.adsSpread : w.hipSpread;
  const pellets = w.pellets || 1;
  const targets = collectTargets();
  tips[item].getWorldPosition(_v1);
  raycaster.far = 250;
  let hitEnemy = false, killed = false;
  for (let p = 0; p < pellets; p++) {
    _v2.copy(_dir)
      .addScaledVector(_right, (Math.random() - 0.5) * 2 * spread)
      .addScaledVector(_up, (Math.random() - 0.5) * 2 * spread)
      .normalize();
    raycaster.set(_v3, _v2);
    const hit = raycaster.intersectObjects(targets)[0];
    const end = hit ? hit.point : _v2.multiplyScalar(150).add(_v3);
    tracerLine(_v1, end);
    if (!hit) continue;
    const ud = hit.object.userData;
    if (ud.root) {
      if (damageEnemy(ud.root, w.damage, ud.isHead, w.headMultiplier)) killed = true;
      hitEnemy = true;
      spawnBurst(hit.point, 0xd84a3a, 2, 3);
    } else if (ud.rootBuild) {
      damageBuild(ud.rootBuild, w.damage * 0.6, hit.point);
    } else if (p === 0) {
      spawnBurst(hit.point, 0xbbbbbb, 2, 2.5);
    }
  }
  raycaster.far = Infinity;
  if (hitEnemy) hitmark(killed);
  updateAmmoHud();
}

/* ---- pickaxe swing ---- */
function startSwing() {
  if (swingT >= 0) return;
  swingT = 0;
  swingHit = false;
}

/* forgiving swing hit: center ray first, then slightly offset rays */
const SWING_OFFS = [[0, 0], [0.06, 0], [-0.06, 0], [0, 0.06], [0, -0.06]];
const RES_SOUND = { wood: () => sWood(), stone: () => sStone(), metal: () => sMetal() };
function swingImpact() {
  camera.getWorldPosition(_v3);
  camera.getWorldDirection(_dir);
  _right.crossVectors(_dir, UP).normalize();
  _up.crossVectors(_right, _dir).normalize();
  const targets = collectTargets();
  raycaster.far = 3.2;
  let hit = null;
  for (const [ox, oy] of SWING_OFFS) {
    _v2.copy(_dir).addScaledVector(_right, ox).addScaledVector(_up, oy).normalize();
    raycaster.set(_v3, _v2);
    hit = raycaster.intersectObjects(targets)[0];
    if (hit) break;
  }
  raycaster.far = Infinity;
  if (!hit) { sSwing(); return; }
  hitStop = 0.04;
  addShake(0.025, 0.08);
  pitchObj.rotation.x = Math.min(1.45, pitchObj.rotation.x + 0.006);
  const ud = hit.object.userData;
  if (ud.root) {
    if (damageEnemy(ud.root, 20, false)) hitmark(true); else hitmark(false);
    spawnBurst(hit.point, 0xd84a3a, 3, 3);
  } else if (ud.rootBuild) {
    damageBuild(ud.rootBuild, 30, hit.point);
    RES_SOUND[ud.rootBuild.userData.matKey]();
  } else if (ud.rootHarvest) {
    harvestHit(ud.rootHarvest, hit.point);
  } else {
    spawnBurst(hit.point, 0xbbbbbb, 2, 2);
    sChop();
  }
}

/* weak-spot marker: hit it for bonus yield, then it moves */
const weakGeo = new THREE.OctahedronGeometry(0.16, 0);
const weakMat = new THREE.MeshBasicMaterial({ color: 0xffd34d });
function moveWeakSpot(group, point) {
  const u = group.userData;
  if (!u.weakMesh) {
    u.weakMesh = new THREE.Mesh(weakGeo, weakMat);
    group.add(u.weakMesh);
  }
  _v2.copy(point);
  group.worldToLocal(_v2);
  _v2.x += (Math.random() - 0.5) * 0.7;
  _v2.y = Math.max(0.4, _v2.y + (Math.random() - 0.5) * 0.9);
  _v2.z += (Math.random() - 0.5) * 0.7;
  u.weakMesh.position.copy(_v2);
  u.weakMesh.visible = true;
}

function harvestHit(group, point) {
  const u = group.userData;
  if (u.destroyed) return;
  const dmg = 34;
  let mult = 1;
  if (u.weakMesh && u.weakMesh.visible) {
    u.weakMesh.getWorldPosition(_v1);
    if (_v1.distanceTo(point) < 0.6) { mult = 1.6; sPickup(); }
  }
  u.hp -= dmg * mult;
  const gain = Math.max(1, Math.round(u.yield * dmg / 100 * mult));
  resources[u.resource] += gain;
  showGain('+' + gain + ' ' + u.resource.toUpperCase(), mult > 1 ? '#7dffb0' : null);
  RES_SOUND[u.resource]();
  spawnBurst(point, RES_COLORS[u.resource], 6, 4);
  updateResHud();
  if (u.hp <= 0) {
    u.destroyed = true;
    group.visible = false;
    if (u.block) u.block.active = false;
    removeFromSolids(group);
    spawnBurst(point, RES_COLORS[u.resource], 10, 6);
    sBreak();
  } else {
    moveWeakSpot(group, point);
  }
}

/* ---- per-frame item update (only while playing) ---- */
function updateItems(dt, now) {
  equipT = Math.min(1, equipT + dt / 0.3);
  flashT -= dt;
  if (flashT <= 0) muzzleFlash.visible = false;

  const moving = mode !== MODE.HELI && (keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD);
  const sprinting = (keys.ShiftLeft || keys.ShiftRight) && moving && !aiming;
  sprintPose += ((sprinting ? 1 : 0) - sprintPose) * Math.min(1, dt * 8);
  if (moving && onGround) bobT += dt * (sprinting ? 11 : 7);
  const damp = Math.pow(0.002, dt);
  swayX *= damp; swayY *= damp;

  const item = currentItem(), w = WEAPONS[item];
  const target = (aiming && w) ? w.ads : ITEM_HIP[item];
  basePos.lerp(target, 1 - Math.pow(0.0001, dt));
  const bobAmp = moving && onGround ? 1 : 0;
  hand.position.set(
    basePos.x + swayX + Math.sin(bobT) * 0.014 * bobAmp,
    basePos.y + swayY + Math.abs(Math.sin(bobT)) * 0.016 * bobAmp - (1 - equipT) * 0.4,
    basePos.z + recoil * (w ? w.kick : 0.5) * 0.08
  );
  recoil = Math.max(0, recoil - dt * 9);
  const reloadDip = reloading && w ? Math.sin(Math.min(1, reloadT / w.reloadTime) * Math.PI) : 0;
  hand.position.y -= reloadDip * 0.09;
  hand.rotation.x = recoil * (w ? w.kick : 0.4) * 0.14 + sprintPose * 0.55 + (1 - equipT) * 0.8 + reloadDip * 0.5;
  hand.rotation.y = sprintPose * 0.35;
  hand.rotation.z = sprintPose * 0.2 + reloadDip * 0.25;

  /* swing animation: windup, strike (impact at one exact moment), recover */
  if (swingT >= 0) {
    swingT += dt;
    const t = swingT;
    if (t < 0.16) pickaxeModel.rotation.x = 0.35 + (t / 0.16) * 0.55;
    else if (t < 0.32) pickaxeModel.rotation.x = 0.9 - ((t - 0.16) / 0.16) * 2.3;
    else pickaxeModel.rotation.x = -1.4 + ((t - 0.32) / 0.2) * 1.75;
    if (!swingHit && t >= 0.24) { swingHit = true; swingImpact(); }
    if (t >= 0.52) {
      swingT = -1;
      pickaxeModel.rotation.x = 0.35;
      if (shooting && (mode === MODE.WEAPON || mode === MODE.HELI) && item === 'pickaxe') startSwing();
    }
  }

  /* firing */
  if ((mode === MODE.WEAPON || mode === MODE.HELI) && shooting) {
    if (item === 'pickaxe') startSwing();
    else fireGun(now);
  }

  /* reload */
  if (reloading) {
    reloadT += dt;
    const w2 = currentWeapon();
    reloadHud(reloadT / w2.reloadTime);
    if (reloadT >= w2.reloadTime) {
      const a = ammo[currentItem()];
      const take = Math.min(w2.magazine - a.mag, a.res);
      a.mag += take;
      a.res -= take;
      cancelReload();
      updateAmmoHud();
    }
  }
}

function resetItems() {
  for (const k in WEAPONS) { ammo[k].mag = WEAPONS[k].magazine; ammo[k].res = WEAPONS[k].reserve; ammo[k].lastShot = -Infinity; }
  cancelReload(); // clears reloading/reloadT/reloadAuto and hides the HUD bar
  slot = 1;
  mode = MODE.WEAPON;
  for (const k in models) models[k].visible = k === 'rifle';
  tips.rifle.add(muzzleFlash);
  muzzleFlash.visible = false;
  equipT = 1;
  swingT = -1;
  pickaxeModel.rotation.set(0.35, 0.5, -0.35);
  lastShotT = -Infinity;
  firedThisPress = false;
  dryPlayed = false;
  recoil = 0;
  sprintPose = 0; bobT = 0; swayX = 0; swayY = 0;
  basePos.copy(ITEM_HIP.rifle);
  hand.position.copy(ITEM_HIP.rifle);
  hand.rotation.set(0, 0, 0);
  hand.visible = true;
  resources.wood = 0; resources.stone = 0; resources.metal = 0;
  resetRockets();
}
