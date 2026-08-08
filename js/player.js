/* ===== player: rig, movement, camera look, damage/death ===== */
const EYE = 1.7;
const player = new THREE.Object3D();     // yaw
const pitchObj = new THREE.Object3D();   // pitch
player.position.set(0, EYE, 0);
player.add(pitchObj);
pitchObj.add(camera);
scene.add(player);

/* weapon mount (models attach here) */
const hand = new THREE.Group();
camera.add(hand);

const GRAVITY = 24, JUMP = 8.5;

/* movement, sprinting, jumping/gravity, player-vs-world collision */
function updatePlayerMovement(dt) {
  // movement
  let dx = 0, dz = 0, strength = 1;
  if (keys.KeyW) dz -= 1;
  if (keys.KeyS) dz += 1;
  if (keys.KeyA) dx -= 1;
  if (keys.KeyD) dx += 1;
  let sprintHeld = !!(keys.ShiftLeft || keys.ShiftRight);
  // no digital WASD held: fall back to the analog touch joystick (mobile.js)
  if (dx === 0 && dz === 0 && (moveJoyX !== 0 || moveJoyY !== 0)) {
    dx = moveJoyX; dz = moveJoyY;
    strength = Math.min(1, Math.hypot(dx, dz));
    if (strength > 0.92) sprintHeld = true; // full joystick deflection auto-sprints
  }
  const len = Math.hypot(dx, dz);
  const feet = player.position.y - EYE;
  if (len > 0) {
    const speed = (sprintHeld ? 12.5 : 7.5) * (aiming ? 0.55 : 1) * strength;
    const yaw = player.rotation.y;
    const wx = (dx * Math.cos(yaw) + dz * Math.sin(yaw)) / len;
    const wz = (-dx * Math.sin(yaw) + dz * Math.cos(yaw)) / len;
    slideMove(player, wx * speed * dt, wz * speed * dt, 0.5, feet, 1.8);
  }

  // jump / gravity with floor+ramp support
  if (keys.Space && onGround) { velY = JUMP; onGround = false; }
  if (onGround) {
    const f = player.position.y - EYE;
    const sup = supportHeightAt(player.position.x, player.position.z, f + 0.85);
    if (sup >= f - 0.6) player.position.y = sup + EYE;
    else onGround = false; // walked off an edge
  }
  if (!onGround) {
    velY -= GRAVITY * dt;
    const prevFeet = player.position.y - EYE;
    player.position.y += velY * dt;
    const f = player.position.y - EYE;
    const sup = supportHeightAt(player.position.x, player.position.z);
    if (velY <= 0 && f <= sup && prevFeet >= sup - 0.05) {
      player.position.y = sup + EYE; velY = 0; onGround = true;
    } else if (f <= 0) {
      player.position.y = EYE; velY = 0; onGround = true;
    }
  }
}

/* mouse-look: yaw/pitch rig update + weapon sway response (same input event) */
function applyMouseLook(movementX, movementY) {
  const sens = 0.0022 * (camera.fov / 75); // scales down while zoomed

  player.rotation.y -= movementX * sens;
  pitchObj.rotation.x -= movementY * sens;
  pitchObj.rotation.x = Math.max(-1.45, Math.min(1.45, pitchObj.rotation.x));
  swayX = Math.max(-0.05, Math.min(0.05, swayX - movementX * 0.00028));
  swayY = Math.max(-0.04, Math.min(0.04, swayY + movementY * 0.00022));
}

/* ---- player damage / flow (guards preserved) ---- */
function damagePlayer(amount) {
  if (state !== 'playing' || health <= 0) return;
  health = Math.max(0, health - amount);
  sHurt();
  updateHealth();
  flashVignette();
  if (health === 0) gameOver();
}

function resetPlayer() {
  velY = 0; onGround = true;
  player.position.set(0, EYE, 0);
  player.rotation.y = 0;
  pitchObj.rotation.x = 0;
  camera.fov = 75;
  camera.updateProjectionMatrix();
}
