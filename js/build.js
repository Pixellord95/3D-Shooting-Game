/* ===== build: grid-snapped walls, window walls, ramps, floors ===== */
const BUILD_GRID = 4;
const snap = value => Math.round(value / BUILD_GRID) * BUILD_GRID;
const snapLevel = y => Math.max(0, Math.min(3, Math.round(y / 3))) * 3;
const BUILD_TYPES = {
  wall:   { cost: 10, hp: 100 },
  window: { cost: 10, hp: 90 },
  door:   { cost: 10, hp: 110 },
  ramp:   { cost: 10, hp: 100 },
  floor:  { cost: 10, hp: 100 },
};
const MATERIALS = {
  wood:  { hp: 1.0, color: 0xb8793f, frame: 0x8f5c2e, tones: [0xb8793f, 0xa96f39, 0xc2854a], sound: () => sWood() },
  stone: { hp: 1.8, color: 0x888888, frame: 0x6a6a6a, tones: [0x8f8f8f, 0x848484, 0x9b9b9b], sound: () => sStone() },
  metal: { hp: 2.5, color: 0x647386, frame: 0x4c5866, tones: [0x6e7f92, 0x647386, 0x59687a], sound: () => sMetal() },
};
const MAT_KEYS = ['wood', 'stone', 'metal'];
const BUILD_ORDER = ['wall', 'window', 'door', 'ramp', 'floor'];
let selectedBuildIndex = 0;
let buildType = 'wall', buildMatIdx = 0, buildRot = 0; // buildRot: integer 0-3 → yaw = n*PI/2
let lastPlaceT = -Infinity;
const builds = [];
const doors = [];
const buildKeys = new Map(); // key → piece
const buildAnims = []; // {piece, t, dying}

function rotateBuild(direction) {
  buildRot = (buildRot + direction + 4) % 4;
  sSelect();
  updateSlotsHud();
}
function getBuildYaw() { return buildRot * Math.PI / 2; }

/* parts: [sx,sy,sz, x,y,z, color, rz?, rx?] */
function partsFor(type, matKey) {
  const m = MATERIALS[matKey], f = m.frame, T = m.tones;
  const p = [];
  const frame3 = () => p.push(
    [0.3, 3, 0.3, -1.85, 1.5, 0, f], [0.3, 3, 0.3, 1.85, 1.5, 0, f],
    [4, 0.28, 0.3, 0, 2.86, 0, f], [4, 0.24, 0.3, 0, 0.12, 0, f]);
  if (type === 'wall') {
    frame3();
    if (matKey === 'wood') {
      for (let i = 0; i < 5; i++) p.push([0.62, 2.55, 0.14, -1.32 + i * 0.66, 1.5, 0, T[i % 3]]);
      p.push([3.6, 0.2, 0.1, 0, 1.5, 0.1, f, 0.55]); // diagonal brace
    } else if (matKey === 'stone') {
      for (let i = 0; i < 3; i++) p.push([1.15, 1.25, 0.36, -1.2 + i * 1.2, 0.85, 0, T[i % 3]]);
      for (let i = 0; i < 2; i++) p.push([1.15, 1.25, 0.36, -0.6 + i * 1.2, 2.15, 0, T[(i + 1) % 3]]);
      p.push([0.55, 1.25, 0.36, -1.5, 2.15, 0, T[2]], [0.55, 1.25, 0.36, 1.5, 2.15, 0, T[0]]);
    } else {
      p.push([1.75, 2.55, 0.18, -0.92, 1.5, 0, T[0]], [1.75, 2.55, 0.18, 0.92, 1.5, 0, T[2]]);
      p.push([0.22, 2.8, 0.32, 0, 1.5, 0, f], [3.6, 0.18, 0.26, 0, 1.5, 0.06, f]);
      for (const [rx, ry] of [[-1.6, 0.45], [1.6, 0.45], [-1.6, 2.55], [1.6, 2.55]]) {
        p.push([0.09, 0.09, 0.08, rx, ry, 0.16, 0x39434f]);
      }
    }
  } else if (type === 'window') {
    frame3();
    p.push([3.4, 0.8, 0.2, 0, 0.64, 0, T[0]], [3.4, 0.58, 0.2, 0, 2.42, 0, T[1]]);
    p.push([0.6, 1.1, 0.2, -1.4, 1.55, 0, T[2]], [0.6, 1.1, 0.2, 1.4, 1.55, 0, T[0]]);
    p.push([2.3, 0.12, 0.26, 0, 1.1, 0, f], [2.3, 0.12, 0.26, 0, 2.06, 0, f]); // sill + header
    p.push([0.12, 1.0, 0.26, -1.04, 1.55, 0, f], [0.12, 1.0, 0.26, 1.04, 1.55, 0, f]);
  } else if (type === 'door') {
    p.push(
      [0.3, 3, 0.3, -1.85, 1.5, 0, f], [0.3, 3, 0.3, 1.85, 1.5, 0, f],
      [4, 0.28, 0.3, 0, 2.86, 0, f],
      [1.0, 2.75, 0.2, -1.35, 1.38, 0, T[0]], [1.0, 2.75, 0.2, 1.35, 1.38, 0, T[1]],
      [1.9, 0.5, 0.2, 0, 2.5, 0, T[2]],
      [0.14, 2.3, 0.34, -0.9, 1.15, 0, f], [0.14, 2.3, 0.34, 0.9, 1.15, 0, f]);
  } else if (type === 'floor') {
    p.push([4, 0.26, 0.3, 0, 0.13, -1.85, f], [4, 0.26, 0.3, 0, 0.13, 1.85, f]);
    p.push([0.3, 0.26, 3.4, -1.85, 0.13, 0, f], [0.3, 0.26, 3.4, 1.85, 0.13, 0, f]);
    for (let i = 0; i < 5; i++) p.push([0.7, 0.18, 3.5, -1.44 + i * 0.72, 0.11, 0, T[i % 3]]);
  } else { // ramp: steps + side stringers, rises toward local +z
    for (let i = 0; i < 6; i++) {
      const h = (i + 1) * 0.5;
      p.push([3.5, h, 0.68, 0, h / 2, -2 + 0.334 + i * 0.666, T[i % 3]]);
    }
    p.push([0.24, 0.5, 4.95, -1.87, 1.5, 0, f, 0, -0.6435], [0.24, 0.5, 4.95, 1.87, 1.5, 0, f, 0, -0.6435]);
  }
  return p;
}

function pieceGroup(parts, overrideMat) {
  const g = new THREE.Group();
  for (const p of parts) {
    const m = new THREE.Mesh(unitBox, overrideMat || getMat(p[6]));
    m.scale.set(p[0], p[1], p[2]);
    m.position.set(p[3], p[4], p[5]);
    if (p[7]) m.rotation.z = p[7];
    if (p[8]) m.rotation.x = p[8];
    if (!overrideMat) m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

/* animated door blade (hinged at local x = -0.85) */
function makeDoorBlade(matKey) {
  const m = MATERIALS[matKey], T = m.tones;
  const g = new THREE.Group();
  g.position.set(-0.85, 0, 0);
  const add = (sx, sy, sz, x, y, z, c) => {
    const mesh = new THREE.Mesh(unitBox, getMat(c));
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
  };
  add(1.6, 2.28, 0.09, 0.82, 1.15, 0, T[0]);
  add(0.52, 2.2, 0.11, 0.5, 1.15, 0, T[1]);
  add(0.52, 2.2, 0.11, 1.14, 1.15, 0, T[2]);
  add(1.5, 0.16, 0.12, 0.82, 1.95, 0, m.frame);
  add(1.5, 0.16, 0.12, 0.82, 0.4, 0, m.frame);
  add(0.11, 0.11, 0.16, 1.48, 1.12, 0.06, 0xd8b25a); // handle
  return g;
}

/* ghost previews: one cached model per type, one shared translucent material */
const ghostMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.42, depthWrite: false });
const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85, depthWrite: false });
const arrowGeo = new THREE.ConeGeometry(0.3, 0.75, 6);
const ghosts = {};
let ghost = null, ghostValid = false, ghostReason = '', ghostCell = { x: 0, y: 0, z: 0 }, ghostScale = 1;
function selectGhost(type) {
  if (!ghosts[type]) {
    const g = pieceGroup(partsFor(type, 'wood'), ghostMat);
    if (type === 'door') { // static blade in the preview
      const blade = new THREE.Mesh(unitBox, ghostMat);
      blade.scale.set(1.7, 2.3, 0.1);
      blade.position.set(0, 1.15, 0);
      g.add(blade);
    }
    const arrow = new THREE.Mesh(arrowGeo, arrowMat); // marks the piece's forward (+z) side
    arrow.rotation.x = Math.PI / 2;
    arrow.position.set(0, 0.5, 1.7);
    g.add(arrow);
    g.visible = false;
    scene.add(g);
    ghosts[type] = g;
  }
  if (ghost && ghost !== ghosts[type]) ghost.visible = false;
  ghost = ghosts[type];
  ghostScale = 0.85; // scale-in pop on switch
}
selectGhost('wall');

function buildKey(type, cx, level, cz, rot) {
  const r = (type === 'wall' || type === 'window' || type === 'door') ? rot % 2 : 0;
  return type + '|' + cx + '|' + level + '|' + cz + '|' + r;
}

/* solid AABBs a piece contributes; door blade is a separate toggleable blocker */
function blockersFor(type, cx, level, cz, rot) {
  const even = rot % 2 === 0;
  const seg = (x0, x1, z0, z1, maxY, blade) => even
    ? { minX: cx + x0, maxX: cx + x1, minZ: cz + z0, maxZ: cz + z1, minY: level, maxY: level + maxY, blade: !!blade }
    : { minX: cx + z0, maxX: cx + z1, minZ: cz + x0, maxZ: cz + x1, minY: level, maxY: level + maxY, blade: !!blade };
  if (type === 'wall' || type === 'window') return [seg(-2, 2, -0.35, 0.35, 3)];
  if (type === 'door') return [
    seg(-2, -0.85, -0.35, 0.35, 3),
    seg(0.85, 2, -0.35, 0.35, 3),
    seg(-0.9, 0.9, -0.45, 0.45, 2.3, true),
  ];
  return [];
}

/* central placement validation */
function canPlaceBuild(type, cx, level, cz, rot) {
  const cfg = BUILD_TYPES[type];
  const matKey = MAT_KEYS[buildMatIdx];
  if (resources[matKey] < cfg.cost) return { valid: false, reason: 'Need ' + cfg.cost + ' ' + matKey };
  if (Math.abs(cx) > BOUND - 2 || Math.abs(cz) > BOUND - 2) return { valid: false, reason: 'Out of bounds' };
  if (Math.hypot(cx - player.position.x, cz - player.position.z) > 9) return { valid: false, reason: 'Too far' };
  if (buildKeys.has(buildKey(type, cx, level, cz, rot))) return { valid: false, reason: 'Occupied' };
  const bls = blockersFor(type, cx, level, cz, rot);
  for (const bl of bls) {
    if (boxHit(bl, player.position.x, player.position.z, 0.5, player.position.y - EYE, 1.8)) return { valid: false, reason: '' };
    if (carSolid && bl.minX < carSolid.maxX + 0.3 && bl.maxX > carSolid.minX - 0.3 &&
        bl.minZ < carSolid.maxZ + 0.3 && bl.maxZ > carSolid.minZ - 0.3 && bl.minY < 2.2) return { valid: false, reason: '' };
    if (heliSolid && bl.minX < heliSolid.maxX + 0.3 && bl.maxX > heliSolid.minX - 0.3 &&
        bl.minZ < heliSolid.maxZ + 0.3 && bl.maxZ > heliSolid.minZ - 0.3 && bl.minY < 2.2) return { valid: false, reason: '' };
    for (const e of enemies) {
      if (!e.userData.dying && boxHit(bl, e.position.x, e.position.z, 0.5, 0, 2)) return { valid: false, reason: '' };
    }
  }
  return { valid: true, reason: '' };
}

function updateBuildMode(now) {
  if (mode !== MODE.BUILD) { if (ghost) ghost.visible = false; return; }
  camera.getWorldPosition(_v3);
  camera.getWorldDirection(_dir);
  raycaster.set(_v3, _dir);
  raycaster.far = 30;
  const hit = raycaster.intersectObjects(solids)[0];
  raycaster.far = Infinity;
  let px, py, pz;
  if (hit && hit.distance <= 8.5) {
    px = hit.point.x; py = hit.point.y; pz = hit.point.z;
    // hitting an existing piece: attach on the side its face normal points to
    if (hit.object.userData.rootBuild && hit.face) {
      _v2.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      px += _v2.x * 0.9;
      py += _v2.y * 0.35;
      pz += _v2.z * 0.9;
    }
  } else {
    _v1.copy(_dir).multiplyScalar(6.5).add(_v3);
    px = _v1.x; py = Math.max(0, _v1.y - EYE * 0.5); pz = _v1.z;
  }
  const cx = snap(px), cz = snap(pz);
  const level = snapLevel(py);
  ghostCell = { x: cx, y: level, z: cz };
  ghost.visible = true;
  ghost.position.set(cx, level, cz);
  ghost.rotation.y = getBuildYaw();
  ghostScale += (1 - ghostScale) * 0.25;
  ghost.scale.setScalar(ghostScale);

  const res = canPlaceBuild(buildType, cx, level, cz, buildRot);
  ghostValid = res.valid;
  ghostReason = res.reason;
  ghostMat.color.setHex(res.valid ? 0x51ff7a : 0xff5a4d);

  /* hold LMB → chain building */
  if (shooting && now !== undefined && now - lastPlaceT > 0.18) tryPlace(true);
}

function tryPlace(auto) {
  if (mode !== MODE.BUILD || !ghost || !ghost.visible) return;
  const cfg = BUILD_TYPES[buildType];
  const matKey = MAT_KEYS[buildMatIdx];
  if (!ghostValid) {
    if (!auto) {
      if (ghostReason) flashMsg(ghostReason, 1.1);
      sDeny();
    }
    return;
  }
  lastPlaceT = elapsed;
  resources[matKey] -= cfg.cost;
  const { x: cx, y: level, z: cz } = ghostCell;
  const matDef = MATERIALS[matKey];
  const piece = pieceGroup(partsFor(buildType, matKey));
  piece.position.set(cx, level, cz);
  piece.rotation.y = getBuildYaw();
  piece.scale.setScalar(0.35);
  piece.userData = {
    build: true, type: buildType, matKey,
    hp: cfg.hp * matDef.hp, maxHp: cfg.hp * matDef.hp,
    key: buildKey(buildType, cx, level, cz, buildRot),
    blockers: null, support: null, cracked: false, door: null,
  };
  const bls = blockersFor(buildType, cx, level, cz, buildRot);
  for (const bl of bls) { bl.piece = piece; buildBlockers.push(bl); }
  piece.userData.blockers = bls;
  if (buildType === 'door') {
    const blade = makeDoorBlade(matKey);
    piece.add(blade);
    piece.userData.door = {
      blade, open: false, animT: -1, target: 0,
      bladeBlocker: bls.find(b => b.blade),
    };
    doors.push(piece);
  }
  piece.traverse(o => { if (o.isMesh) o.userData.rootBuild = piece; });
  if (buildType === 'floor' || buildType === 'ramp') {
    const s = { kind: buildType, x: cx, z: cz, y: level, yaw: getBuildYaw(), piece };
    piece.userData.support = s;
    supports.push(s);
  }
  scene.add(piece);
  addToSolids(piece);
  builds.push(piece);
  buildKeys.set(piece.userData.key, piece);
  buildAnims.push({ piece, t: 0, dying: false });
  sPlace();
  matDef.sound();
  _v1.set(cx, level + 1.2, cz);
  spawnBurst(_v1, matDef.color, 5, 3);
  updateResHud();
  updateSlotsHud();
}

/* ---- doors ---- */
function doorwayOccupied(bl) {
  if (boxHit(bl, player.position.x, player.position.z, 0.45, player.position.y - EYE, 1.8)) return true;
  if (carSolid && bl.minX < carSolid.maxX && bl.maxX > carSolid.minX &&
      bl.minZ < carSolid.maxZ && bl.maxZ > carSolid.minZ) return true;
  for (const e of enemies) {
    if (!e.userData.dying && boxHit(bl, e.position.x, e.position.z, 0.4, 0, 2)) return true;
  }
  return false;
}
function toggleDoor(piece) {
  const d = piece.userData.door;
  if (!d || d.animT >= 0) return true; // mid-animation: consume the click, do nothing
  if (d.open) {
    if (doorwayOccupied(d.bladeBlocker)) { sDeny(); flashMsg('Doorway blocked', 0.9); return true; }
    d.open = false;
    d.target = 0;
    d.animT = 0;
    sDoorClose();
  } else {
    // swing away from whichever side the player stands on
    const yaw = piece.rotation.y;
    const side = (player.position.x - piece.position.x) * Math.sin(yaw) +
                 (player.position.z - piece.position.z) * Math.cos(yaw);
    d.target = (side >= 0 ? 1 : -1) * Math.PI / 2;
    d.open = true;
    d.animT = 0;
    const j = buildBlockers.indexOf(d.bladeBlocker); // passage opens immediately
    if (j !== -1) buildBlockers.splice(j, 1);
    sDoorOpen();
  }
  return true;
}
/* door piece at the center-screen interaction ray? */
function findDoorInSight() {
  camera.getWorldPosition(_v3);
  camera.getWorldDirection(_dir);
  raycaster.set(_v3, _dir);
  raycaster.far = 3.2;
  const hit = raycaster.intersectObjects(solids)[0];
  raycaster.far = Infinity;
  if (!hit) return null;
  const rb = hit.object.userData.rootBuild;
  return (rb && rb.userData.door) ? rb : null;
}

/* grow-in / shrink-out animations */
function updateBuildFx(dt) {
  for (const piece of doors) {
    const d = piece.userData.door;
    if (d.animT < 0) continue;
    d.animT += dt;
    const cur = d.blade.rotation.y;
    const next = cur + (d.target - cur) * Math.min(1, dt * 7);
    d.blade.rotation.y = next;
    if (Math.abs(next - d.target) < 0.03 || d.animT > 1.4) {
      d.blade.rotation.y = d.target;
      d.animT = -1;
      if (!d.open && buildBlockers.indexOf(d.bladeBlocker) === -1) buildBlockers.push(d.bladeBlocker);
    }
  }
  for (let i = buildAnims.length - 1; i >= 0; i--) {
    const a = buildAnims[i];
    a.t += dt;
    if (a.dying) {
      const s = Math.max(0.01, 1 - a.t / 0.15);
      a.piece.scale.setScalar(s);
      if (a.t >= 0.15) { scene.remove(a.piece); buildAnims.splice(i, 1); }
    } else {
      const s = Math.min(1, 0.35 + (a.t / 0.2) * 0.65);
      a.piece.scale.setScalar(s);
      if (s >= 1) buildAnims.splice(i, 1);
    }
  }
}

/* damage cracks (shared material + geometry, removed with the piece) */
const crackMat = new THREE.MeshBasicMaterial({ color: 0x14100c });
function addCracks(piece) {
  piece.userData.cracked = true;
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(unitBox, crackMat);
    c.scale.set(0.06, 0.5 + Math.random() * 0.8, 0.06);
    const t = piece.userData.type;
    c.position.set((Math.random() - 0.5) * 3, t === 'floor' ? 0.28 : 0.6 + Math.random() * 1.8, (Math.random() - 0.5) * (t === 'floor' ? 3 : 0.4));
    c.rotation.z = (Math.random() - 0.5) * 1.2;
    piece.add(c);
  }
}

function removeBuild(piece, silent) {
  removeFromSolids(piece);
  const i = builds.indexOf(piece);
  if (i !== -1) builds.splice(i, 1);
  buildKeys.delete(piece.userData.key);
  if (piece.userData.blockers) {
    for (const bl of piece.userData.blockers) {
      const j = buildBlockers.indexOf(bl);
      if (j !== -1) buildBlockers.splice(j, 1);
    }
  }
  if (piece.userData.door) {
    const j = doors.indexOf(piece);
    if (j !== -1) doors.splice(j, 1);
  }
  const s = piece.userData.support;
  if (s) { const j = supports.indexOf(s); if (j !== -1) supports.splice(j, 1); }
  if (silent) {
    scene.remove(piece);
  } else {
    buildAnims.push({ piece, t: 0, dying: true });
    _v1.copy(piece.position); _v1.y += 1.2;
    spawnBurst(_v1, MATERIALS[piece.userData.matKey].color, 8, 5);
    sBreak();
  }
}

function damageBuild(piece, dmg, point) {
  if (piece.userData.hp <= 0) return;
  piece.userData.hp -= dmg;
  if (point) spawnBurst(point, MATERIALS[piece.userData.matKey].color, 3, 3);
  if (piece.userData.hp <= 0) removeBuild(piece);
  else if (!piece.userData.cracked && piece.userData.hp < piece.userData.maxHp * 0.55) addCracks(piece);
}

function toggleBuildMode() {
  if (mode === MODE.VEHICLE || mode === MODE.HELI) return;
  if (mode === MODE.BUILD) {
    mode = MODE.WEAPON;
    ghost.visible = false;
    tryStartReload(true); // leaving build mode with an empty weapon starts reloading it
  } else {
    mode = MODE.BUILD;
    cancelReload();
    aiming = false;
    swingT = -1;
    selectGhost(buildType);
  }
  updateSlotsHud();
  updateAmmoHud();
}

function setBuildType(t) {
  buildType = t;
  selectedBuildIndex = BUILD_ORDER.indexOf(t);
  buildRot = 0;
  selectGhost(t);
  if (mode !== MODE.BUILD) toggleBuildMode(); else updateSlotsHud();
}

function resetBuilds() {
  for (const a of buildAnims) scene.remove(a.piece);
  buildAnims.length = 0;
  while (builds.length) removeBuild(builds[0], true);
  buildKeys.clear();
  doors.length = 0;
  buildType = 'wall';
  selectedBuildIndex = 0;
  buildMatIdx = 0;
  buildRot = 0;
  lastPlaceT = -Infinity;
  for (const k in ghosts) ghosts[k].visible = false;
  selectGhost('wall');
}
