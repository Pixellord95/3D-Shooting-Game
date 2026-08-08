/* ===== car: arcade drivable vehicle ===== */
const carState = {
  speed: 0, maxSpeed: 24, reverseSpeed: 9, acceleration: 18,
  braking: 24, friction: 5, steering: 2.7, occupied: false,
};

const WHEEL_RADIUS = 0.36;
const CAR_WOBBLE_DUR = 0.4;
const REAR_LIGHT_BASE = 0.4, REAR_LIGHT_BRAKE = 2.6;

/* Detailed procedural car visual, adapted from a standalone Three.js reference model.
   Built once; attached as a child of the existing physics/collision root so world
   position, rotation, collision and reset stay owned by that root. */
function createCarVisual() {
  const visualRoot = new THREE.Group();

  const geometries = {
    base: new THREE.BoxGeometry(3.6, 0.55, 1.55),
    trim: new THREE.BoxGeometry(3.45, 0.18, 1.62),
    hood: new THREE.BoxGeometry(1.15, 0.18, 1.45),
    cabin: new THREE.BoxGeometry(1.65, 0.62, 1.35),
    roof: new THREE.BoxGeometry(1.35, 0.12, 1.2),
    bumper: new THREE.BoxGeometry(0.15, 0.22, 1.48),
    tire: new THREE.CylinderGeometry(0.36, 0.36, 0.3, 20),
    rim: new THREE.CylinderGeometry(0.21, 0.21, 0.315, 14),
    hub: new THREE.CylinderGeometry(0.075, 0.075, 0.33, 10),
    light: new THREE.SphereGeometry(0.11, 12, 12),
  };

  const materials = {
    body: new THREE.MeshPhysicalMaterial({ color: 0xe0512e, metalness: 0.55, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.1 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x23262b, metalness: 0.4, roughness: 0.4 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x8fd4ec, metalness: 0.1, roughness: 0.15, transparent: true, opacity: 0.75 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.9, metalness: 0.05 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xaeb4bb, metalness: 0.85, roughness: 0.25 }),
    headlight: new THREE.MeshStandardMaterial({ color: 0xfff2c2, emissive: 0xffe9a0, emissiveIntensity: 1.1 }),
    rearLight: new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2200, emissiveIntensity: REAR_LIGHT_BASE }),
  };

  /* body/cabin/lights ride on their own group so lean/pitch/idle-vibration never
     touch the wheels or the physics root */
  const bodyTilt = new THREE.Group();
  visualRoot.add(bodyTilt);

  const baseMesh = new THREE.Mesh(geometries.base, materials.body);
  baseMesh.position.y = 0.58;
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  bodyTilt.add(baseMesh);

  const trimMesh = new THREE.Mesh(geometries.trim, materials.trim);
  trimMesh.position.y = 0.34;
  trimMesh.castShadow = true;
  bodyTilt.add(trimMesh);

  const hoodMesh = new THREE.Mesh(geometries.hood, materials.body);
  hoodMesh.position.set(1.15, 0.94, 0);
  hoodMesh.rotation.z = -0.04;
  hoodMesh.castShadow = true;
  bodyTilt.add(hoodMesh);

  const cabinMesh = new THREE.Mesh(geometries.cabin, materials.glass);
  cabinMesh.position.set(-0.25, 1.08, 0);
  cabinMesh.scale.set(1, 1, 0.92);
  cabinMesh.castShadow = true;
  bodyTilt.add(cabinMesh);

  const roofMesh = new THREE.Mesh(geometries.roof, materials.body);
  roofMesh.position.set(-0.3, 1.43, 0);
  roofMesh.castShadow = true;
  bodyTilt.add(roofMesh);

  for (const x of [1.87, -1.87]) {
    const bumper = new THREE.Mesh(geometries.bumper, materials.trim);
    bumper.position.set(x, 0.43, 0);
    bumper.castShadow = true;
    bodyTilt.add(bumper);
  }

  for (const z of [0.5, -0.5]) {
    const bulb = new THREE.Mesh(geometries.light, materials.headlight);
    bulb.position.set(1.82, 0.68, z);
    bulb.scale.set(0.55, 1, 1.4);
    bodyTilt.add(bulb);
  }

  const rearLights = [];
  for (const z of [0.5, -0.5]) {
    const bulb = new THREE.Mesh(geometries.light, materials.rearLight);
    bulb.position.set(-1.82, 0.68, z);
    bulb.scale.set(0.55, 1, 1.4);
    bodyTilt.add(bulb);
    rearLights.push(bulb);
  }

  /* wheel assembly: tire+rim+hub share one spin group per wheel so rolling
     (rotation.z, the axle axis once the tire's static rotation.x=PI/2 is applied)
     never conflicts with the front wheels' independent steering pivot (rotation.y) */
  function createWheel() {
    const wheelGroup = new THREE.Group();
    const tire = new THREE.Mesh(geometries.tire, materials.tire);
    tire.rotation.x = Math.PI / 2;
    tire.castShadow = true;
    tire.receiveShadow = true;
    wheelGroup.add(tire);
    const rim = new THREE.Mesh(geometries.rim, materials.rim);
    rim.rotation.x = Math.PI / 2;
    rim.castShadow = true;
    wheelGroup.add(rim);
    const hub = new THREE.Mesh(geometries.hub, materials.trim);
    hub.rotation.x = Math.PI / 2;
    wheelGroup.add(hub);
    return wheelGroup;
  }

  const wheels = [];
  const frontWheelPivots = [];
  const wheelPositions = [
    [1.12, 0.38, 0.84, true],
    [1.12, 0.38, -0.84, true],
    [-1.12, 0.38, 0.84, false],
    [-1.12, 0.38, -0.84, false],
  ];
  for (const [x, y, z, front] of wheelPositions) {
    const spin = createWheel();
    if (front) {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      pivot.add(spin);
      visualRoot.add(pivot);
      frontWheelPivots.push(pivot);
    } else {
      spin.position.set(x, y, z);
      visualRoot.add(spin);
    }
    wheels.push(spin);
  }

  /* reference model's forward axis is local +X; the game's vehicle root drives
     along local +Z, so rotate the whole visual child -90 deg around Y once */
  visualRoot.rotation.y = -Math.PI / 2;
  visualRoot.position.y = 0.02;

  return { root: visualRoot, wheels, frontWheelPivots, rearLights, bodyTilt, geometries, materials };
}

const car = new THREE.Group();
const carModel = createCarVisual();
car.add(carModel.root);
const carWheels = carModel.wheels;
const carFrontWheelPivots = carModel.frontWheelPivots;
const carRearLights = carModel.rearLights;
const carBodyTilt = carModel.bodyTilt;

car.position.copy(CAR_SPAWN);
scene.add(car);
addToSolids(car);
let carHeading = 0, wheelSpin = 0, steerAngle = 0;
let carLean = 0, carPitch = 0, carWobbleT = 0, carWobbleAmp = 0;
let carLookYaw = 0, carLookPitch = 0;

/* free-look while driving: mouse offsets the chase camera away from dead-behind-the-car;
   updateCar() slowly relaxes the offset back toward 0 when the mouse is idle */
function applyCarMouseLook(movementX, movementY) {
  const sens = 0.0022;
  carLookYaw -= movementX * sens;
  carLookPitch -= movementY * sens;
  carLookYaw = Math.max(-2.6, Math.min(2.6, carLookYaw));
  carLookPitch = Math.max(-1.1, Math.min(0.9, carLookPitch));
}
carSolid = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, minY: 0, maxY: 1.7 };
function refreshCarSolid() {
  carSolid.minX = car.position.x - 1.95; carSolid.maxX = car.position.x + 1.95;
  carSolid.minZ = car.position.z - 1.95; carSolid.maxZ = car.position.z + 1.95;
}
refreshCarSolid();

function setRearLights(brakeOn, reverseOn) {
  const target = (brakeOn || reverseOn) ? REAR_LIGHT_BRAKE : REAR_LIGHT_BASE;
  const m = carModel.materials.rearLight;
  m.emissiveIntensity += (target - m.emissiveIntensity) * 0.4;
}

function enterCar() {
  if (mode === MODE.BUILD) toggleBuildMode();
  cancelReload();
  aiming = false;
  shooting = false;
  swingT = -1;
  mode = MODE.VEHICLE;
  carState.occupied = true;
  hand.visible = false;
  carLookYaw = 0; carLookPitch = 0;
  carWobbleT = CAR_WOBBLE_DUR; carWobbleAmp = 0.05;
  sEquip();
  updateSlotsHud();
  updateAmmoHud();
}

function exitCar() {
  const h = carHeading;
  const offsets = [
    [Math.cos(h) * 2.7, -Math.sin(h) * 2.7],
    [-Math.cos(h) * 2.7, Math.sin(h) * 2.7],
    [-Math.sin(h) * 3.6, -Math.cos(h) * 3.6],
    [Math.sin(h) * 3.6, Math.cos(h) * 3.6],
  ];
  let px = car.position.x + offsets[0][0], pz = car.position.z + offsets[0][1];
  for (const [ox, oz] of offsets) {
    const x = car.position.x + ox, z = car.position.z + oz;
    if (!blocked(x, z, 0.5)) { px = x; pz = z; break; }
  }
  player.position.set(px, EYE, pz);
  velY = 0;
  onGround = true;
  mode = MODE.WEAPON;
  carState.occupied = false;
  hand.visible = true;
  carWobbleT = CAR_WOBBLE_DUR; carWobbleAmp = 0.04;
  updateSlotsHud();
  updateAmmoHud();
  tryStartReload(true); // exiting the car with an empty weapon starts reloading it
}

function updateCar(dt) {
  if (carWobbleT > 0) carWobbleT = Math.max(0, carWobbleT - dt);
  const wobble = carWobbleT > 0 ? Math.sin(carWobbleT * 40) * carWobbleAmp * (carWobbleT / CAR_WOBBLE_DUR) : 0;

  if (!carState.occupied) {
    if (Math.abs(carState.speed) > 0.01) {
      carState.speed -= Math.sign(carState.speed) * Math.min(Math.abs(carState.speed), carState.friction * dt);
    }
    if (mode !== MODE.VEHICLE && mode !== MODE.HELI &&
        Math.hypot(player.position.x - car.position.x, player.position.z - car.position.z) < 4.2) {
      setHint('E: Drive');
    }
    refreshCarSolid();
    steerAngle += (0 - steerAngle) * Math.min(1, dt * 9);
    for (const p of carFrontWheelPivots) p.rotation.y = steerAngle;
    carLean += (0 - carLean) * Math.min(1, dt * 6);
    carPitch += (0 - carPitch) * Math.min(1, dt * 6);
    carBodyTilt.rotation.z = carLean;
    carBodyTilt.rotation.x = carPitch;
    carBodyTilt.position.y = wobble;
    setRearLights(false, false);
    return;
  }

  const cs = carState;
  const forwardDigital = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const forward = forwardDigital !== 0 ? forwardDigital : -moveJoyY; // analog joystick fallback
  if (forward > 0) cs.speed = Math.min(cs.maxSpeed, cs.speed + cs.acceleration * dt);
  else if (forward < 0) {
    if (cs.speed > 0.3) cs.speed -= cs.braking * dt;
    else cs.speed = Math.max(-cs.reverseSpeed, cs.speed - cs.acceleration * 0.7 * dt);
  } else {
    cs.speed -= Math.sign(cs.speed) * Math.min(Math.abs(cs.speed), cs.friction * dt);
  }
  const braking = forward < 0 && cs.speed > 0.3;
  if (keys.Space) cs.speed -= Math.sign(cs.speed) * Math.min(Math.abs(cs.speed), 32 * dt);
  const handbraking = !!keys.Space && Math.abs(cs.speed) > 0.05;

  const steerDigital = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0);
  const steer = steerDigital !== 0 ? steerDigital : -moveJoyX; // analog joystick fallback
  const grip = Math.min(1, 0.45 + Math.abs(cs.speed) / 9);
  carHeading += steer * cs.steering * grip * (cs.speed < 0 ? -1 : 1) * dt;
  car.rotation.y = carHeading;

  const fx = Math.sin(carHeading), fz = Math.cos(carHeading);
  const nx = car.position.x + fx * cs.speed * dt;
  const nz = car.position.z + fz * cs.speed * dt;
  if (Math.abs(nx) > BOUND - 3 || Math.abs(nz) > BOUND - 3 || blocked(nx, nz, 1.5, 0, 1.6, true)) {
    if (Math.abs(cs.speed) > 5) {
      sThud(); addShake(0.1, 0.18);
      carWobbleT = CAR_WOBBLE_DUR; carWobbleAmp = Math.min(0.06, Math.abs(cs.speed) * 0.004);
    }
    cs.speed = -cs.speed * 0.3;
  } else {
    car.position.x = nx;
    car.position.z = nz;
  }
  refreshCarSolid();

  wheelSpin += cs.speed * dt / WHEEL_RADIUS;
  for (const w of carWheels) w.rotation.z = wheelSpin;

  const targetSteer = steer * 0.42;
  steerAngle += (targetSteer - steerAngle) * Math.min(1, dt * 9);
  for (const p of carFrontWheelPivots) p.rotation.y = steerAngle;

  const targetLean = -steer * grip * 0.09;
  carLean += (targetLean - carLean) * Math.min(1, dt * 6);
  const targetPitch = Math.max(-0.07, Math.min(0.07, -forward * 0.05 - (cs.speed < 0 ? 0.02 : 0)));
  carPitch += (targetPitch - carPitch) * Math.min(1, dt * 6);
  carBodyTilt.rotation.z = carLean;
  carBodyTilt.rotation.x = carPitch;

  const idleVibe = Math.abs(cs.speed) < 0.3 ? Math.sin(elapsed * 45) * 0.004 : 0;
  carBodyTilt.position.y = wobble + idleVibe;

  setRearLights(braking, cs.speed < -0.1);

  /* ram enemies at speed */
  if (Math.abs(cs.speed) > 8) {
    for (const e of enemies) {
      if (e.userData.dying) continue;
      if (e.position.distanceTo(car.position) < 2.3) {
        e.userData.kbx = fx * cs.speed * 0.5;
        e.userData.kbz = fz * cs.speed * 0.5;
        damageEnemy(e, 65, false);
        sThud();
      }
    }
  }

  /* smooth chase camera via the player rig, with a mouse-driven look-around
     offset that slowly relaxes back toward dead-behind-the-car when idle */
  _v1.set(car.position.x - fx * 7.5, 3.4, car.position.z - fz * 7.5);
  player.position.lerp(_v1, Math.min(1, dt * 5));
  carLookYaw += (0 - carLookYaw) * Math.min(1, dt * 1.5);
  carLookPitch += (0 - carLookPitch) * Math.min(1, dt * 1.5);
  player.rotation.y = angleLerp(player.rotation.y, carHeading + Math.PI + carLookYaw, dt * 8);
  pitchObj.rotation.x += (-0.18 + carLookPitch - pitchObj.rotation.x) * Math.min(1, dt * 8);
  setHint('E: Exit  ·  Space: Handbrake');
}

function resetCar() {
  if (carState.occupied) {
    carState.occupied = false;
    hand.visible = true;
  }
  carState.speed = 0;
  carHeading = 0;
  car.rotation.y = 0;
  car.position.copy(CAR_SPAWN);
  wheelSpin = 0;
  steerAngle = 0;
  carLean = 0;
  carPitch = 0;
  carWobbleT = 0;
  carWobbleAmp = 0;
  carLookYaw = 0;
  carLookPitch = 0;
  for (const w of carWheels) w.rotation.z = 0;
  for (const p of carFrontWheelPivots) p.rotation.y = 0;
  carBodyTilt.rotation.set(0, 0, 0);
  carBodyTilt.position.set(0, 0, 0);
  setRearLights(false, false);
  carModel.materials.rearLight.emissiveIntensity = REAR_LIGHT_BASE;
  refreshCarSolid();
}
