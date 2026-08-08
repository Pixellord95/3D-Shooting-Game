/* ===== mobile: touch input layer (joystick, look-zone, action buttons, build panel) =====
   Loaded before main.js. TOUCH_DEVICE and the touch-device body class are set in core.js
   (needed there for the pixel-ratio cap too).

   Every handler here drives the exact same gameplay globals/functions the desktop path
   uses (keys, shooting, aiming, mode, and main.js's primaryActionDown/interact/equipSlot/
   reloadOrRotate/etc, plus build.js's setBuildType/tryPlace/rotateBuild) — nothing here
   simulates a KeyboardEvent or MouseEvent, and no gameplay logic is duplicated. */

/* analog left-stick axes; player.js/car.js/heli.js fall back to these whenever no
   digital WASD key is currently held, so touch movement stays fully analog. */
let moveJoyX = 0, moveJoyY = 0;

/* default (desktop-safe) input release; the touch setup below replaces this with a
   fuller version once the DOM controls exist. Always callable from main.js regardless
   of device, so gameOver()/reset()/pauseGame() never need to guard the call. */
let releaseAllTouchInput = function releaseAllTouchInput() {
  moveJoyX = 0; moveJoyY = 0;
};
let updateMobileHud = function updateMobileHud() {};

/* portrait nudge overlay — informational only, never blocks input or the render loop */
function checkOrientation() {
  if (!TOUCH_DEVICE) return;
  document.body.classList.toggle('portrait-warning', innerHeight > innerWidth);
}
addEventListener('resize', checkOrientation);
addEventListener('orientationchange', () => setTimeout(checkOrientation, 100));
checkOrientation();

if (TOUCH_DEVICE) (function setupTouchControls() {
  const joyBase = document.getElementById('joyBase');
  const joyKnob = document.getElementById('joyKnob');
  const lookZone = document.getElementById('lookZone');
  const btnFire = document.getElementById('btnFire');
  const btnAim = document.getElementById('btnAim');
  const btnJump = document.getElementById('btnJump');
  const btnReload = document.getElementById('btnReload');
  const btnInteract = document.getElementById('btnInteract');
  const btnBuild = document.getElementById('btnBuild');
  const btnPause = document.getElementById('btnPause');
  const btnUp = document.getElementById('btnUp');
  const btnDown = document.getElementById('btnDown');
  const btnMaterial = document.getElementById('btnMaterial');
  const btnPlace = document.getElementById('btnPlace');
  const btnExitBuild = document.getElementById('btnExitBuild');

  /* setPointerCapture can throw (e.g. the pointer already went away); never let that
     abort the rest of a pointerdown handler (origin capture, moveJoy update, ...) */
  function safeCapture(el, pointerId) {
    try { el.setPointerCapture(pointerId); } catch (err) { /* ignore */ }
  }

  /* ---- left joystick: on-foot move / car throttle+steer / heli forward+yaw ---- */
  const JOY_RADIUS = 50, JOY_DEADZONE = 0.15;
  let joyPointerId = null, joyOriginX = 0, joyOriginY = 0;

  function updateJoyFromEvent(e) {
    let dx = e.clientX - joyOriginX, dy = e.clientY - joyOriginY;
    const dist = Math.hypot(dx, dy);
    if (dist > JOY_RADIUS) { dx = dx / dist * JOY_RADIUS; dy = dy / dist * JOY_RADIUS; }
    joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / JOY_RADIUS, ny = dy / JOY_RADIUS;
    const mag = Math.hypot(nx, ny);
    if (mag < JOY_DEADZONE) { moveJoyX = 0; moveJoyY = 0; }
    else {
      // rescale so the deadzone edge maps to 0 and full radius maps to 1 (smooth ramp, no jump)
      const scale = (mag - JOY_DEADZONE) / (1 - JOY_DEADZONE) / mag;
      moveJoyX = nx * scale; moveJoyY = ny * scale;
    }
  }
  function joyReset() {
    joyPointerId = null;
    moveJoyX = 0; moveJoyY = 0;
    joyKnob.style.transform = 'translate(0px, 0px)';
    joyBase.classList.remove('active');
  }
  joyBase.addEventListener('pointerdown', e => {
    if (joyPointerId !== null || state !== 'playing') return;
    joyPointerId = e.pointerId;
    safeCapture(joyBase, joyPointerId);
    const rect = joyBase.getBoundingClientRect();
    joyOriginX = rect.left + rect.width / 2;
    joyOriginY = rect.top + rect.height / 2;
    joyBase.classList.add('active');
    updateJoyFromEvent(e);
    e.preventDefault();
  }, { passive: false });
  joyBase.addEventListener('pointermove', e => {
    if (e.pointerId !== joyPointerId) return;
    updateJoyFromEvent(e);
    e.preventDefault();
  }, { passive: false });
  const endJoy = e => { if (e.pointerId === joyPointerId) joyReset(); };
  joyBase.addEventListener('pointerup', endJoy);
  joyBase.addEventListener('pointercancel', endJoy);

  /* ---- shared look routing: identical sensitivity/mode-routing for the lookZone drag
     AND the fire-button drag below, so aiming while holding FIRE feels exactly like
     dragging lookZone — reuses applyMouseLook/applyCarMouseLook exactly like the desktop
     mousemove router in main.js does. ---- */
  const TOUCH_LOOK_SENS = 1.6; // single tunable constant for touch look feel
  function applyTouchLookDelta(dx, dy) {
    if (mode === MODE.VEHICLE) applyCarMouseLook(dx, dy);
    else applyMouseLook(dx, dy); // heli mode uses this too, same routing as desktop mousemove
  }

  /* ---- look zone: relative drag → camera/aim ---- */
  let lookPointerId = null, lookLastX = 0, lookLastY = 0;
  lookZone.addEventListener('pointerdown', e => {
    if (lookPointerId !== null || state !== 'playing') return;
    lookPointerId = e.pointerId;
    safeCapture(lookZone, lookPointerId);
    lookLastX = e.clientX; lookLastY = e.clientY; // record only — no rotation on first touch
    e.preventDefault();
  }, { passive: false });
  lookZone.addEventListener('pointermove', e => {
    if (e.pointerId !== lookPointerId || state !== 'playing') return;
    const dx = (e.clientX - lookLastX) * TOUCH_LOOK_SENS, dy = (e.clientY - lookLastY) * TOUCH_LOOK_SENS;
    lookLastX = e.clientX; lookLastY = e.clientY;
    applyTouchLookDelta(dx, dy);
    e.preventDefault();
  }, { passive: false });
  const endLook = e => { if (e.pointerId === lookPointerId) lookPointerId = null; };
  lookZone.addEventListener('pointerup', endLook);
  lookZone.addEventListener('pointercancel', endLook);

  /* ---- generic button helpers: tap (fires once on touch-down) / hold (down...up) ----
     Both capture their pointer and stop propagation so a press can never leak through to
     lookZone underneath (e.g. rotating the camera while tapping a weapon slot) or bubble
     to some other ancestor listener. */
  function bindTap(el, action) {
    if (!el) return;
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      if (state !== 'playing') return;
      safeCapture(el, e.pointerId);
      action();
    }, { passive: false });
  }
  function bindHold(el, onDown, onUp) {
    if (!el) return;
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      if (state !== 'playing') return;
      safeCapture(el, e.pointerId);
      el.classList.add('active');
      onDown();
    }, { passive: false });
    const release = e => { e.stopPropagation(); el.classList.remove('active'); onUp(); };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  }

  /* NOTE: primaryActionDown/Up, interact, pauseGame, cycleBuildMaterial are defined in
     main.js, which loads AFTER this file — wrap them in closures so the name is only
     resolved at call time (after main.js has run), never passed by reference here. */
  bindHold(btnPlace, () => primaryActionDown(), () => primaryActionUp()); // build mode: same hold-to-chain-build as desktop LMB

  /* ---- FIRE: specialized handler, not bindHold — holding FIRE must ALSO work as a small
     look-drag surface, like the fire button in a traditional mobile FPS: dragging the same
     finger that pressed FIRE rotates the camera/aim while the weapon keeps firing uninterrupted.
     Only the exact pointer that pressed FIRE can move or release it; an unrelated finger lifting
     elsewhere (joystick, lookZone, another button) must never stop the shot. */
  let firePointerId = null, lastFireX = 0, lastFireY = 0;
  btnFire.addEventListener('pointerdown', e => {
    if (firePointerId !== null || state !== 'playing') return;
    firePointerId = e.pointerId;
    safeCapture(btnFire, firePointerId);
    lastFireX = e.clientX; lastFireY = e.clientY;
    btnFire.classList.add('active');
    primaryActionDown(); // hold = automatic fire; semi-auto still gated by fireGun()'s own firedThisPress
    e.preventDefault();
    e.stopPropagation();
  }, { passive: false });
  btnFire.addEventListener('pointermove', e => {
    if (e.pointerId !== firePointerId || state !== 'playing') return;
    const dx = (e.clientX - lastFireX) * TOUCH_LOOK_SENS, dy = (e.clientY - lastFireY) * TOUCH_LOOK_SENS;
    lastFireX = e.clientX; lastFireY = e.clientY;
    applyTouchLookDelta(dx, dy); // same sensitivity/routing as lookZone; firing continues uninterrupted
    e.preventDefault();
    e.stopPropagation();
  }, { passive: false });
  const endFire = e => {
    if (e.pointerId !== firePointerId) return;
    firePointerId = null;
    btnFire.classList.remove('active');
    primaryActionUp();
  };
  btnFire.addEventListener('pointerup', endFire);
  btnFire.addEventListener('pointercancel', endFire);

  bindTap(btnAim, () => { if (canAim()) aiming = !aiming; }); // toggle: aim + fire independently on touch
  bindHold(btnJump, () => { keys.Space = true; }, () => { keys.Space = false; }); // jump on foot, handbrake in the car
  bindHold(btnUp, () => { keys.Space = true; }, () => { keys.Space = false; }); // heli ascend (same flag as jump)
  bindHold(btnDown, () => { keys.ShiftLeft = true; }, () => { keys.ShiftLeft = false; }); // heli descend (same flag as sprint)
  bindTap(btnReload, () => reloadOrRotate(false)); // reloads the weapon, or rotates the build ghost in build mode
  bindTap(btnInteract, () => interact());
  bindTap(btnBuild, toggleBuildMode);
  bindTap(btnPause, () => pauseGame());
  bindTap(btnMaterial, () => cycleBuildMaterial());
  bindTap(btnExitBuild, toggleBuildMode);
  for (const el of document.querySelectorAll('#buildPanel .bbtn[data-build]')) {
    bindTap(el, () => setBuildType(el.dataset.build));
  }

  /* ---- inventory slots: reuse the existing HUD elements, just add touch handlers ---- */
  for (let i = 0; i < slotEls.length; i++) bindTap(slotEls[i], () => equipSlot(i));
  bindTap(slotBEl, toggleBuildMode);

  /* ---- per-frame HUD sync (called from main.js's animate()): cheap classList/text
     writes, only touched when mode or aiming actually changed ---- */
  let lastSyncedMode = null, lastSyncedAiming = null;
  updateMobileHud = function updateMobileHud() {
    if (mode !== lastSyncedMode) {
      document.body.classList.remove('mode-weapon', 'mode-build', 'mode-vehicle', 'mode-heli');
      document.body.classList.add('mode-' + mode); // MODE values are exactly 'weapon'/'build'/'vehicle'/'heli'
      btnJump.textContent = mode === MODE.VEHICLE ? 'BRAKE' : 'JUMP';
      btnReload.textContent = mode === MODE.BUILD ? 'ROTATE' : 'RELOAD';
      lastSyncedMode = mode;
    }
    if (aiming !== lastSyncedAiming) {
      btnAim.classList.toggle('active', aiming);
      lastSyncedAiming = aiming;
    }
  };

  releaseAllTouchInput = function releaseAllTouchInput() {
    joyReset();
    lookPointerId = null;
    firePointerId = null;
    keys.Space = false;
    keys.ShiftLeft = false;
    aiming = false;
    btnAim.classList.remove('active');
    for (const el of document.querySelectorAll('.tbtn.active, .bbtn.active')) el.classList.remove('active');
  };
})();
