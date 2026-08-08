/* ===== ui: HUD, overlays, banners, messages, boss bars, minimap ===== */
const hudWave = document.getElementById('h-wave');
const hudLeft = document.getElementById('h-left');
const hudScore = document.getElementById('h-score');
const healthFill = document.getElementById('healthfill');
const crosshairEl = document.getElementById('crosshair');
const vignetteEl = document.getElementById('vignette');
const scopeEl = document.getElementById('scope');
const waveBannerEl = document.getElementById('wave-banner');
const resEls = {
  wood: document.getElementById('res-wood'),
  stone: document.getElementById('res-stone'),
  metal: document.getElementById('res-metal'),
};
const slotEls = [0, 1, 2, 3, 4, 5, 6].map(i => document.getElementById('slot-' + i));
const slotBEl = document.getElementById('slot-b');
const ammoEl = document.getElementById('ammo');
const buildInfoEl = document.getElementById('buildinfo');
const msgEl = document.getElementById('msg');
const gainEl = document.getElementById('gain');
const hitmarkEl = document.getElementById('hitmark');
const threatArrowEl = document.getElementById('threatArrow');
const reloadWrap = document.getElementById('reloadwrap');
const reloadFill = document.getElementById('reloadfill');

let displayedAlive = -1;
function updateAliveHud(alive) {
  if (alive === displayedAlive) return;
  displayedAlive = alive;
  hudLeft.textContent = alive;
}
const shownRes = { wood: -1, stone: -1, metal: -1 };
function updateResHud() {
  for (const k in resEls) {
    if (resources[k] !== shownRes[k]) { shownRes[k] = resources[k]; resEls[k].textContent = resources[k]; }
  }
  updateAmmoHud();
}
let lastAmmoHtml = null;
function updateAmmoHud() {
  let html;
  if (mode === MODE.VEHICLE) html = '🚗';
  else if (mode === MODE.BUILD) html = resources[MAT_KEYS[buildMatIdx]] + ' <small>' + MAT_KEYS[buildMatIdx] + '</small>';
  else if (currentWeapon()) { const a = ammo[currentItem()]; html = a.mag + ' <small>/ ' + a.res + '</small>'; }
  else html = '⛏';
  if (html !== lastAmmoHtml) { lastAmmoHtml = html; ammoEl.innerHTML = html; }
}
function updateSlotsHud() {
  for (let i = 0; i < slotEls.length; i++) slotEls[i].classList.toggle('active', (mode === MODE.WEAPON || mode === MODE.HELI) && slot === i);
  slotBEl.classList.toggle('active', mode === MODE.BUILD);
  if (mode === MODE.BUILD) {
    buildInfoEl.style.display = 'block';
    buildInfoEl.textContent =
      buildType.toUpperCase() + ' · ' + (buildRot * 90) + '° · ' +
      MAT_KEYS[buildMatIdx].toUpperCase() + ' · ' + BUILD_TYPES[buildType].cost;
  } else {
    buildInfoEl.style.display = 'none';
  }
}
function reloadHud(frac) {
  if (frac < 0) { reloadWrap.style.display = 'none'; return; }
  reloadWrap.style.display = 'block';
  reloadFill.style.width = Math.min(100, frac * 100) + '%';
}
/* ---- miniboss health bars (max 3) ---- */
const bossBarsEl = document.getElementById('bossbars');
function createBossBar(u, td) {
  const root = document.createElement('div');
  root.className = 'bossbar';
  root.innerHTML = '<div class="bn"></div><div class="bw"><div class="bf"></div><div class="bs"></div></div>';
  root.querySelector('.bn').textContent = td.name.toUpperCase();
  const fill = root.querySelector('.bf');
  fill.style.background = '#' + td.color.toString(16).padStart(6, '0');
  bossBarsEl.appendChild(root);
  u.bar = { root, fill, shield: root.querySelector('.bs') };
}
function removeBossBar(u) {
  if (!u.bar) return;
  u.bar.root.remove();
  u.bar = null;
}
function updateBossBar(u) {
  if (!u.bar) return;
  u.bar.fill.style.width = Math.max(0, u.hp / u.maxHp) * 100 + '%';
  u.bar.shield.style.width = (u.shieldOn ? Math.max(0, u.shieldHp / SHIELD_HP) * 100 : 0) + '%';
}

let hmTO = 0;
function hitmark(kill) {
  hitmarkEl.classList.toggle('kill', !!kill);
  hitmarkEl.classList.remove('pop');
  void hitmarkEl.offsetWidth;
  hitmarkEl.classList.add('pop');
  hitmarkEl.style.opacity = 1;
  clearTimeout(hmTO);
  hmTO = setTimeout(() => { hitmarkEl.style.opacity = 0; }, 150);
}
let msgTtl = 0, hintText = '';
function flashMsg(text, ttl) {
  msgEl.textContent = text;
  msgTtl = ttl || 1;
}
function setHint(text) { hintText = text; }
function renderMsg(dt) {
  if (msgTtl > 0) { msgTtl -= dt; msgEl.style.opacity = 1; }
  else if (hintText) { msgEl.textContent = hintText; msgEl.style.opacity = 1; }
  else msgEl.style.opacity = 0;
  hintText = '';
}
function showGain(text, color) {
  gainEl.textContent = text;
  gainEl.style.color = color || '#ffd34d';
  gainEl.classList.remove('pop');
  void gainEl.offsetWidth; // restart animation
  gainEl.classList.add('pop');
}
function banner(text) {
  waveBannerEl.textContent = text;
  waveBannerEl.style.opacity = 1;
  waveBannerEl.classList.remove('pop');
  void waveBannerEl.offsetWidth;
  waveBannerEl.classList.add('pop');
  setTimeout(() => waveBannerEl.style.opacity = 0, 1800);
}

function updateHealth() {
  const pct = Math.max(0, health);
  healthFill.style.width = pct + '%';
  healthFill.style.background = pct > 50
    ? 'linear-gradient(90deg, #3fbf5f, #6fe08a)'
    : pct > 25
      ? 'linear-gradient(90deg, #d9a53f, #e8c56f)'
      : 'linear-gradient(90deg, #c33, #e66)';
}
function flashVignette() {
  vignetteEl.style.transition = 'none';
  vignetteEl.style.opacity = 1;
  requestAnimationFrame(() => {
    vignetteEl.style.transition = 'opacity 0.5s';
    vignetteEl.style.opacity = 0;
  });
}
function show(id) {
  for (const o of document.querySelectorAll('.overlay')) o.classList.remove('show');
  if (id) document.getElementById(id).classList.add('show');
  document.body.classList.toggle('overlay-active', !!id); // hides touch controls behind any overlay
}

/* full HUD/overlay reset, paired with each subsystem's own resetXxx() */
function resetHud() {
  displayedAlive = -1;
  bossBarsEl.innerHTML = ''; // removeEnemy clears per-boss bars; this catches any stragglers
  updateHealth();
  hudScore.textContent = 0;
  msgTtl = 0; hintText = '';
  msgEl.style.opacity = 0;
  hitmarkEl.style.opacity = 0;
  vignetteEl.style.opacity = 0;
  scopeEl.style.opacity = 0;
  threatArrowEl.style.opacity = 0;
  reloadHud(-1);
  updateResHud();
  updateSlotsHud();
  updateAmmoHud();
}

/* ---- proximity threat arrow: points at the nearest close enemy, visible or not ---- */
const THREAT_RANGE = 16;
function updateThreatArrow() {
  const originX = carState.occupied ? car.position.x : (heliState.occupied ? heli.position.x : player.position.x);
  const originZ = carState.occupied ? car.position.z : (heliState.occupied ? heli.position.z : player.position.z);
  let nearestD = THREAT_RANGE, nearestDx = 0, nearestDz = 0, found = false;
  for (const e of enemies) {
    if (e.userData.dying) continue;
    const dx = e.position.x - originX, dz = e.position.z - originZ;
    const d = Math.hypot(dx, dz);
    if (d < nearestD) { nearestD = d; nearestDx = dx; nearestDz = dz; found = true; }
  }
  if (!found) { threatArrowEl.style.opacity = 0; return; }
  const facingYaw = player.rotation.y + Math.PI; // player/camera-rig facing, in the (sinθ,cosθ) convention
  const relDeg = (facingYaw - Math.atan2(nearestDx, nearestDz)) * 180 / Math.PI;
  threatArrowEl.style.opacity = 1;
  threatArrowEl.style.transform = `translate(-50%, -50%) rotate(${relDeg}deg)`;
}

/* ---- minimap: static world pre-render + dynamic dots ----
   drawMinimapStatic() reads world.js data (obstacles/harvestables), so it is
   only DEFINED here and must be CALLED once from main.js after world.js has run. */
const mmCanvas = document.getElementById('minimap');
const mmCtx = mmCanvas.getContext('2d');
const mmStatic = document.createElement('canvas');
mmStatic.width = mmStatic.height = 160;
const MM_S = 0.5, MM_O = 80; // world → map: v*0.5 + 80
function drawMinimapStatic() {
  const c = mmStatic.getContext('2d');
  c.fillStyle = '#41602f';
  c.fillRect(0, 0, 160, 160);
  c.fillStyle = '#55565c'; // town roads
  c.fillRect((70 - 26) * MM_S + MM_O, (55 - 2.5) * MM_S + MM_O, 26, 2.5);
  c.fillRect((70 - 2.5) * MM_S + MM_O, (55 - 21) * MM_S + MM_O, 2.5, 21);
  c.fillStyle = '#8a8c58'; // farm field
  c.fillRect((-85) * MM_S + MM_O, (-66) * MM_S + MM_O, 13, 8);
  c.fillStyle = '#77797f'; // garage pad
  c.fillRect((36) * MM_S + MM_O, (-81) * MM_S + MM_O, 9, 6.5);
  c.fillStyle = '#8a6e4a'; // dirt paths connecting spawn to town/farm/garage
  c.fillRect((-7.5 - 79.25) * MM_S + MM_O, (0 - 1.75) * MM_S + MM_O, 158.5 * MM_S, 3.5 * MM_S);
  c.fillRect((45 - 1.75) * MM_S + MM_O, (-37.5 - 38.5) * MM_S + MM_O, 3.5 * MM_S, 77 * MM_S);
  c.fillRect((-85 - 1.75) * MM_S + MM_O, (-35 - 36) * MM_S + MM_O, 3.5 * MM_S, 72 * MM_S);
  c.fillRect((70 - 1.75) * MM_S + MM_O, (17 - 18.75) * MM_S + MM_O, 3.5 * MM_S, 37.5 * MM_S);
  c.fillStyle = '#2f7fa0'; // pond
  c.beginPath();
  c.arc((-110) * MM_S + MM_O, (40) * MM_S + MM_O, 11 * MM_S, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#7d818a'; // helipad
  c.beginPath();
  c.arc((120) * MM_S + MM_O, (-20) * MM_S + MM_O, 9 * MM_S, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#6d7078'; // buildings/rocks (non-harvest obstacles)
  for (const o of obstacles) {
    if (o.ref) continue;
    c.fillRect(o.minX * MM_S + MM_O, o.minZ * MM_S + MM_O,
      Math.max(1.5, (o.maxX - o.minX) * MM_S), Math.max(1.5, (o.maxZ - o.minZ) * MM_S));
  }
  for (const h of harvestables) {
    c.fillStyle = h.userData.resource === 'wood' ? '#2e7d3e' : h.userData.resource === 'stone' ? '#9a9a9a' : '#a8823f';
    c.fillRect(h.position.x * MM_S + MM_O - 1, h.position.z * MM_S + MM_O - 1, 2, 2);
  }
}
function drawMinimap() {
  mmCtx.drawImage(mmStatic, 0, 0);
  mmCtx.fillStyle = '#d8b25a';
  for (const b of builds) mmCtx.fillRect(b.position.x * MM_S + MM_O - 1.5, b.position.z * MM_S + MM_O - 1.5, 3, 3);
  mmCtx.fillStyle = '#ffe08a';
  for (const b of ammoBoxes) if (!b.open) mmCtx.fillRect(b.group.position.x * MM_S + MM_O - 1.5, b.group.position.z * MM_S + MM_O - 1.5, 3, 3);
  mmCtx.fillStyle = '#ff8438';
  mmCtx.fillRect(car.position.x * MM_S + MM_O - 2.5, car.position.z * MM_S + MM_O - 2.5, 5, 5);
  mmCtx.fillStyle = '#c9d6dc';
  mmCtx.fillRect(heli.position.x * MM_S + MM_O - 2.5, heli.position.z * MM_S + MM_O - 2.5, 5, 5);
  mmCtx.fillStyle = '#ff4b3e';
  for (const e of enemies) {
    if (e.userData.dying) continue;
    const s = e.userData.boss ? 6 : 3;
    mmCtx.fillRect(e.position.x * MM_S + MM_O - s / 2, e.position.z * MM_S + MM_O - s / 2, s, s);
  }
  // player arrow
  mmCtx.save();
  mmCtx.translate(player.position.x * MM_S + MM_O, player.position.z * MM_S + MM_O);
  mmCtx.rotate(Math.atan2(-Math.cos(player.rotation.y), -Math.sin(player.rotation.y)));
  mmCtx.fillStyle = '#ffffff';
  mmCtx.beginPath();
  mmCtx.moveTo(5, 0); mmCtx.lineTo(-3, 3); mmCtx.lineTo(-3, -3);
  mmCtx.closePath();
  mmCtx.fill();
  mmCtx.restore();
}
