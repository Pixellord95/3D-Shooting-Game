/* ===== main: initialization, input routing, state transitions, main loop ===== */
function onWindowResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', onWindowResize);
addEventListener('orientationchange', () => setTimeout(onWindowResize, 100)); // some mobile browsers report stale inner*/screen dims immediately on rotate

/* ---- player damage / flow (guards preserved) ---- */
function gameOver() {
  if (state === 'over') return;
  state = 'over';
  shooting = false; aiming = false; keys = {};
  releaseAllTouchInput();
  document.exitPointerLock();
  document.getElementById('over-stats').textContent =
    `You reached wave ${wave} with a score of ${score}.`;
  show('ov-over');
}

function reset() {
  for (const e of enemies) removeEnemy(e);
  enemies = [];
  resetBuilds();
  resetWorld();
  resetCar();
  resetHeli();
  resetItems();
  resetPickups();
  resetProjectiles();
  clearParticles();
  shakeT = 0; shakeAmp = 0; hitStop = 0;
  camera.position.set(0, 0, 0);
  keys = {};
  shooting = false; aiming = false; recoil = 0;
  releaseAllTouchInput();
  health = 100; score = 0; wave = 0; nextWaveAt = 0;
  elapsed = 0;
  resetPlayer();
  resetHud();
  updateDayNight();
  drawMinimap();
  startWave();
}

/* ---- shared input actions: desktop (keyboard/mouse) and touch (mobile.js)
   both route through these, so gameplay behavior only lives in one place ---- */
function canAim() { return (mode === MODE.WEAPON || mode === MODE.HELI) && !!currentWeapon(); }

function primaryActionDown() {
  if (state !== 'playing') return;
  /* click priority: door interaction → build placement → swing/fire */
  if (mode === MODE.WEAPON) {
    const doorPiece = findDoorInSight();
    if (doorPiece) { toggleDoor(doorPiece); return; }
  }
  shooting = true;
  firedThisPress = false;
  dryPlayed = false;
  if (mode === MODE.BUILD) tryPlace();
}
function primaryActionUp() {
  shooting = false;
  firedThisPress = false;
  dryPlayed = false;
}
function secondaryActionDown() {
  if (state !== 'playing') return;
  if (mode === MODE.BUILD) { rotateBuild(1); return; }
  if (canAim()) aiming = true;
}
function secondaryActionUp() {
  aiming = false;
}
function reloadOrRotate(reverse) {
  if (state !== 'playing') return;
  if (mode === MODE.BUILD) rotateBuild(reverse ? -1 : 1);
  else if (mode === MODE.WEAPON || mode === MODE.HELI) startReload();
}
function equipSlot(i) {
  if (state !== 'playing') return;
  if (mode === MODE.WEAPON || mode === MODE.BUILD || mode === MODE.HELI) equip(i);
}
function cycleBuildMaterial() {
  buildMatIdx = (buildMatIdx + 1) % 3;
  updateSlotsHud();
  updateAmmoHud();
}
function interact() {
  if (state !== 'playing') return;
  if (mode === MODE.VEHICLE) { exitCar(); return; }
  if (mode === MODE.HELI) { exitHeli(); return; }
  if (mode === MODE.WEAPON) {
    const doorPiece = findDoorInSight();
    if (doorPiece) { toggleDoor(doorPiece); return; }
  }
  const carDist = Math.hypot(player.position.x - car.position.x, player.position.z - car.position.z);
  const heliDist = Math.hypot(player.position.x - heli.position.x, player.position.z - heli.position.z);
  if (!carState.occupied && carDist < 4.2) enterCar();
  else if (!heliState.occupied && heliDist < 5) enterHeli();
  else searchNearbyBox();
}
function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  shooting = false; aiming = false; keys = {};
  releaseAllTouchInput();
  if (document.pointerLockElement) document.exitPointerLock();
  show('ov-pause');
}

/* ---- input router (desktop) ---- */
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (state !== 'playing' || e.repeat) return;
  switch (e.code) {
    case 'Digit1': equipSlot(0); break;
    case 'Digit2': equipSlot(1); break;
    case 'Digit3': equipSlot(2); break;
    case 'Digit4': equipSlot(3); break;
    case 'Digit5': equipSlot(4); break;
    case 'Digit6': equipSlot(5); break;
    case 'Digit7': equipSlot(6); break;
    case 'KeyQ': toggleBuildMode(); break;
    case 'KeyZ': if (mode === MODE.WEAPON || mode === MODE.BUILD) setBuildType('wall'); break;
    case 'KeyX': if (mode === MODE.WEAPON || mode === MODE.BUILD) setBuildType('window'); break;
    case 'KeyC': if (mode === MODE.WEAPON || mode === MODE.BUILD) setBuildType('ramp'); break;
    case 'KeyV': if (mode === MODE.WEAPON || mode === MODE.BUILD) setBuildType('floor'); break;
    case 'KeyM': cycleBuildMaterial(); break;
    case 'KeyR': reloadOrRotate(e.shiftKey); break;
    case 'KeyE': interact(); break;
  }
});
document.addEventListener('keyup', e => keys[e.code] = false);
document.addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('mousedown', e => {
  if (e.button === 0) primaryActionDown();
  if (e.button === 2) secondaryActionDown();
});
document.addEventListener('mouseup', e => {
  if (e.button === 0) primaryActionUp();
  if (e.button === 2) secondaryActionUp();
});
let lastBuildWheelTime = 0;
document.addEventListener('wheel', e => {
  if (state !== 'playing' || mode === MODE.VEHICLE) return;
  if (mode === MODE.BUILD) {
    e.preventDefault();
    const nowMs = performance.now();
    if (nowMs - lastBuildWheelTime < 80) return;
    lastBuildWheelTime = nowMs;
    const dir = Math.sign(e.deltaY) || 1;
    selectedBuildIndex = (selectedBuildIndex + dir + BUILD_ORDER.length) % BUILD_ORDER.length;
    setBuildType(BUILD_ORDER[selectedBuildIndex]);
    sSelect();
    return;
  }
  const n = SLOTS.length;
  equip(e.deltaY > 0 ? (slot + 1) % n : (slot + n - 1) % n);
}, { passive: false });

document.addEventListener('mousemove', e => {
  if (state !== 'playing' || document.pointerLockElement !== renderer.domElement) return;
  if (mode === MODE.VEHICLE) { applyCarMouseLook(e.movementX, e.movementY); return; }
  applyMouseLook(e.movementX, e.movementY); // heli mode uses this too: mouse aims, like on foot
});

for (const ov of document.querySelectorAll('.overlay')) {
  ov.addEventListener('click', () => {
    ensureAudio();
    if (state === 'start' || state === 'over') reset();
    if (TOUCH_DEVICE) {
      // touch: no pointer lock, start/resume immediately from this same user gesture
      state = 'playing';
      show(null);
      clock.getDelta();
    } else {
      renderer.domElement.requestPointerLock();
    }
  });
}

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === renderer.domElement) {
    state = 'playing';
    show(null);
    clock.getDelta(); // discard time spent in menus
  } else if (state === 'playing') {
    state = 'paused';
    shooting = aiming = false;
    keys = {};
    releaseAllTouchInput();
    show('ov-pause');
  }
});

/* losing focus or tab visibility should always pause and drop all input, touch or desktop */
addEventListener('blur', () => { if (state === 'playing') pauseGame(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') pauseGame();
});

/* ---- main loop ---- */
function animate() {
  requestAnimationFrame(animate);
  let dt = Math.min(clock.getDelta(), 0.1);

  if (state === 'playing') {
    if (hitStop > 0) { hitStop -= dt; dt *= 0.25; } // brief pickaxe hit-stop
    elapsed += dt;
    const now = elapsed;

    if (mode !== MODE.VEHICLE && mode !== MODE.HELI) {
      updatePlayerMovement(dt);
      updateBuildMode(now);
    }
    if (mode !== MODE.VEHICLE) updateItems(dt, now); // the heli is a gunship: WASD flies, weapons still fire
    updateCar(dt);
    updateHeli(dt);
    updateEnemies(dt, now);
    updateRockets(dt);
    updateBuildFx(dt);
    updatePickups(dt, now);
    updateAmmoBoxes(dt, now);
    updateParticles(dt);
    updateDayNight();
    renderMsg(dt);
    drawMinimap();
    updateThreatArrow();
    if (TOUCH_DEVICE) updateMobileHud();
    // camera shake
    if (shakeT > 0) {
      shakeT -= dt;
      const a = shakeAmp * Math.min(1, shakeT * 8);
      camera.position.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, 0);
      if (shakeT <= 0) { shakeAmp = 0; camera.position.set(0, 0, 0); }
    }
  }

  // FOV zoom while aiming (per-weapon ADS)
  const wpn = currentWeapon();
  const targetFov = (aiming && wpn) ? wpn.adsFov : 75;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
    camera.updateProjectionMatrix();
  }
  const scoping = aiming && (mode === MODE.WEAPON || mode === MODE.HELI) && currentItem() === 'sniper';
  const scopeOpacity = scoping ? '1' : '0';
  if (scopeEl.style.opacity !== scopeOpacity) scopeEl.style.opacity = scopeOpacity;
  const crossOpacity = scoping ? '0' : (aiming || mode === MODE.VEHICLE) ? '0.3' : '1';
  if (crosshairEl.style.opacity !== crossOpacity) crosshairEl.style.opacity = crossOpacity;
  // looking through the scope lens should hide the gun body, not stare down its own stock
  if (mode === MODE.WEAPON || mode === MODE.HELI) hand.visible = !scoping;

  renderer.render(scene, camera);
}

drawMinimapStatic(); // one-time: pre-render the static minimap background (needs world.js data)
updateResHud();
updateSlotsHud();
updateAmmoHud();
animate();
