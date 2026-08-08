/* ===== pickups: enemy ammo drops + searchable ammo boxes ===== */
const pickups = [];
const pickupGeoS = new THREE.BoxGeometry(0.45, 0.32, 0.32);
const pickupGeoB = new THREE.BoxGeometry(0.62, 0.44, 0.44);
const pickupMatS = new THREE.MeshLambertMaterial({ color: 0xe8c34d, emissive: 0x5a4400 });
const pickupMatB = new THREE.MeshLambertMaterial({ color: 0xe8853d, emissive: 0x5a2c00 });

function gunKeys() { return Object.keys(WEAPONS); }
function neediestWeapon() {
  let best = null, bestFrac = 1;
  for (const k of gunKeys()) {
    if (WEAPONS[k].rocket) continue; // rocket ammo only from rare sources
    const frac = ammo[k].res / WEAPONS[k].maxReserve;
    if (frac < bestFrac - 1e-9) { bestFrac = frac; best = k; }
  }
  return bestFrac >= 1 ? null : best;
}

function dropAmmo(e) {
  if (pickups.length >= 12) return;
  /* rare dedicated rocket drop */
  if (Math.random() < 0.07 && ammo.bazooka.res < WEAPONS.bazooka.maxReserve) {
    const mesh = new THREE.Mesh(pickupGeoS, pickupMatB);
    mesh.position.set(e.position.x, 0.45, e.position.z);
    scene.add(mesh);
    pickups.push({ mesh, big: false, rocket: true, life: 25, phase: Math.random() * 6 });
    return;
  }
  if (!neediestWeapon()) return;
  const big = e.userData.td === ENEMY_TYPES.brute ? Math.random() < 0.6 : false;
  if (!big && Math.random() > 0.25) return;
  const mesh = new THREE.Mesh(big ? pickupGeoB : pickupGeoS, big ? pickupMatB : pickupMatS);
  mesh.position.set(e.position.x, 0.45, e.position.z);
  scene.add(mesh);
  pickups.push({ mesh, big, life: 25, phase: Math.random() * 6 });
}

function removePickup(i) {
  scene.remove(pickups[i].mesh); // shared geo/material — nothing to dispose
  pickups.splice(i, 1);
}

function updatePickups(dt, now) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.life -= dt;
    if (p.life <= 0) { removePickup(i); continue; }
    p.mesh.rotation.y += dt * 2.2;
    p.mesh.position.y = 0.45 + Math.sin(now * 3 + p.phase) * 0.12;
    if (Math.hypot(p.mesh.position.x - player.position.x, p.mesh.position.z - player.position.z) < 1.8) {
      const w = p.rocket ? 'bazooka' : neediestWeapon();
      if (!w) continue;
      const amount = p.rocket ? 1 : Math.ceil(WEAPONS[w].maxReserve * (p.big ? 0.3 : 0.15));
      const got = grantAmmo(w, amount);
      if (got > 0) {
        showGain(p.rocket ? '+1 ROCKET' : '+' + got + ' ' + w.toUpperCase() + ' AMMO', '#ffe08a');
        sPickup();
        removePickup(i);
      }
    }
  }
}

/* ---- ammo boxes ---- */
const ammoBoxes = [];
function makeAmmoBox(x, z) {
  const g = buildModel([
    [1.1, 0.55, 0.7, 0, 0.28, 0, 0x3d5a3a],
    [0.16, 0.16, 0.72, 0, 0.6, 0, 0xd8b25a],
  ], true);
  const lid = new THREE.Mesh(unitBox, getMat(0x2f4a2e));
  lid.scale.set(1.16, 0.14, 0.76);
  lid.position.set(0, 0.62, 0);
  g.add(lid);
  g.position.set(x, 0, z);
  scene.add(g);
  addToSolids(g);
  ammoBoxes.push({ group: g, lid, open: false, openT: 0, reopenAt: 0 });
}
makeAmmoBox(7, 7);
makeAmmoBox(66, 52);
makeAmmoBox(-82, -66);
makeAmmoBox(49, -78);

function searchNearbyBox() {
  for (const b of ammoBoxes) {
    if (b.open) continue;
    if (Math.hypot(b.group.position.x - player.position.x, b.group.position.z - player.position.z) < 3.2) {
      b.open = true;
      b.reopenAt = elapsed + 50;
      let total = 0;
      for (const k of gunKeys()) {
        total += grantAmmo(k, WEAPONS[k].rocket ? 1 : Math.ceil(WEAPONS[k].maxReserve * 0.14));
      }
      showGain(total > 0 ? '+' + total + ' AMMO' : 'AMMO FULL', '#ffe08a');
      sBox();
      return true;
    }
  }
  return false;
}

function updateAmmoBoxes(dt, now) {
  for (const b of ammoBoxes) {
    if (b.open && now >= b.reopenAt) b.open = false;
    const target = b.open ? 1 : 0;
    b.openT += (target - b.openT) * Math.min(1, dt * 8);
    b.lid.rotation.x = -b.openT * 1.15;
    b.lid.position.z = -b.openT * 0.3;
    if (!b.open && mode !== MODE.VEHICLE && mode !== MODE.HELI &&
        Math.hypot(b.group.position.x - player.position.x, b.group.position.z - player.position.z) < 3.2) {
      setHint('E: Search Ammo Box');
    }
  }
}

function grantWaveAmmo() {
  for (const k of gunKeys()) {
    if (WEAPONS[k].rocket) continue; // rockets stay rare
    grantAmmo(k, Math.ceil(WEAPONS[k].maxReserve * 0.12));
  }
}

function resetPickups() {
  while (pickups.length) removePickup(0);
  for (const b of ammoBoxes) { b.open = false; b.openT = 0; b.lid.rotation.x = 0; b.lid.position.z = 0; }
}
