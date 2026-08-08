/* ===== world: lighting, 320x320 map, areas, props, harvestables ===== */
const hemi = new THREE.HemisphereLight(0xcfe5ff, 0x4a5c38, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d8, 0.9);
sun.position.set(90, 140, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -170; sun.shadow.camera.right = 170;
sun.shadow.camera.top = 170; sun.shadow.camera.bottom = -170;
sun.shadow.camera.far = 400;
scene.add(sun);

const rng = mulberry32(1337);

/* ground + color patches (flat collision, colorful look) */
const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), getMat(0x5d8a43));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
solids.push(ground);

const patchGeo = new THREE.CircleGeometry(1, 14);
const patchColors = [0x6a9a4c, 0x557f3c, 0x74a355, 0x86a24e];
for (let i = 0; i < 26; i++) {
  const p = new THREE.Mesh(patchGeo, getMat(patchColors[i % patchColors.length]));
  p.rotation.x = -Math.PI / 2;
  const s = 8 + rng() * 18;
  p.scale.set(s, s, 1);
  p.position.set((rng() - 0.5) * 300, 0.02 + (i % 4) * 0.004, (rng() - 0.5) * 300);
  p.receiveShadow = true;
  scene.add(p);
}

/* perimeter rim + distant hills so edges do not look empty */
for (const [x, z, w, d] of [[0, -158, 320, 6], [0, 158, 320, 6], [-158, 0, 6, 320], [158, 0, 6, 320]]) {
  const m = new THREE.Mesh(unitBox, getMat(0x4c6b3a));
  m.scale.set(w, 5, d);
  m.position.set(x, 2.5, z);
  scene.add(m);
  addObstacle(x, z, w, d, 5);
  solids.push(m);
}
const hillGeo = new THREE.ConeGeometry(1, 1, 7);
for (let i = 0; i < 9; i++) {
  const a = (i / 9) * Math.PI * 2 + rng();
  const h = new THREE.Mesh(hillGeo, getMat(i % 3 ? 0x628c4a : 0x7ba263));
  const r = 215 + rng() * 55;
  h.scale.set(45 + rng() * 40, 22 + rng() * 26, 45 + rng() * 40);
  h.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
  scene.add(h);
}

/* exclusion rects for prop placement: [x, z, halfW, halfD] */
const noProp = [
  [0, 0, 14, 14],        // spawn
  [70, 55, 42, 34],      // town
  [-85, -70, 34, 28],    // farm
  [45, -75, 22, 16],     // garage
  [-110, 40, 17, 17],    // pond
  [120, -20, 13, 13],    // helipad
];
function inNoProp(x, z, pad) {
  for (const [ax, az, hw, hd] of noProp) {
    if (Math.abs(x - ax) < hw + pad && Math.abs(z - az) < hd + pad) return true;
  }
  return false;
}

/* ---- harvestables ---- */
const harvestables = [];
function registerHarvest(group, resource, x, z, blockW, blockH) {
  group.position.set(x, 0, z);
  group.userData.harvestable = true;
  group.userData.resource = resource;
  group.userData.hp = 100;
  group.userData.maxHp = 100;
  group.userData.yield = 30;
  group.userData.destroyed = false;
  for (const c of group.children) c.userData.rootHarvest = group;
  group.userData.block = blockW > 0 ? addObstacle(x, z, blockW, blockW, blockH, group) : null;
  scene.add(group);
  addToSolids(group);
  harvestables.push(group);
}

const trunkGeo = new THREE.CylinderGeometry(0.28, 0.4, 2.4, 7);
const leafGeo = new THREE.ConeGeometry(1.5, 2.2, 8);
const leafColors = [0x2e8b46, 0x3aa14f, 0x2f7d54];
function makeTree(x, z) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(trunkGeo, getMat(0x7a5230));
  trunk.position.y = 1.2;
  trunk.castShadow = true;
  g.add(trunk);
  const lc = leafColors[Math.floor(rng() * 3)];
  for (let i = 0; i < 3; i++) {
    const leaf = new THREE.Mesh(leafGeo, getMat(lc));
    const s = 1.15 - i * 0.28;
    leaf.scale.set(s, s, s);
    leaf.position.y = 2.4 + i * 1.15;
    leaf.castShadow = true;
    g.add(leaf);
  }
  const s = 0.8 + rng() * 0.55;
  g.scale.set(s, s, s);
  registerHarvest(g, 'wood', x, z, 1.0, 3);
}

const rockGeo = new THREE.DodecahedronGeometry(1, 0);
function makeRock(x, z) {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(rockGeo, getMat(rng() > 0.5 ? 0x8d9199 : 0x7b8087));
  const s = 0.8 + rng() * 0.9;
  rock.scale.set(s * (1 + rng() * 0.4), s * 0.75, s);
  rock.position.y = s * 0.5;
  rock.rotation.y = rng() * 3;
  rock.castShadow = true;
  g.add(rock);
  registerHarvest(g, 'stone', x, z, s * 1.6, s * 1.4);
}

function makeScrap(x, z) {
  const g = buildModel([
    [1.4, 0.5, 1.0, 0, 0.25, 0, 0x6f7f8e, 0.4],
    [0.9, 0.5, 1.3, 0.4, 0.6, -0.2, 0x8a6b4f, -0.3],
    [1.1, 0.4, 0.7, -0.35, 0.85, 0.25, 0x5c6b78, 0.9],
    [0.5, 0.9, 0.5, 0.5, 0.45, 0.5, 0x99733f, 0],
  ], true);
  registerHarvest(g, 'metal', x, z, 1.8, 1.2);
}

const bushGeo = new THREE.SphereGeometry(0.7, 7, 5);
function makeBush(x, z) {
  const b = new THREE.Mesh(bushGeo, getMat(rng() > 0.5 ? 0x3f9145 : 0x54a24e));
  const s = 0.7 + rng() * 0.8;
  b.scale.set(s * 1.3, s, s * 1.3);
  b.position.set(x, s * 0.5, z);
  scene.add(b);
}

/* scatter props with rejection sampling (deterministic) */
function scatter(count, pad, minDist, fn) {
  let placed = 0, guard = 0;
  const pts = [];
  while (placed < count && guard++ < count * 40) {
    const x = (rng() - 0.5) * 290, z = (rng() - 0.5) * 290;
    if (inNoProp(x, z, pad)) continue;
    if (pts.some(p => Math.hypot(p[0] - x, p[1] - z) < minDist)) continue;
    pts.push([x, z]);
    fn(x, z);
    placed++;
  }
}
scatter(52, 2, 7, makeTree);
scatter(24, 2, 10, makeRock);
scatter(7, 2, 22, makeScrap);
scatter(38, 1, 6, makeBush);

/* ---- town ---- */
const houseColors = [0xe8b64c, 0xd96d55, 0x6fa8d8, 0x9dc46a, 0xc78ac2, 0xe0e0d5];
const roofGeo = new THREE.ConeGeometry(1, 1, 4);
function makeHouse(x, z, w, d, h, color, ry) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(unitBox, getMat(color));
  body.scale.set(w, h, d);
  body.position.y = h / 2;
  body.castShadow = body.receiveShadow = true;
  const roof = new THREE.Mesh(roofGeo, getMat(0x8a4a3a));
  roof.scale.set(w * 0.78, h * 0.6, d * 0.78);
  roof.position.y = h + h * 0.3;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  const door = new THREE.Mesh(unitBox, getMat(0x5a3d28));
  door.scale.set(1.2, 2.2, 0.15);
  door.position.set(0, 1.1, d / 2 + 0.05);
  g.add(body, roof, door);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  scene.add(g);
  addObstacle(x, z, Math.max(w, d) + 0.3, Math.max(w, d) + 0.3, h);
  addToSolids(g);
}
makeHouse(52, 40, 8, 7, 5, houseColors[0], 0);
makeHouse(70, 38, 7, 8, 6, houseColors[1], 0.1);
makeHouse(88, 42, 9, 7, 5, houseColors[2], -0.05);
makeHouse(54, 70, 7, 7, 5.5, houseColors[3], 0.05);
makeHouse(72, 72, 8, 8, 5, houseColors[4], 0);
makeHouse(90, 68, 7, 7, 6, houseColors[5], -0.1);
const roadMat = getMat(0x55565c);
for (const [x, z, w, d] of [[70, 55, 52, 5], [70, 55, 5, 42]]) {
  const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
  r.rotation.x = -Math.PI / 2;
  r.position.set(x, 0.06, z);
  r.receiveShadow = true;
  scene.add(r);
}

/* ---- street lamps ---- */
const lampPoleGeo = new THREE.CylinderGeometry(0.09, 0.11, 4.2, 8);
const lampArmGeo = new THREE.BoxGeometry(0.9, 0.09, 0.09);
const lampBulbGeo = new THREE.SphereGeometry(0.22, 10, 8);
const lampPoleMat = getMat(0x2c2f33);
const lampBulbMat = new THREE.MeshStandardMaterial({ color: 0xfff2c2, emissive: 0xffe9a0, emissiveIntensity: 1.3 });
function makeLamp(x, z, ry) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(lampPoleGeo, lampPoleMat);
  pole.position.y = 2.1;
  pole.castShadow = true;
  const arm = new THREE.Mesh(lampArmGeo, lampPoleMat);
  arm.position.set(0.45, 4.15, 0);
  const bulb = new THREE.Mesh(lampBulbGeo, lampBulbMat);
  bulb.position.set(0.85, 4.1, 0);
  g.add(pole, arm, bulb);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  scene.add(g);
  addObstacle(x, z, 0.3, 0.3, 4.3);
  addToSolids(g);
}
for (const [x, z, ry] of [
  [58, 51, 0], [58, 59, Math.PI],
  [82, 51, 0], [82, 59, Math.PI],
  [70, 42, Math.PI / 2], [70, 68, -Math.PI / 2],
]) makeLamp(x, z, ry);

/* ---- farm ---- */
const barn = buildModel([
  [12, 6, 9, 0, 3, 0, 0xb5432f],
  [12.4, 0.5, 9.4, 0, 6.2, 0, 0x7c2f22],
  [1.6, 3, 0.2, 0, 1.5, 4.55, 0x6b4a2f],
], true);
barn.position.set(-90, 0, -78);
scene.add(barn);
addObstacle(-90, -78, 12.4, 9.4, 6.5);
addToSolids(barn);

/* windmill: static tower + slowly turning blades (driven by elapsed, freezes on pause) */
const windmillTower = buildModel([
  [2.2, 7, 2.2, 0, 3.5, 0, 0xc9b98a],
  [2.6, 0.4, 2.6, 0, 7.1, 0, 0x8a4a3a],
], true);
windmillTower.position.set(-68, 0, -92);
scene.add(windmillTower);
addObstacle(-68, -92, 2.6, 2.6, 7.3);
addToSolids(windmillTower);
const windmillBlades = new THREE.Group(); // rotation.z spun each frame in updateDayNight()
const bladeGeo = new THREE.BoxGeometry(0.3, 3.6, 0.12);
bladeGeo.translate(0, 1.8, 0); // pivot at the hub end, so rotating the parent sweeps it around
const bladeMat = getMat(0xe8e2d0);
for (let i = 0; i < 4; i++) {
  const pivot = new THREE.Group();
  pivot.rotation.z = (i / 4) * Math.PI * 2;
  const blade = new THREE.Mesh(bladeGeo, bladeMat);
  blade.castShadow = true;
  pivot.add(blade);
  windmillBlades.add(pivot);
}
windmillBlades.position.set(-68, 7.4, -90.85);
scene.add(windmillBlades);
const field = new THREE.Mesh(new THREE.PlaneGeometry(26, 16), getMat(0xc9a55a));
field.rotation.x = -Math.PI / 2;
field.position.set(-72, 0.05, -58);
field.receiveShadow = true;
scene.add(field);
for (let i = 0; i < 5; i++) {
  const row = new THREE.Mesh(unitBox, getMat(0x8db04e));
  row.scale.set(22, 0.5, 0.8);
  row.position.set(-72, 0.25, -64 + i * 3);
  scene.add(row);
}
const hayGeo = new THREE.CylinderGeometry(1, 1, 1.6, 10);
for (const [hx, hz] of [[-80, -85], [-77, -84], [-78.5, -87]]) {
  const hay = new THREE.Mesh(hayGeo, getMat(0xd9b968));
  hay.rotation.z = Math.PI / 2;
  hay.position.set(hx, 1, hz);
  hay.castShadow = true;
  scene.add(hay);
  addObstacle(hx, hz, 2, 2, 2);
  solids.push(hay);
}
for (let i = 0; i < 8; i++) { // fence line
  const post = new THREE.Mesh(unitBox, getMat(0x8a6a45));
  post.scale.set(0.25, 1.2, 0.25);
  post.position.set(-100 + i * 4, 0.6, -55);
  scene.add(post);
}
const rail = new THREE.Mesh(unitBox, getMat(0x8a6a45));
rail.scale.set(30, 0.18, 0.14);
rail.position.set(-86, 1.0, -55);
scene.add(rail);

/* ---- garage ---- */
const pad = new THREE.Mesh(new THREE.PlaneGeometry(18, 13), getMat(0x84868c));
pad.rotation.x = -Math.PI / 2;
pad.position.set(45, 0.06, -75);
pad.receiveShadow = true;
scene.add(pad);
const shed = buildModel([
  [10, 4.5, 0.35, 0, 2.25, -4, 0x74838f],
  [0.35, 4.5, 8, -5, 2.25, 0, 0x74838f],
  [0.35, 4.5, 8, 5, 2.25, 0, 0x74838f],
  [10.8, 0.4, 9, 0, 4.7, 0, 0x5a6570],
], true);
shed.position.set(45, 0, -79);
scene.add(shed);
addObstacle(45, -83.2, 10, 0.7, 4.5);
addObstacle(40, -79, 0.7, 8.4, 4.5);
addObstacle(50, -79, 0.7, 8.4, 4.5);
addToSolids(shed);
makeScrap(38, -70);
makeScrap(52.5, -70.5);
makeScrap(50, -84);
const CAR_SPAWN = new THREE.Vector3(45, 0, -72);

/* ---- dirt paths connecting spawn to the town, farm and garage ---- */
const pathMat = getMat(0x9c8259);
function makePathSeg(x, z, w, d) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), pathMat);
  p.rotation.x = -Math.PI / 2;
  p.position.set(x, 0.045, z);
  p.receiveShadow = true;
  scene.add(p);
}
makePathSeg(-7.5, 0, 158.5, 3.5);    // east-west spine through spawn, from the farm turn to the town turn
makePathSeg(45, -37.5, 3.5, 77);     // branch down to the garage
makePathSeg(-85, -35, 3.5, 72);      // branch down to the farm
makePathSeg(70, 17, 3.5, 37.5);      // branch up into the town road grid

/* ---- pond ---- */
const pondGeo = new THREE.CircleGeometry(11, 24);
const pondMat = new THREE.MeshStandardMaterial({ color: 0x2f7fa0, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.88 });
const pond = new THREE.Mesh(pondGeo, pondMat);
pond.rotation.x = -Math.PI / 2;
pond.position.set(-110, 0.03, 40);
pond.receiveShadow = true;
scene.add(pond);
const shoreGeo = new THREE.RingGeometry(10.6, 12.2, 24);
const shore = new THREE.Mesh(shoreGeo, getMat(0xc9b98a));
shore.rotation.x = -Math.PI / 2;
shore.position.set(-110, 0.025, 40);
scene.add(shore);
const reedGeo = new THREE.ConeGeometry(0.12, 1.4, 5);
const reedMat = getMat(0x4d7a3a);
for (let i = 0; i < 10; i++) {
  const a = (i / 10) * Math.PI * 2 + rng();
  const r = 10.5 + rng() * 1.4;
  const reed = new THREE.Mesh(reedGeo, reedMat);
  reed.position.set(-110 + Math.cos(a) * r, 0.7, 40 + Math.sin(a) * r);
  reed.castShadow = true;
  scene.add(reed);
}
const lilyGeo = new THREE.CircleGeometry(0.55, 8);
const lilyMat = getMat(0x3f9145);
for (const [lx, lz] of [[-114, 43], [-106, 37], [-111, 34]]) {
  const lily = new THREE.Mesh(lilyGeo, lilyMat);
  lily.rotation.x = -Math.PI / 2;
  lily.position.set(lx, 0.05, lz);
  scene.add(lily);
}
for (let i = 0; i < 5; i++) {
  const a = rng() * Math.PI * 2;
  const r = 12.6 + rng() * 2;
  const rock = new THREE.Mesh(rockGeo, getMat(rng() > 0.5 ? 0x8d9199 : 0x7b8087));
  const s = 0.6 + rng() * 0.5;
  rock.scale.set(s, s * 0.7, s);
  rock.position.set(-110 + Math.cos(a) * r, s * 0.4, 40 + Math.sin(a) * r);
  rock.castShadow = true;
  scene.add(rock);
}

/* ---- helipad ---- */
const HELI_SPAWN = new THREE.Vector3(120, 0, -20);
const helipad = new THREE.Mesh(new THREE.CircleGeometry(9, 28), getMat(0x6b6f76));
helipad.rotation.x = -Math.PI / 2;
helipad.position.set(120, 0.05, -20);
helipad.receiveShadow = true;
scene.add(helipad);
const helipadRing = new THREE.Mesh(new THREE.RingGeometry(7.6, 8.2, 28), getMat(0xdfe3e8));
helipadRing.rotation.x = -Math.PI / 2;
helipadRing.position.set(120, 0.052, -20);
scene.add(helipadRing);
const hMarkMat = getMat(0xdfe3e8);
const hBarGeo = new THREE.BoxGeometry(0.7, 0.01, 3.6);
for (const x of [-1.1, 1.1]) {
  const bar = new THREE.Mesh(hBarGeo, hMarkMat);
  bar.position.set(120 + x, 0.053, -20);
  scene.add(bar);
}
const hCrossGeo = new THREE.BoxGeometry(2.9, 0.01, 0.7);
const hCross = new THREE.Mesh(hCrossGeo, hMarkMat);
hCross.position.set(120, 0.053, -20);
scene.add(hCross);

function resetWorld() {
  for (const h of harvestables) {
    h.userData.hp = h.userData.maxHp;
    if (h.userData.weakMesh) h.userData.weakMesh.visible = false;
    if (h.userData.destroyed) {
      h.userData.destroyed = false;
      h.visible = true;
      if (h.userData.block) h.userData.block.active = true;
      addToSolids(h);
    }
  }
}

/* ---- day/night cycle (driven by gameplay time, freezes on pause) ---- */
const DAY_LEN = 160;
const skyStops = [
  [0.00, 0x87c4ec, 0x9fd7f2, 0.95, 0.95],
  [0.40, 0x87c4ec, 0x9fd7f2, 0.95, 0.95],
  [0.50, 0xf5a55f, 0xe9b57c, 0.55, 0.6],
  [0.58, 0x18223c, 0x202a44, 0.12, 0.34],
  [0.88, 0x18223c, 0x202a44, 0.12, 0.34],
  [0.97, 0xf5a55f, 0xe9b57c, 0.55, 0.6],
  [1.00, 0x87c4ec, 0x9fd7f2, 0.95, 0.95],
].map(([t, s, f, si, hi]) => ({ t, sky: new THREE.Color(s), fog: new THREE.Color(f), sun: si, hemi: hi }));
function updateDayNight() {
  const p = (elapsed % DAY_LEN) / DAY_LEN;
  let i = 1;
  while (skyStops[i].t < p) i++;
  const a = skyStops[i - 1], b = skyStops[i];
  const f = (p - a.t) / (b.t - a.t);
  scene.background.copy(a.sky).lerp(b.sky, f);
  scene.fog.color.copy(a.fog).lerp(b.fog, f);
  sun.intensity = a.sun + (b.sun - a.sun) * f;
  hemi.intensity = a.hemi + (b.hemi - a.hemi) * f;
  windmillBlades.rotation.z = elapsed * 0.9;
}
