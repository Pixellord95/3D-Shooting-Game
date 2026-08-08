/* ===== heli: flyable helicopter ===== */
const heliState = {
  speed: 0, maxSpeed: 30, reverseSpeed: 10, acceleration: 14, braking: 18, friction: 6,
  vSpeed: 0, maxVSpeed: 13, vAccel: 3, yawRate: 1.6, occupied: false,
};
const HELI_MIN_ALT = 0.05, HELI_MAX_ALT = 70;
const HELI_WOBBLE_DUR = 0.4;
const MAIN_ROTOR_SPEED = 22, TAIL_ROTOR_SPEED = 34;

/* Procedural helicopter visual, built with forward = local +Z (matching the
   physics root directly, so — unlike the car — no orientation adapter needed). */
function createHeliVisual() {
  const visualRoot = new THREE.Group();

  const materials = {
    body: new THREE.MeshStandardMaterial({ color: 0xdce0e3, metalness: 0.4, roughness: 0.35 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x2a2e33, metalness: 0.5, roughness: 0.4 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x8fd4ec, metalness: 0.1, roughness: 0.15, transparent: true, opacity: 0.7 }),
    rotor: new THREE.MeshStandardMaterial({ color: 0x1b1d21, metalness: 0.3, roughness: 0.5 }),
    skid: new THREE.MeshStandardMaterial({ color: 0x33363b, metalness: 0.5, roughness: 0.4 }),
    navRed: new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0xff2200, emissiveIntensity: 1.2 }),
    navGreen: new THREE.MeshStandardMaterial({ color: 0x3bff6a, emissive: 0x1fbf4a, emissiveIntensity: 1.2 }),
  };

  /* cabin + tail ride on their own group so lean/pitch/idle-vibration never
     touch the physics root or heliSolid, same trick as the car's bodyTilt */
  const bodyTilt = new THREE.Group();
  visualRoot.add(bodyTilt);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.5, 2.6), materials.body);
  cabin.position.set(0, 1.35, 0.2);
  cabin.castShadow = cabin.receiveShadow = true;
  bodyTilt.add(cabin);

  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.3), materials.glass);
  glass.position.set(0, 1.35, 1.55);
  glass.castShadow = true;
  bodyTilt.add(glass);

  const belly = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 2.4), materials.trim);
  belly.position.set(0, 0.65, 0.2);
  bodyTilt.add(belly);

  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.34, 3.6, 10), materials.body);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 1.25, -2.9);
  boom.castShadow = true;
  bodyTilt.add(boom);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.7), materials.trim);
  fin.position.set(0, 1.85, -4.5);
  fin.castShadow = true;
  bodyTilt.add(fin);

  const stab = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 0.35), materials.trim);
  stab.position.set(0, 1.15, -4.35);
  bodyTilt.add(stab);

  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), materials.navRed);
  navL.position.set(-0.87, 1.35, 0.1);
  bodyTilt.add(navL);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), materials.navGreen);
  navR.position.set(0.87, 1.35, 0.1);
  bodyTilt.add(navR);

  const skidGeo = new THREE.CylinderGeometry(0.06, 0.06, 3.2, 8);
  for (const sx of [-0.75, 0.75]) {
    const skid = new THREE.Mesh(skidGeo, materials.skid);
    skid.rotation.z = Math.PI / 2;
    skid.position.set(sx, 0.15, 0.2);
    skid.castShadow = true;
    bodyTilt.add(skid);
    for (const sz of [-0.7, 0.7]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.55, 0.07), materials.skid);
      strut.position.set(sx, 0.5, sz);
      bodyTilt.add(strut);
    }
  }

  /* main rotor: mast + a spin group (rotation.y driven by elapsed each frame,
     like the windmill) holding two blade pivots offset 180 deg apart */
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.5, 8), materials.trim);
  mast.position.set(0, 2.35, 0.1);
  bodyTilt.add(mast);
  const mainRotor = new THREE.Group();
  mainRotor.position.set(0, 2.62, 0.1);
  bodyTilt.add(mainRotor);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.14, 10), materials.trim);
  mainRotor.add(hub);
  const mainBladeGeo = new THREE.BoxGeometry(0.16, 0.04, 3.4);
  mainBladeGeo.translate(0, 0, 1.7); // pivot at the hub end
  for (let i = 0; i < 2; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = i * Math.PI;
    const blade = new THREE.Mesh(mainBladeGeo, materials.rotor);
    blade.castShadow = true;
    pivot.add(blade);
    mainRotor.add(pivot);
  }

  /* tail rotor: spins around local X (sideways) at the tail fin */
  const tailRotor = new THREE.Group();
  tailRotor.position.set(-0.42, 1.85, -4.5);
  bodyTilt.add(tailRotor);
  const tailHub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 8), materials.trim);
  tailHub.rotation.z = Math.PI / 2;
  tailRotor.add(tailHub);
  const tailBladeGeo = new THREE.BoxGeometry(0.02, 0.6, 0.09);
  tailBladeGeo.translate(0, 0.3, 0);
  for (let i = 0; i < 2; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.x = i * Math.PI;
    const blade = new THREE.Mesh(tailBladeGeo, materials.rotor);
    pivot.add(blade);
    tailRotor.add(pivot);
  }

  return { root: visualRoot, bodyTilt, mainRotor, tailRotor, materials };
}

const heli = new THREE.Group();
const heliModel = createHeliVisual();
heli.add(heliModel.root);
const heliBodyTilt = heliModel.bodyTilt;
const heliMainRotor = heliModel.mainRotor;
const heliTailRotor = heliModel.tailRotor;

heli.position.copy(HELI_SPAWN);
scene.add(heli);
addToSolids(heli);
let heliHeading = 0;
let heliLean = 0, heliPitch = 0, heliWobbleT = 0, heliWobbleAmp = 0;
heliSolid = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, minY: 0, maxY: 2.9 };
function refreshHeliSolid() {
  heliSolid.minX = heli.position.x - 3.2; heliSolid.maxX = heli.position.x + 3.2;
  heliSolid.minZ = heli.position.z - 3.2; heliSolid.maxZ = heli.position.z + 3.2;
}
refreshHeliSolid();

function enterHeli() {
  if (mode === MODE.BUILD) toggleBuildMode();
  cancelReload();
  aiming = false;
  shooting = false;
  swingT = -1;
  mode = MODE.HELI;
  heliState.occupied = true;
  hand.visible = true; // this is a gunship: WASD flies, mouse aims, LMB fires like normal
  heliWobbleT = HELI_WOBBLE_DUR; heliWobbleAmp = 0.05;
  equip(SLOTS.indexOf('machinegun')); // the heli's mounted weapon
  sEquip();
  updateSlotsHud();
  updateAmmoHud();
}

function exitHeli() {
  if (heli.position.y > 2.2) { flashMsg('Land first!', 1); return; }
  const h = heliHeading;
  // side doors only: the cabin (half-width ~0.85) is short, but the tail boom runs
  // ~4.5 out the back and the nose glass ~2 out the front, so a uniform "1m from
  // center" offset used to drop the player inside the tail boom on two of the four
  // candidates. Exiting to either side clears the hull with just ~1m to spare.
  const SIDE = 1.6;
  const offsets = [
    [Math.cos(h) * SIDE, -Math.sin(h) * SIDE],
    [-Math.cos(h) * SIDE, Math.sin(h) * SIDE],
  ];
  let px = heli.position.x + offsets[0][0], pz = heli.position.z + offsets[0][1];
  for (const [ox, oz] of offsets) {
    const x = heli.position.x + ox, z = heli.position.z + oz;
    if (!blocked(x, z, 0.5, 0, 1.8, false, true)) { px = x; pz = z; break; } // skipHeli: don't let its own bulk block every candidate
  }
  player.position.set(px, EYE, pz);
  velY = 0;
  onGround = true;
  mode = MODE.WEAPON;
  heliState.occupied = false;
  heliWobbleT = HELI_WOBBLE_DUR; heliWobbleAmp = 0.04;
  updateSlotsHud();
  updateAmmoHud();
  tryStartReload(true);
}

function updateHeli(dt) {
  heliMainRotor.rotation.y = elapsed * MAIN_ROTOR_SPEED;
  heliTailRotor.rotation.x = elapsed * TAIL_ROTOR_SPEED;

  if (heliWobbleT > 0) heliWobbleT = Math.max(0, heliWobbleT - dt);
  const wobble = heliWobbleT > 0 ? Math.sin(heliWobbleT * 40) * heliWobbleAmp * (heliWobbleT / HELI_WOBBLE_DUR) : 0;

  if (!heliState.occupied) {
    if (Math.abs(heliState.speed) > 0.01) {
      heliState.speed -= Math.sign(heliState.speed) * Math.min(Math.abs(heliState.speed), heliState.friction * dt);
    }
    if (heli.position.y > HELI_MIN_ALT) heli.position.y = Math.max(HELI_MIN_ALT, heli.position.y - 4 * dt); // auto-settle if left mid-air
    if (mode !== MODE.HELI && mode !== MODE.VEHICLE &&
        Math.hypot(player.position.x - heli.position.x, player.position.z - heli.position.z) < 5) {
      setHint('E: Fly');
    }
    refreshHeliSolid();
    heliLean += (0 - heliLean) * Math.min(1, dt * 6);
    heliPitch += (0 - heliPitch) * Math.min(1, dt * 6);
    heliBodyTilt.rotation.z = heliLean;
    heliBodyTilt.rotation.x = heliPitch;
    heliBodyTilt.position.y = wobble;
    return;
  }

  const hs = heliState;
  const forwardDigital = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const forward = forwardDigital !== 0 ? forwardDigital : -moveJoyY; // analog joystick fallback
  if (forward > 0) hs.speed = Math.min(hs.maxSpeed, hs.speed + hs.acceleration * dt);
  else if (forward < 0) hs.speed = Math.max(-hs.reverseSpeed, hs.speed - hs.braking * dt);
  else hs.speed -= Math.sign(hs.speed) * Math.min(Math.abs(hs.speed), hs.friction * dt);

  const vertical = (keys.Space ? 1 : 0) - (keys.ShiftLeft || keys.ShiftRight ? 1 : 0);
  hs.vSpeed += (vertical * hs.maxVSpeed - hs.vSpeed) * Math.min(1, dt * hs.vAccel);

  const steerDigital = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0);
  const steer = steerDigital !== 0 ? steerDigital : -moveJoyX; // analog joystick fallback
  heliHeading += steer * hs.yawRate * dt;
  heli.rotation.y = heliHeading;

  const fx = Math.sin(heliHeading), fz = Math.cos(heliHeading);
  const nx = heli.position.x + fx * hs.speed * dt;
  const nz = heli.position.z + fz * hs.speed * dt;
  const ny = Math.max(HELI_MIN_ALT, Math.min(HELI_MAX_ALT, heli.position.y + hs.vSpeed * dt));

  const hitGround = ny <= HELI_MIN_ALT + 0.001 && hs.vSpeed < -3;
  if (Math.abs(nx) > BOUND - 3 || Math.abs(nz) > BOUND - 3 || blocked(nx, nz, 1.6, ny, 2.6, false, true)) {
    if (Math.abs(hs.speed) > 5) {
      sThud(); addShake(0.08, 0.16);
      heliWobbleT = HELI_WOBBLE_DUR; heliWobbleAmp = Math.min(0.06, Math.abs(hs.speed) * 0.004);
    }
    hs.speed *= -0.2;
  } else {
    heli.position.x = nx;
    heli.position.z = nz;
  }
  heli.position.y = ny;
  if (ny <= HELI_MIN_ALT) hs.vSpeed = Math.max(0, hs.vSpeed);
  if (hitGround) {
    sThud(); addShake(0.06, 0.14);
    heliWobbleT = HELI_WOBBLE_DUR; heliWobbleAmp = 0.05;
  }
  refreshHeliSolid();

  const targetLean = -steer * 0.16;
  heliLean += (targetLean - heliLean) * Math.min(1, dt * 6);
  const targetPitch = Math.max(-0.22, Math.min(0.22, -forward * 0.16));
  heliPitch += (targetPitch - heliPitch) * Math.min(1, dt * 6);
  heliBodyTilt.rotation.z = heliLean;
  heliBodyTilt.rotation.x = heliPitch;

  const idleVibe = Math.sin(elapsed * 55) * 0.006;
  heliBodyTilt.position.y = wobble + idleVibe;

  /* seat follows the airframe; look direction is fully free (mouse), same as on-foot aiming,
     so the gunner can look/aim anywhere independent of which way the heli is flying */
  _v1.set(heli.position.x - fx * 8.5, heli.position.y + 3.2, heli.position.z - fz * 8.5);
  player.position.lerp(_v1, Math.min(1, dt * 5));
  setHint('E: Exit (must be landed)  ·  Space/Shift: Up/Down  ·  Mouse: Aim  ·  LMB: Fire');
}

function resetHeli() {
  if (heliState.occupied) {
    heliState.occupied = false;
    hand.visible = true;
  }
  heliState.speed = 0;
  heliState.vSpeed = 0;
  heliHeading = 0;
  heli.rotation.y = 0;
  heli.position.copy(HELI_SPAWN);
  heliLean = 0;
  heliPitch = 0;
  heliWobbleT = 0;
  heliWobbleAmp = 0;
  heliBodyTilt.rotation.set(0, 0, 0);
  heliBodyTilt.position.set(0, 0, 0);
  refreshHeliSolid();
}
