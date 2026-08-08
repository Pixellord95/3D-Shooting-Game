/* ===== enemies: data-driven types, staggered waves, projectiles, procedural anims ===== */
/* boss rig geometry (blocky, imposing) */
const torsoGeo = new THREE.BoxGeometry(0.85, 0.95, 0.5);
const headGeo = new THREE.SphereGeometry(0.34, 12, 10);
const armGeo = new THREE.BoxGeometry(0.2, 0.78, 0.2); armGeo.translate(0, -0.33, 0);
const legGeo = new THREE.BoxGeometry(0.25, 0.95, 0.25); legGeo.translate(0, -0.43, 0);

/* humanoid rig geometry for regular enemies (pivot at joint tops) */
const chestGeo = new THREE.BoxGeometry(0.6, 0.55, 0.32);
const waistGeo = new THREE.BoxGeometry(0.48, 0.34, 0.28);
const neckGeo = new THREE.BoxGeometry(0.13, 0.12, 0.13);
const upperArmGeo = new THREE.BoxGeometry(0.16, 0.36, 0.16); upperArmGeo.translate(0, -0.18, 0);
const forearmGeo = new THREE.BoxGeometry(0.13, 0.32, 0.13); forearmGeo.translate(0, -0.16, 0);
const handGeo = new THREE.BoxGeometry(0.15, 0.13, 0.15);
const thighGeo = new THREE.BoxGeometry(0.2, 0.44, 0.2); thighGeo.translate(0, -0.22, 0);
const shinGeo = new THREE.BoxGeometry(0.16, 0.42, 0.16); shinGeo.translate(0, -0.21, 0);
const shoeGeo = new THREE.BoxGeometry(0.19, 0.12, 0.32);
const hairGeo = new THREE.BoxGeometry(0.42, 0.17, 0.44);
const SKIN_TONES = [0xd9a878, 0xc78e5f, 0xa5683c, 0x8a5330, 0xe8c39a];
const PANT_COLORS = [0x3a4050, 0x4a3b30, 0x2e3b2e, 0x28303c];
const HAIR_COLORS = [0x2b2018, 0x4a3620, 0x11100f, 0x6e4a26, 0x999485];

const ENEMY_ANIM = { IDLE: 'idle', WALK: 'walk', ATTACK: 'attack', HIT: 'hit', DEAD: 'dead' };

/* attacks only connect from the player's own level */
const ATTACK_LEVEL_TOLERANCE = 1.4;
function isOnPlayerLevel(e) {
  return Math.abs((player.position.y - EYE) - e.position.y) <= ATTACK_LEVEL_TOLERANCE;
}
function canEnemyAttackPlayer(e, range) {
  if (state !== 'playing') return false;
  if (!isOnPlayerLevel(e)) return false;
  const dx = player.position.x - e.position.x, dz = player.position.z - e.position.z;
  if (Math.hypot(dx, dz) > range) return false;
  return hasLOS(e);
}
/* when the player is above, smash whatever they stand on instead */
function tryAttackSupportBuild(e, u) {
  let best = null, bestD = 4.6;
  for (const b of builds) {
    const d = e.position.distanceTo(b.position);
    if (d < bestD) { bestD = d; best = b; }
  }
  if (best) { u.attackT = 0; u.attackHit = false; u.attackTarget = best; }
}

const ENEMY_TYPES = {
  grunt:    { hp: 50, speed: 2.6, damage: 8, color: 0xc44747 },
  runner:   { hp: 30, speed: 5.0, damage: 6, scale: 0.85, color: 0xe08036 },
  brute:    { hp: 160, speed: 1.7, damage: 18, scale: 1.35, color: 0x783b8f },
  shooter:  { hp: 60, speed: 2.2, damage: 7, attackRange: 18, color: 0x3f68a8 },
  marksman: { hp: 40, speed: 2.4, damage: 13, attackRange: 26, color: 0x5a6b3f },
};
let spawnQueue = [], nextSpawnAt = 0, spawnFails = 0;

/* ---- minibosses ---- */
const MINIBOSS_TYPES = {
  crusher:  { name: 'Crusher', hp: 700, speed: 1.7, damage: 28, score: 300, scale: 1.7, color: 0x8f2f23, headMultiplier: 1.5 },
  ranger:   { name: 'Ranger', hp: 450, speed: 3.0, damage: 10, score: 350, scale: 1.3, color: 0x2fa38f, headMultiplier: 1.5 },
  summoner: { name: 'Summoner', hp: 550, speed: 2.0, damage: 12, score: 400, scale: 1.45, color: 0x7a3fd0, headMultiplier: 1.5 },
  guardian: { name: 'Guardian', hp: 850, speed: 1.8, damage: 20, score: 450, scale: 1.6, color: 0x3f68d0, headMultiplier: 1.5 },
};
const MINIBOSS_REWARD = { rifleAmmo: 45, shotgunAmmo: 10, wood: 40, stone: 30, metal: 20, health: 15 };
const SHIELD_HP = 160;
let lastBossPicks = [];

function getMinibossCount(w) {
  if (w < 3 || w % 3 !== 0) return 0;
  if (w >= 15) return 3;
  if (w >= 9) return 2;
  return 1;
}
function activeBossCount() {
  let n = 0;
  for (const e of enemies) if (e.userData.boss && !e.userData.dying) n++;
  return n;
}

/* shared boss extras */
const robeGeo = new THREE.ConeGeometry(1, 1, 8);
const shieldGeo = new THREE.SphereGeometry(1, 16, 12);
const shieldMat = new THREE.MeshBasicMaterial({ color: 0x7ec8ff, transparent: true, opacity: 0.28, depthWrite: false });
const shieldRingGeo = new THREE.TorusGeometry(1, 0.05, 8, 20);
const shieldRingMat = new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.55 });

/* glowing eyes, colored per boss type — a shared, cheap way to make each silhouette read instantly */
const eyeGeo = new THREE.BoxGeometry(0.07, 0.06, 0.05);
const BOSS_EYE_MATS = {
  crusher: new THREE.MeshBasicMaterial({ color: 0xff3b2f }),
  ranger: new THREE.MeshBasicMaterial({ color: 0x4be8ff }),
  summoner: new THREE.MeshBasicMaterial({ color: 0xcf8aff }),
  guardian: new THREE.MeshBasicMaterial({ color: 0x5fb0ff }),
};
/* crusher: shoulder spikes + cracked chest plate */
const crusherSpikeGeo = new THREE.ConeGeometry(0.16, 0.5, 5);
const crusherDarkMat = getMat(0x341410);
/* ranger: backpack thruster glow */
const thrusterGlowGeo = new THREE.SphereGeometry(0.09, 8, 6);
const thrusterGlowMat = new THREE.MeshBasicMaterial({ color: 0x4be8ff });
/* summoner: floating rune ring above the hood */
const runeRingGeo = new THREE.TorusGeometry(0.55, 0.045, 6, 16);
const runeRingMat = new THREE.MeshBasicMaterial({ color: 0xcf8aff, transparent: true, opacity: 0.75 });
/* guardian: crown */
const crownGeo = new THREE.CylinderGeometry(0.26, 0.32, 0.16, 8);

/* pooled shockwave rings */
const ringGeo = new THREE.RingGeometry(0.85, 1.05, 22);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc27d, transparent: true, side: THREE.DoubleSide, depthWrite: false });
const shockRings = [];
for (let i = 0; i < 3; i++) {
  const m = new THREE.Mesh(ringGeo, ringMat);
  m.rotation.x = -Math.PI / 2;
  m.visible = false;
  scene.add(m);
  shockRings.push({ mesh: m, t: -1 });
}
function updateRings(dt) {
  for (const r of shockRings) {
    if (r.t < 0) continue;
    r.t += dt;
    const s = 1 + r.t * 14;
    r.mesh.scale.set(s, s, 1);
    ringMat.opacity = Math.max(0, 0.8 - r.t * 1.8);
    if (r.t > 0.45) { r.t = -1; r.mesh.visible = false; }
  }
}
function triggerShock(x, z, now) {
  for (const r of shockRings) {
    if (r.t < 0) {
      r.t = 0;
      r.mesh.visible = true;
      r.mesh.position.set(x, 0.12, z);
      r.mesh.scale.set(1, 1, 1);
      break;
    }
  }
  sShock();
  addShake(0.09, 0.22);
  _v1.set(x, 0.6, z);
  spawnBurst(_v1, 0xffc27d, 8, 6);
  if (onGround && player.position.y - EYE < 1.2 &&
      Math.hypot(player.position.x - x, player.position.z - z) < 5.5) damagePlayer(14);
  for (let i = builds.length - 1; i >= 0; i--) {
    const b = builds[i];
    if (Math.hypot(b.position.x - x, b.position.z - z) < 3.6) damageBuild(b, 90, null);
  }
}

function findSpawnPos(minR, maxR, rad) {
  for (let i = 0; i < 50; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = minR + Math.random() * (maxR - minR);
    const x = player.position.x + Math.cos(a) * r;
    const z = player.position.z + Math.sin(a) * r;
    if (!blocked(x, z, rad)) return new THREE.Vector3(x, 0, z);
  }
  for (let i = 0; i < 100; i++) {
    const x = (Math.random() - 0.5) * 290;
    const z = (Math.random() - 0.5) * 290;
    if (Math.hypot(x - player.position.x, z - player.position.z) >= 25 && !blocked(x, z, rad)) {
      return new THREE.Vector3(x, 0, z);
    }
  }
  return null;
}

/* pooled slow projectiles for shooters */
const projGeo = new THREE.SphereGeometry(0.17, 8, 6);
const projMat = new THREE.MeshBasicMaterial({ color: 0x7ed0ff });
const projectiles = [];
for (let i = 0; i < 14; i++) {
  const m = new THREE.Mesh(projGeo, projMat);
  m.visible = false;
  scene.add(m);
  projectiles.push({ mesh: m, active: false, vx: 0, vy: 0, vz: 0, dmg: 0, life: 0 });
}

function waveComposition(w) {
  const total = Math.min(5 + w * 3, 40);
  const q = [];
  for (let i = 0; i < total; i++) {
    const r = Math.random();
    let t = 'grunt';
    if (w >= 3 && r < 0.12) t = 'marksman';
    else if (w >= 4 && r < 0.32) t = 'shooter';
    else if (w >= 4 && r < 0.47) t = 'brute';
    else if (w >= 2 && r < 0.67) t = 'runner';
    q.push(t);
  }
  return q;
}

function spawnEnemy(typeKey, atPos) {
  const td = ENEMY_TYPES[typeKey] || ENEMY_TYPES.grunt;
  // ring around the player, not inside cover
  const spawnPosition = atPos || findSpawnPos(28, 40, 0.7);
  if (!spawnPosition) return false;

  /* humanoid rig: shirt = unique flash material, skin = unique material; rest shared */
  const mat = new THREE.MeshLambertMaterial({ color: td.color });
  mat.color.offsetHSL((Math.random() - 0.5) * 0.04, 0, (Math.random() - 0.5) * 0.08);
  const headMat = new THREE.MeshLambertMaterial({ color: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)] });
  const pantsMat = getMat(PANT_COLORS[Math.floor(Math.random() * PANT_COLORS.length)]);
  const shoeMat = getMat(0x24262a);
  const e = new THREE.Group();

  const makeLeg = sideX => {
    const hip = new THREE.Group();
    hip.position.set(sideX, 0.98, 0);
    const thigh = new THREE.Mesh(thighGeo, pantsMat);
    thigh.castShadow = true;
    const knee = new THREE.Group();
    knee.position.y = -0.44;
    const shin = new THREE.Mesh(shinGeo, pantsMat);
    const shoe = new THREE.Mesh(shoeGeo, shoeMat);
    shoe.position.set(0, -0.4, 0.05);
    knee.add(shin, shoe);
    hip.add(thigh, knee);
    return { hip, knee, thigh };
  };
  const L = makeLeg(-0.16), R = makeLeg(0.16);

  const body = new THREE.Group();
  body.position.y = 0.98;
  const waist = new THREE.Mesh(waistGeo, pantsMat);
  waist.position.y = 0.16;
  const chest = new THREE.Mesh(chestGeo, mat);
  chest.position.y = 0.46;
  chest.castShadow = true;
  const neck = new THREE.Mesh(neckGeo, headMat);
  neck.position.y = 0.76;
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 0.98;
  head.scale.setScalar(0.75);
  head.castShadow = true;
  body.add(waist, chest, neck, head);

  const makeArm = sideX => {
    const shoulder = new THREE.Group();
    shoulder.position.set(sideX, 0.66, 0);
    const upper = new THREE.Mesh(upperArmGeo, mat);
    const elbow = new THREE.Group();
    elbow.position.y = -0.36;
    elbow.rotation.x = -0.25;
    const fore = new THREE.Mesh(forearmGeo, headMat);
    const hand = new THREE.Mesh(handGeo, headMat);
    hand.position.y = -0.34;
    elbow.add(fore, hand);
    shoulder.add(upper, elbow);
    body.add(shoulder);
    return { shoulder, elbow };
  };
  const AL = makeArm(-0.4), AR = makeArm(0.4);

  /* type flavor: hair, helmet, cap, mask, build */
  if (typeKey === 'brute') {
    chest.scale.set(1.35, 1.1, 1.3);
    const mask = new THREE.Mesh(unitBox, shoeMat);
    mask.scale.set(0.36, 0.14, 0.1);
    mask.position.set(0, 0.99, 0.22);
    body.add(mask);
  } else if (typeKey === 'shooter') {
    const helmet = new THREE.Mesh(hairGeo, getMat(0x39434f));
    helmet.scale.set(1.15, 1.5, 1.15);
    helmet.position.y = 1.18;
    body.add(helmet);
  } else if (typeKey === 'runner') {
    const cap = new THREE.Mesh(hairGeo, mat);
    cap.scale.set(1, 0.8, 1);
    cap.position.y = 1.2;
    body.add(cap);
  } else if (typeKey === 'marksman') {
    const bandana = new THREE.Mesh(hairGeo, getMat(0x2c3620));
    bandana.scale.set(1.05, 0.42, 1.05);
    bandana.position.y = 1.1;
    body.add(bandana);
  } else if (Math.random() < 0.72) {
    const hair = new THREE.Mesh(hairGeo, getMat(HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)]));
    hair.position.y = 1.19;
    body.add(hair);
  }

  e.add(L.hip, R.hip, body);
  const parts = [chest, head, waist, L.hip.children[0], R.hip.children[0], AL.shoulder.children[0], AR.shoulder.children[0]];
  for (const p of parts) p.userData.root = e;
  head.userData.isHead = true;

  const baseScale = (td.scale || 1) * (0.92 + Math.random() * 0.16);
  e.userData = {
    td, type: typeKey,
    hp: td.hp * (1 + wave * 0.05), dying: false, deathT: 0, lastAttack: 0,
    speed: td.speed + wave * 0.1 + Math.random() * 0.5,
    torso: body, head, armL: AL.shoulder, armR: AR.shoulder,
    elbowL: AL.elbow, elbowR: AR.elbow,
    legL: L.hip, legR: R.hip, kneeL: L.knee, kneeR: R.knee,
    parts, mat, headMat,
    flash: 0, hitT: 0, stuckT: 0, phase: Math.random() * 6,
    moveBlend: 0, anim: ENEMY_ANIM.IDLE,
    attackT: -1, attackHit: false, attackTarget: null,
    kbx: 0, kbz: 0, baseScale, spawnT: 0, lastRanged: 0,
  };
  e.scale.setScalar(0.01);
  e.position.copy(spawnPosition);
  scene.add(e);
  enemies.push(e);
  if (spawnPosition.distanceTo(player.position) < 45) sSpawn();
  return e;
}

/* ---- miniboss rigs: standard six-part frame + type-specific extras ---- */
function spawnMiniboss(typeKey) {
  if (activeBossCount() >= 3) return false;
  const td = MINIBOSS_TYPES[typeKey];
  let pos = null;
  for (let tries = 0; tries < 4 && !pos; tries++) {
    pos = findSpawnPos(22, 32, 1.3);
    if (pos) {
      for (const o of enemies) {
        if (!o.userData.dying && o.position.distanceTo(pos) < 3) { pos = null; break; }
      }
    }
  }
  if (!pos) pos = findSpawnPos(22, 34, 1.3);
  if (!pos) return false;

  const mat = new THREE.MeshLambertMaterial({ color: td.color });
  const headMat = new THREE.MeshLambertMaterial({ color: 0x1d232b });
  const e = new THREE.Group();
  const torso = new THREE.Mesh(torsoGeo, mat);
  torso.position.y = 1.32;
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 2.02;
  const armL = new THREE.Mesh(armGeo, mat), armR = new THREE.Mesh(armGeo, mat);
  armL.position.set(-0.6, 1.72, 0); armR.position.set(0.6, 1.72, 0);
  const legL = new THREE.Mesh(legGeo, mat), legR = new THREE.Mesh(legGeo, mat);
  legL.position.set(-0.25, 0.95, 0); legR.position.set(0.25, 0.95, 0);
  torso.castShadow = head.castShadow = true;
  const parts = [torso, head, armL, armR, legL, legR];
  e.add(torso, head, armL, armR, legL, legR);
  let shieldMesh = null, orb = null, runeRing = null;

  /* glowing eyes on every boss — cheap, instantly readable silhouette */
  const eyeMat = BOSS_EYE_MATS[typeKey];
  for (const ex of [-0.11, 0.11]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(ex, 2.06, 0.29);
    e.add(eye);
  }

  if (typeKey === 'crusher') {
    torso.scale.set(1.7, 1.15, 1.5);
    armL.scale.set(1.9, 1.35, 1.9); armR.scale.set(1.9, 1.35, 1.9);
    legL.scale.set(1.5, 1, 1.5); legR.scale.set(1.5, 1, 1.5);
    for (const sx of [-0.85, 0.85]) {
      const slab = new THREE.Mesh(unitBox, mat);
      slab.scale.set(0.55, 0.35, 0.7);
      slab.position.set(sx, 1.95, 0);
      e.add(slab); parts.push(slab);
      const spike = new THREE.Mesh(crusherSpikeGeo, crusherDarkMat);
      spike.position.set(sx, 2.22, 0);
      spike.castShadow = true;
      e.add(spike); parts.push(spike);
    }
    const chestPlate = new THREE.Mesh(unitBox, crusherDarkMat);
    chestPlate.scale.set(0.9, 0.55, 0.12);
    chestPlate.position.set(0, 1.35, 0.62);
    e.add(chestPlate); parts.push(chestPlate);
  } else if (typeKey === 'ranger') {
    torso.scale.set(0.85, 1.25, 0.85);
    head.scale.set(0.9, 0.9, 0.9);
    const visor = new THREE.Mesh(unitBox, getMat(0xffd34d));
    visor.scale.set(0.42, 0.1, 0.1); visor.position.set(0, 2.05, 0.28);
    const cannon = new THREE.Mesh(unitBox, mat);
    cannon.scale.set(0.22, 0.22, 0.9); cannon.position.set(0, -0.55, -0.3);
    armR.add(cannon); parts.push(cannon);
    e.add(visor);
    const antenna = new THREE.Mesh(unitBox, getMat(0x1d232b));
    antenna.scale.set(0.04, 0.32, 0.04); antenna.position.set(0.12, 2.35, -0.1);
    e.add(antenna);
    const pack = new THREE.Mesh(unitBox, getMat(0x24343a));
    pack.scale.set(0.5, 0.55, 0.28); pack.position.set(0, 1.55, -0.42);
    e.add(pack); parts.push(pack);
    for (const ex of [-0.2, 0.2]) {
      const thruster = new THREE.Mesh(thrusterGlowGeo, thrusterGlowMat);
      thruster.position.set(ex, 1.35, -0.5);
      e.add(thruster);
    }
  } else if (typeKey === 'summoner') {
    const robe = new THREE.Mesh(robeGeo, mat);
    robe.scale.set(1.5, 2.3, 1.5); robe.position.y = 1.15;
    robe.castShadow = true;
    e.add(robe); parts.push(robe);
    const hood = new THREE.Mesh(robeGeo, mat); // pointed cap sitting above the head, clear of the glowing eyes
    hood.scale.set(0.5, 0.55, 0.5); hood.position.y = 2.5;
    e.add(hood); parts.push(hood);
    const staff = new THREE.Mesh(unitBox, getMat(0x4a2f1a));
    staff.scale.set(0.09, 1.6, 0.09); staff.position.set(0.15, -0.5, 0);
    orb = new THREE.Mesh(headGeo, getMat(0xcf8aff));
    orb.scale.set(0.55, 0.55, 0.55); orb.position.set(0.15, 0.35, 0);
    armR.add(staff, orb);
    runeRing = new THREE.Mesh(runeRingGeo, runeRingMat);
    runeRing.rotation.x = Math.PI / 2;
    runeRing.position.y = 1.5;
    e.add(runeRing);
  } else { // guardian
    torso.scale.set(1.45, 1.2, 1.2);
    const gold = getMat(0xd8b25a);
    const belt = new THREE.Mesh(unitBox, gold);
    belt.scale.set(1.35, 0.18, 0.75); belt.position.y = 1.05;
    e.add(belt);
    for (const sx of [-0.62, 0.62]) {
      const pauldron = new THREE.Mesh(unitBox, gold);
      pauldron.scale.set(0.42, 0.3, 0.5);
      pauldron.position.set(sx, 1.85, 0);
      e.add(pauldron); parts.push(pauldron);
    }
    const crown = new THREE.Mesh(crownGeo, gold);
    crown.position.y = 2.28;
    e.add(crown); parts.push(crown);
    shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    shieldMesh.scale.set(2.1, 2.1, 2.1);
    shieldMesh.position.y = 1.3;
    shieldMesh.visible = false;
    const shieldRing = new THREE.Mesh(shieldRingGeo, shieldRingMat);
    shieldRing.rotation.x = Math.PI / 2;
    shieldMesh.add(shieldRing);
    e.add(shieldMesh);
  }
  for (const p of parts) p.userData.root = e;
  head.userData.isHead = true;

  const baseScale = td.scale;
  const hp = td.hp * (1 + wave * 0.04);
  e.userData = {
    td, type: typeKey, boss: typeKey, headMultiplier: td.headMultiplier,
    hp, maxHp: hp, dying: false, deathT: 0, lastAttack: 0,
    speed: td.speed,
    torso, head, armL, armR, legL, legR, parts, mat, headMat,
    flash: 0, hitT: 0, stuckT: 0, phase: Math.random() * 6,
    attackT: -1, attackHit: false, attackTarget: null,
    kbx: 0, kbz: 0, baseScale, spawnT: 0, lastRanged: 0,
    torsoLean: 0.06, bar: null, shieldMesh, orb, runeRing,
    bossState: 'roam', stateT: 0, chargeDx: 0, chargeDz: 0, chargeHit: false, nextChargeAt: elapsed + 4,
    nextBurstAt: elapsed + 3, burstLeft: 0, nextShotAt: 0, aimT: -1, strafeDir: 1, nextFlipAt: 0,
    nextSummonAt: elapsed + 4, castT: -1, summons: [],
    shieldOn: false, shieldHp: 0, shieldUntil: 0, nextShieldAt: elapsed + 2, vulnUntil: 0,
  };
  e.scale.setScalar(0.01);
  e.position.copy(pos);
  scene.add(e);
  enemies.push(e);
  createBossBar(e.userData, td);
  updateBossBar(e.userData);
  _v1.copy(pos); _v1.y = 1.5;
  spawnBurst(_v1, td.color, 10, 6);
  return e;
}

function bossRewards(e) {
  const td = e.userData.td;
  grantAmmo('rifle', MINIBOSS_REWARD.rifleAmmo);
  grantAmmo('shotgun', MINIBOSS_REWARD.shotgunAmmo);
  resources.wood += MINIBOSS_REWARD.wood;
  resources.stone += MINIBOSS_REWARD.stone;
  resources.metal += MINIBOSS_REWARD.metal;
  updateResHud();
  if (Math.random() < 0.75) { health = Math.min(100, health + MINIBOSS_REWARD.health); updateHealth(); }
  showGain('MINIBOSS DOWN  +' + td.score, '#ffd34d');
  sBossDie();
  addShake(0.06, 0.2);
  _v1.copy(e.position); _v1.y = 1.5;
  spawnBurst(_v1, td.color, 12, 7);
}

function startWave() {
  wave++;
  spawnQueue = waveComposition(wave);
  spawnFails = 0;
  nextSpawnAt = 0;
  let spawned = 0;
  for (let attempts = 0; spawned < Math.min(4, spawnQueue.length) && attempts < 12; attempts++) {
    if (spawnEnemy(spawnQueue[0])) { spawnQueue.shift(); spawned++; }
  }
  /* minibosses on every third wave, rotating types */
  const bossCount = getMinibossCount(wave);
  if (bossCount > 0) {
    const pool = Object.keys(MINIBOSS_TYPES);
    const picks = [];
    for (let i = 0; i < bossCount; i++) {
      let cands = pool.filter(k => !lastBossPicks.includes(k) && !picks.includes(k));
      if (!cands.length) cands = pool.filter(k => !picks.includes(k));
      if (!cands.length) cands = pool;
      picks.push(cands[Math.floor(Math.random() * cands.length)]);
    }
    lastBossPicks = picks;
    let ok = 0;
    for (const k of picks) if (spawnMiniboss(k)) ok++;
    if (ok > 0) {
      flashMsg('MINIBOSS INCOMING: ' + picks.map(k => MINIBOSS_TYPES[k].name.toUpperCase()).join(' + '), 2.8);
      sBossSpawn();
    }
  }
  banner('WAVE ' + wave);
  sWave();
  hudWave.textContent = wave;
  updateAliveHud(enemies.length + spawnQueue.length);
}

function killEnemy(e) {
  const u = e.userData;
  if (u.dying) return; // guard against double kill/reward
  u.dying = true;
  u.deathT = 0;
  u.attackT = -1;
  sKill();
  if (u.boss) {
    bossRewards(e);
    removeBossBar(u);
    if (u.shieldMesh) u.shieldMesh.visible = false;
  } else {
    dropAmmo(e);
  }
}

function removeEnemy(e) {
  scene.remove(e);
  const u = e.userData;
  if (u.bar) removeBossBar(u);
  if (u.mat) { u.mat.dispose(); u.mat = null; }
  if (u.headMat) { u.headMat.dispose(); u.headMat = null; }
}

function breakShield(u) {
  u.shieldOn = false;
  u.shieldHp = 0;
  u.vulnUntil = elapsed + 2.5;
  u.nextShieldAt = elapsed + 8;
  if (u.shieldMesh) u.shieldMesh.visible = false;
  sShieldBreak();
}

/* central damage: dmg is BASE damage; head multiplier resolved here.
   returns true if this damage killed the enemy */
function damageEnemy(e, dmg, isHead, headMult) {
  const u = e.userData;
  if (u.dying) return false;
  const mult = isHead ? (u.headMultiplier !== undefined ? u.headMultiplier : (headMult || 1)) : 1;
  let final = dmg * mult;
  if (u.boss === 'guardian') {
    if (u.shieldOn) {
      u.shieldHp -= final;
      final *= 0.3; // shield soaks most of the hit
      if (u.shieldHp <= 0) breakShield(u);
    } else if (elapsed < u.vulnUntil) {
      final *= 1.5; // briefly vulnerable after a shield break
    }
  }
  u.hp -= final;
  u.hitT = 0.18;
  u.mat.emissive.setHex(0xffffff);
  u.headMat.emissive.setHex(0xffffff);
  u.flash = 0.07;
  if (u.bar) updateBossBar(u);
  if (u.hp <= 0) {
    score += u.boss ? u.td.score : (isHead ? 25 : 10);
    hudScore.textContent = score;
    if (isHead && !u.boss) { sHead(); showGain('+25 HEADSHOT', '#ff8a5f'); }
    killEnemy(e);
    return true;
  }
  if (u.boss || u.td === ENEMY_TYPES.brute) sfx(150, 60, 0.12, 'square', 0.12); else sHit();
  return false;
}

function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

function fireProjectile(e, now, speed) {
  const u = e.userData;
  let p = null;
  for (const q of projectiles) if (!q.active) { p = q; break; }
  if (!p) return;
  u.lastRanged = now;
  if (!u.boss) { u.attackT = 0; u.attackHit = true; u.attackTarget = null; } // arm-raise anim only
  p.active = true;
  p.mesh.visible = true;
  p.mesh.position.set(e.position.x, 1.8 * u.baseScale, e.position.z);
  _v1.copy(player.position).sub(p.mesh.position).normalize();
  const SPD = speed || 13;
  p.vx = _v1.x * SPD; p.vy = _v1.y * SPD; p.vz = _v1.z * SPD;
  p.dmg = u.td.damage + Math.floor(wave * 0.5);
  p.life = 3;
  sBolt();
}

/* ---- boss helpers ---- */
function bossMove(e, u, dt, mvx, mvz, speed) {
  const ox = e.position.x, oz = e.position.z;
  const step = (speed || u.speed) * dt;
  slideMove(e, mvx * step + u.kbx * dt, mvz * step + u.kbz * dt, 0.7 * u.baseScale);
  const moved = Math.hypot(e.position.x - ox, e.position.z - oz);
  if (moved < step * 0.3) {
    u.stuckT += dt;
    if (u.stuckT > 0.6) {
      u.stuckT = 0;
      let best = null, bestD = 4.4;
      for (const b of builds) {
        const d = e.position.distanceTo(b.position);
        if (d < bestD) { bestD = d; best = b; }
      }
      if (best) { u.attackT = 0; u.attackHit = false; u.attackTarget = best; }
    }
  } else {
    u.stuckT = Math.max(0, u.stuckT - dt * 2);
  }
  return moved;
}
function bossWalkAnim(e, u, now, moving) {
  if (!moving) {
    u.legL.rotation.x *= 0.9; u.legR.rotation.x *= 0.9;
    return;
  }
  const ph = now * u.speed * 2.2 + u.phase;
  const sw = Math.sin(ph);
  u.legL.rotation.x = sw * 0.5;
  u.legR.rotation.x = -sw * 0.5;
  u.armL.rotation.x = -sw * 0.3;
  u.armR.rotation.x = sw * 0.3;
  e.position.y = Math.abs(sw) * 0.06;
}
/* shared melee machine (player or targeted build); returns true while attacking */
function bossMelee(e, u, dt, now, dist) {
  if (u.attackT >= 0) {
    u.attackT += dt;
    const t = u.attackT;
    const wind = t < 0.34 ? (t / 0.34) : Math.max(0, 1 - (t - 0.34) / 0.16);
    u.armL.rotation.x = u.armR.rotation.x = -wind * 2.2;
    if (!u.attackHit && t >= 0.36) {
      u.attackHit = true;
      if (u.attackTarget) {
        if (builds.indexOf(u.attackTarget) !== -1 &&
            e.position.distanceTo(u.attackTarget.position) < 4.8) {
          damageBuild(u.attackTarget, u.td.damage * 3, null);
          sThud();
        }
      } else if (dist < 2.5 * u.baseScale && isOnPlayerLevel(e)) {
        damagePlayer(u.td.damage);
      }
    }
    if (t >= 0.62) { u.attackT = -1; u.attackTarget = null; }
    return true;
  }
  if (dist <= 2.1 * u.baseScale && now - u.lastAttack > 1.5) {
    if (!canEnemyAttackPlayer(e, 2.3 * u.baseScale)) {
      u.lastAttack = now - 0.9; // backoff, then smash the player's platform instead
      if (!isOnPlayerLevel(e)) tryAttackSupportBuild(e, u);
      return u.attackT >= 0;
    }
    u.lastAttack = now;
    u.attackT = 0;
    u.attackHit = false;
    u.attackTarget = null;
    return true;
  }
  return false;
}

function updateBossBehavior(e, u, dt, now, dist, dx, dz) {
  const nx = dx / dist, nz = dz / dist;
  u.torsoLean = 0.06;

  if (u.boss === 'crusher') {
    if (u.bossState === 'wind') {
      u.stateT += dt;
      u.torsoLean = -0.42; // clear telegraph: lean back
      u.armL.rotation.x = u.armR.rotation.x = -2.2 * Math.min(1, u.stateT / 0.35);
      if (u.stateT >= 0.7) {
        u.bossState = 'charge';
        u.stateT = 0;
        u.chargeHit = false;
        u.chargeDx = nx; u.chargeDz = nz; // direction locked → dodgeable
      }
    } else if (u.bossState === 'charge') {
      u.stateT += dt;
      u.torsoLean = 0.5;
      const step = 13 * dt;
      const ox = e.position.x, oz = e.position.z;
      slideMove(e, u.chargeDx * step, u.chargeDz * step, 0.75 * u.baseScale);
      const moved = Math.hypot(e.position.x - ox, e.position.z - oz);
      if (!u.chargeHit && dist < 2.7 * u.baseScale && isOnPlayerLevel(e)) {
        u.chargeHit = true;
        damagePlayer(u.td.damage);
        if (state !== 'playing') return;
      }
      for (let i = builds.length - 1; i >= 0; i--) {
        const b = builds[i];
        if (e.position.distanceTo(b.position) < 3.1) damageBuild(b, 220, null);
      }
      if (moved < step * 0.4 || u.stateT > 1.15) {
        u.bossState = 'roam';
        u.nextChargeAt = now + 7;
        triggerShock(e.position.x, e.position.z, now);
        if (state !== 'playing') return;
      }
    } else {
      if (!bossMelee(e, u, dt, now, dist)) {
        if (now >= u.nextChargeAt && dist > 7 && dist < 26) {
          u.bossState = 'wind';
          u.stateT = 0;
          sCharge();
        } else if (dist > 2.1 * u.baseScale) {
          bossMove(e, u, dt, nx, nz);
          bossWalkAnim(e, u, now, true);
        }
      }
      if (state !== 'playing') return;
    }
  } else if (u.boss === 'ranger') {
    if (now >= u.nextFlipAt) { u.strafeDir = Math.random() < 0.5 ? -1 : 1; u.nextFlipAt = now + 2 + Math.random() * 1.5; }
    let mvx = 0, mvz = 0;
    if (dist > 20) { mvx = nx; mvz = nz; }
    else if (dist < 10) { mvx = -nx; mvz = -nz; }
    else { mvx = -nz * u.strafeDir; mvz = nx * u.strafeDir; } // sidestep
    if (u.aimT >= 0) { // telegraph: cannon raised
      u.aimT += dt;
      u.armR.rotation.x = -1.6;
      if (u.aimT >= 0.5) { u.aimT = -1; u.burstLeft = 4; u.nextShotAt = now; }
    } else if (u.burstLeft > 0) {
      u.armR.rotation.x = -1.6;
      if (now >= u.nextShotAt) {
        if (hasLOS(e)) fireProjectile(e, now, 16);
        u.burstLeft--;
        u.nextShotAt = now + 0.14;
        if (u.burstLeft === 0) u.nextBurstAt = now + 3;
      }
    } else {
      if (now >= u.nextBurstAt && dist < 24 && isOnPlayerLevel(e) && hasLOS(e)) { u.aimT = 0; sAim(); }
      const moved = bossMove(e, u, dt, mvx, mvz);
      bossWalkAnim(e, u, now, moved > 0.001);
    }
    if (u.attackT >= 0) bossMelee(e, u, dt, now, dist); // smash blocking builds
    if (state !== 'playing') return;
  } else if (u.boss === 'summoner') {
    if (u.runeRing) u.runeRing.rotation.z += dt * 1.4;
    /* prune dead summon refs without allocating */
    for (let i = u.summons.length - 1; i >= 0; i--) {
      const s = u.summons[i];
      if (s.userData.dying || enemies.indexOf(s) === -1) u.summons.splice(i, 1);
    }
    if (u.castT >= 0) {
      u.castT += dt;
      u.armL.rotation.x = u.armR.rotation.x = -2.4; // arms raised — clear telegraph
      if (u.orb) { const s = 0.55 + Math.sin(u.castT * 18) * 0.15; u.orb.scale.set(s, s, s); }
      if (u.castT >= 1) {
        u.castT = -1;
        u.nextSummonAt = now + 9;
        const n = 2 + (Math.random() < 0.5 ? 1 : 0);
        for (let i = 0; i < n && u.summons.length < 4 && enemies.length < 55; i++) {
          const a = Math.random() * Math.PI * 2;
          const sx = e.position.x + Math.cos(a) * 3.2, sz = e.position.z + Math.sin(a) * 3.2;
          if (blocked(sx, sz, 0.7)) continue;
          _v1.set(sx, 0, sz);
          const s = spawnEnemy(Math.random() < 0.5 ? 'runner' : 'grunt', _v1.clone());
          if (s) { s.userData.summoned = true; u.summons.push(s); }
        }
        sSummon();
        _v1.copy(e.position); _v1.y = 2;
        spawnBurst(_v1, 0xcf8aff, 8, 5);
        if (u.orb) u.orb.scale.set(0.55, 0.55, 0.55);
      }
    } else {
      if (now >= u.nextSummonAt && u.summons.length < 4) { u.castT = 0; sSummon(); }
      let mvx = 0, mvz = 0;
      if (dist > 16) { mvx = nx; mvz = nz; }
      else if (dist < 9) { mvx = -nx; mvz = -nz; }
      const moved = bossMove(e, u, dt, mvx, mvz);
      bossWalkAnim(e, u, now, moved > 0.001);
      e.position.y = Math.sin(now * 2 + u.phase) * 0.12 + 0.12; // hover
      if (u.attackT >= 0 || dist <= 2.1 * u.baseScale) bossMelee(e, u, dt, now, dist);
      if (state !== 'playing') return;
    }
  } else { // guardian
    if (!u.shieldOn && now >= u.nextShieldAt && now >= u.vulnUntil) {
      u.shieldOn = true;
      u.shieldHp = SHIELD_HP;
      u.shieldUntil = now + 5;
      sShieldUp();
      if (u.bar) updateBossBar(u);
    }
    if (u.shieldOn && now >= u.shieldUntil) {
      u.shieldOn = false;
      u.shieldHp = 0;
      u.nextShieldAt = now + 6;
      if (u.bar) updateBossBar(u);
    }
    if (u.shieldMesh) {
      u.shieldMesh.visible = u.shieldOn;
      if (u.shieldOn) {
        const s = 2.1 + Math.sin(now * 6) * 0.08;
        u.shieldMesh.scale.set(s, s, s);
      }
    }
    if (!bossMelee(e, u, dt, now, dist)) {
      if (dist > 2.1 * u.baseScale) {
        bossMove(e, u, dt, nx, nz);
        bossWalkAnim(e, u, now, true);
      }
    }
    if (state !== 'playing') return;
  }
}

/* clear line of sight from enemy head to player eye? */
function hasLOS(e) {
  _v1.set(e.position.x, 1.8 * e.userData.baseScale, e.position.z);
  _v2.copy(player.position).sub(_v1);
  const d = _v2.length();
  _v2.normalize();
  raycaster.set(_v1, _v2);
  raycaster.far = d - 0.6;
  const hit = raycaster.intersectObjects(solids)[0];
  raycaster.far = Infinity;
  return !hit;
}

function updateProjectiles(dt) {
  for (const p of projectiles) {
    if (!p.active) continue;
    p.life -= dt;
    const prevY = p.mesh.position.y;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    const m = p.mesh.position;
    let dead = p.life <= 0 || m.y < 0.05;
    if (!dead) { // floors and ramps stop projectiles
      const sup = supportHeightAt(m.x, m.z);
      if (sup > 0.01 && prevY > sup && m.y <= sup + 0.05) {
        spawnBurst(m, 0x7ed0ff, 3, 3);
        dead = true;
      }
    }
    if (!dead && Math.hypot(m.x - player.position.x, m.z - player.position.z) < 0.75 &&
        Math.abs(m.y - player.position.y) < 1.2) {
      damagePlayer(p.dmg);
      dead = true;
    }
    if (!dead && blocked(m.x, m.z, 0.15, m.y - 0.2, 0.4, false)) {
      spawnBurst(m, 0x7ed0ff, 3, 3);
      dead = true;
    }
    if (dead) { p.active = false; p.mesh.visible = false; }
  }
}

function resetProjectiles() {
  for (const p of projectiles) { p.active = false; p.mesh.visible = false; }
  for (const r of shockRings) { r.t = -1; r.mesh.visible = false; }
  spawnQueue = [];
  nextSpawnAt = 0;
  lastBossPicks = [];
}

function updateEnemies(dt, now) {
  /* staggered wave spawning */
  if (spawnQueue.length && now >= nextSpawnAt) {
    nextSpawnAt = now + 0.3;
    if (spawnEnemy(spawnQueue[0])) { spawnQueue.shift(); spawnFails = 0; }
    else if (++spawnFails > 8) spawnQueue.shift();
  }

  let alive = 0;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const u = e.userData;

    if (u.dying) {
      u.anim = ENEMY_ANIM.DEAD;
      u.deathT += dt;
      const t = u.deathT;
      e.rotation.x = Math.min(1.45, t * 3.8); // fall forward
      if (t > 0.4) {
        const s = Math.max(0.01, u.baseScale * (1 - (t - 0.4) * 2.6));
        e.scale.setScalar(s);
      }
      if (t > 0.78) {
        removeEnemy(e);
        enemies.splice(i, 1);
      }
      continue;
    }

    alive++;

    /* spawn pop-in */
    if (u.spawnT < 1) {
      u.spawnT += dt / 0.35;
      e.scale.setScalar(u.baseScale * Math.min(1, u.spawnT));
      continue;
    }

    if (u.flash > 0) {
      u.flash -= dt;
      if (u.flash <= 0) { u.mat.emissive.setHex(0); u.headMat.emissive.setHex(0); }
    }
    if (u.hitT > 0) u.hitT -= dt;

    const tp = carState.occupied ? car.position : (heliState.occupied ? heli.position : player.position);
    const dx = tp.x - e.position.x;
    const dz = tp.z - e.position.z;
    const dist = Math.hypot(dx, dz);
    e.rotation.y = angleLerp(e.rotation.y, Math.atan2(dx, dz), dt * 7);

    /* minibosses run their own behavior machines */
    if (u.boss) {
      updateBossBehavior(e, u, dt, now, dist, dx, dz);
      if (state !== 'playing') return;
      u.kbx *= Math.pow(0.05, dt);
      u.kbz *= Math.pow(0.05, dt);
      u.torso.rotation.x = u.hitT > 0 ? -1.2 * u.hitT : u.torsoLean;
      continue;
    }

    /* attack state machine (player or blocking build) */
    if (u.attackT >= 0) {
      u.anim = ENEMY_ANIM.ATTACK;
      u.attackT += dt;
      const t = u.attackT;
      const wind = t < 0.28 ? (t / 0.28) : Math.max(0, 1 - (t - 0.28) / 0.14);
      u.armL.rotation.x = u.armR.rotation.x = -wind * 2.3;
      if (u.elbowL) u.elbowL.rotation.x = u.elbowR.rotation.x = -0.25 - wind * 0.5;
      if (!u.attackHit && t >= 0.3) {
        u.attackHit = true;
        if (u.attackTarget) {
          if (builds.indexOf(u.attackTarget) !== -1 &&
              e.position.distanceTo(u.attackTarget.position) < 4.2) {
            damageBuild(u.attackTarget, (u.td === ENEMY_TYPES.brute ? 40 : 22) + wave * 2, null);
            sThud();
          }
        } else if (dist < 2.3 * u.baseScale && isOnPlayerLevel(e)) {
          damagePlayer(u.td.damage + Math.floor(wave * 0.8));
          if (state !== 'playing') return;
        }
      }
      if (t >= 0.55) { u.attackT = -1; u.attackTarget = null; }
    } else {
      /* movement intent (shooters keep distance) */
      const nx = dx / dist, nz = dz / dist;
      let mvx = nx, mvz = nz;
      if (u.td.attackRange) {
        if (dist < u.td.attackRange * 0.5) { mvx = -nx; mvz = -nz; }
        else if (dist < u.td.attackRange * 0.92) { mvx = 0; mvz = 0; }
        if (now - u.lastRanged > 2.4 && dist < u.td.attackRange + 1 &&
            isOnPlayerLevel(e) && hasLOS(e)) {
          fireProjectile(e, now);
        }
      }
      let moved = 0;
      if ((mvx || mvz) && dist > 1.6) {
        const ox = e.position.x, oz = e.position.z;
        const step = u.speed * dt;
        slideMove(e, mvx * step + u.kbx * dt, mvz * step + u.kbz * dt, 0.55 * u.baseScale);
        moved = Math.hypot(e.position.x - ox, e.position.z - oz);
        if (moved < step * 0.3) {
          u.stuckT += dt;
          if (u.stuckT > 0.7) {
            u.stuckT = 0;
            tryAttackSupportBuild(e, u);
          }
        } else {
          u.stuckT = Math.max(0, u.stuckT - dt * 2);
        }
      } else if (dist <= 1.6 && now - u.lastAttack > 1.0) {
        if (canEnemyAttackPlayer(e, 1.8)) {
          u.lastAttack = now;
          u.attackT = 0;
          u.attackHit = false;
          u.attackTarget = null;
        } else {
          u.lastAttack = now - 0.6; // brief backoff before retrying LOS
          if (!isOnPlayerLevel(e)) tryAttackSupportBuild(e, u);
        }
      } else if (dist <= 3.4 && !isOnPlayerLevel(e) && now - u.lastAttack > 1.2) {
        u.lastAttack = now;
        tryAttackSupportBuild(e, u); // player is above: smash their platform
      }

      /* smooth idle↔walk blend with knees, elbows and lean */
      u.moveBlend += ((moved > 0.002 ? 1 : 0) - u.moveBlend) * Math.min(1, dt * 8);
      u.anim = u.moveBlend > 0.5 ? ENEMY_ANIM.WALK : ENEMY_ANIM.IDLE;
      const bl = u.moveBlend;
      const ph = now * u.speed * 2.7 + u.phase;
      const sw = Math.sin(ph) * bl;
      u.legL.rotation.x = sw * 0.55;
      u.legR.rotation.x = -sw * 0.55;
      if (u.kneeL) {
        u.kneeL.rotation.x = Math.max(0, Math.sin(ph + 1.1)) * 0.75 * bl;
        u.kneeR.rotation.x = Math.max(0, Math.sin(ph + Math.PI + 1.1)) * 0.75 * bl;
      }
      u.armL.rotation.x = -sw * 0.42;
      u.armR.rotation.x = sw * 0.42;
      if (u.elbowL) u.elbowL.rotation.x = u.elbowR.rotation.x = -0.25 - bl * 0.15;
      e.position.y = Math.abs(sw) * 0.06;
    }

    u.kbx *= Math.pow(0.05, dt);
    u.kbz *= Math.pow(0.05, dt);
    if (u.hitT > 0) { u.anim = ENEMY_ANIM.HIT; }
    u.torso.rotation.x = u.hitT > 0 ? -1.6 * u.hitT : 0.05 + u.moveBlend * 0.09;
  }

  updateProjectiles(dt);
  updateRings(dt);

  /* cheap pairwise separation so enemies do not stack */
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (a.userData.dying) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (b.userData.dying) continue;
      const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
      const d = Math.hypot(dx, dz);
      const rad = 0.55 * (a.userData.baseScale + b.userData.baseScale);
      if (d < rad && d > 0.0001) {
        const push = (rad - d) * 2.2 * dt, nx = dx / d, nz = dz / d;
        a.position.x -= nx * push; a.position.z -= nz * push;
        b.position.x += nx * push; b.position.z += nz * push;
      }
    }
  }

  // wave cleared?
  updateAliveHud(alive + spawnQueue.length);
  if (alive === 0 && enemies.length === 0 && spawnQueue.length === 0 && state === 'playing') {
    if (nextWaveAt === 0) {
      nextWaveAt = now + 3;
      health = Math.min(100, health + 20);
      updateHealth();
      grantWaveAmmo();
      banner('WAVE CLEARED  +20 HP · +AMMO');
    } else if (now >= nextWaveAt) {
      nextWaveAt = 0;
      startWave();
    }
  }
}
