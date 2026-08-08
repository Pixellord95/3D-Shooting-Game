/* ===== account + cloud persistence ===== */
let accountUser = null;
let accountProfile = null;
let pendingCloudState = null;
let cloudGameActive = false;
let cloudRevision = 0;
let cloudSaveBusy = false;
let cloudSavePromise = null;
let cloudSaveAgain = false;
let cloudDirty = false;
let lastCloudSaveAt = 0;
let cloudAutosaveTimer = 0;
let accountValidatedAt = 0;
let accountValidationPromise = null;
const pendingGameEvents = [];

const authOverlayEl = document.getElementById('authOverlay');
const authLoginForm = document.getElementById('authLoginForm');
const authRegisterForm = document.getElementById('authRegisterForm');
const authMessageEl = document.getElementById('authMessage');
const authSubmitEls = Array.from(document.querySelectorAll('.auth-submit'));
const authTabEls = Array.from(document.querySelectorAll('.auth-tab'));
const accountBarEl = document.getElementById('accountBar');
const accountNameEl = document.getElementById('accountName');
const cloudStatusEl = document.getElementById('cloudStatus');
const startActionEl = document.getElementById('startAction');
const newGameBtn = document.getElementById('newGameBtn');

function setAuthMessage(text, kind) {
  authMessageEl.textContent = text || '';
  authMessageEl.className = kind ? 'auth-message ' + kind : 'auth-message';
}

function setAuthBusy(busy) {
  for (const el of authSubmitEls) el.disabled = busy;
  authOverlayEl.classList.toggle('busy', busy);
}

function signupErrorMessage(error) {
  const code = String(error && error.code || '').toLowerCase();
  const message = String(error && error.message || '').toLowerCase();
  const status = Number(error && error.status || 0);
  if (code === 'over_email_send_rate_limit' || status === 429 || message.includes('rate limit')) {
    return 'För många bekräftelsemejl har skickats från spelet. Vänta ungefär en timme och försök igen, eller konfigurera Custom SMTP i Supabase.';
  }
  if (code === 'email_address_invalid' || message.includes('invalid email')) {
    return 'E-postadressen godkänns inte. Kontrollera adressen och försök igen.';
  }
  if (code === 'email_address_not_authorized') {
    return 'Supabases testmejl får inte skickas till den adressen. Konfigurera Custom SMTP i Supabase innan spelet öppnas för fler användare.';
  }
  if (code === 'weak_password') {
    return 'Lösenordet är för svagt. Välj minst 8 tecken och blanda gärna bokstäver, siffror och symboler.';
  }
  if (code === 'signup_disabled') {
    return 'Nya registreringar är tillfälligt avstängda.';
  }
  if (code === 'user_already_exists' || code === 'email_exists' || message.includes('already registered')) {
    return 'Det finns redan ett konto med den e-postadressen. Prova att logga in.';
  }
  if (message.includes('database error saving new user')) {
    return 'Kontot kunde inte sparas. Prova ett annat användarnamn eller försök igen om en stund.';
  }
  return 'Kontot kunde inte skapas just nu. Försök igen om en stund.';
}

function selectAuthTab(tab) {
  const registering = tab === 'register';
  authLoginForm.hidden = registering;
  authRegisterForm.hidden = !registering;
  for (const el of authTabEls) el.classList.toggle('active', el.dataset.authTab === tab);
  setAuthMessage('');
}

function showAuthOverlay(message) {
  state = 'auth';
  show(null);
  authOverlayEl.hidden = false;
  accountBarEl.hidden = true;
  document.body.classList.add('auth-locked', 'overlay-active');
  if (message) setAuthMessage(message, 'error');
}

function hideAuthOverlay() {
  authOverlayEl.hidden = true;
  accountBarEl.hidden = false;
  document.body.classList.remove('auth-locked');
}

function isGameAuthenticated() { return !!accountUser && accountValidatedAt > 0; }

async function invalidateAccount(message) {
  try { await supabaseClient.auth.signOut({ scope: 'local' }); } catch (err) { /* local cleanup continues below */ }
  deactivateAccount(message || 'Din inloggning är inte längre giltig. Logga in igen.');
}

function verifyAccountSession(message) {
  if (!accountUser) return Promise.resolve(false);
  if (accountValidationPromise) return accountValidationPromise;
  const expectedUserId = accountUser.id;
  accountValidationPromise = (async () => {
    try {
      const { data, error } = await supabaseClient.auth.getUser();
      const valid = !error && data.user && data.user.id === expectedUserId && accountUser && accountUser.id === expectedUserId;
      if (valid) {
        accountUser = data.user;
        accountValidatedAt = Date.now();
        return true;
      }
    } catch (err) {
      console.error('Session verification failed:', err);
    }
    if (accountUser && accountUser.id === expectedUserId) {
      await invalidateAccount(message || 'Din inloggning kunde inte verifieras. Logga in igen.');
    }
    return false;
  })();
  return accountValidationPromise.finally(() => { accountValidationPromise = null; });
}

function safeNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function localSaveKey() {
  return accountUser ? 'cube-assault-cloud-backup:' + accountUser.id : null;
}

function setCloudStatus(text, kind) {
  cloudStatusEl.textContent = text;
  cloudStatusEl.dataset.state = kind || '';
}

function serializeBuild(piece) {
  const d = piece.userData.door;
  return {
    type: piece.userData.type,
    material: piece.userData.matKey,
    x: piece.position.x,
    y: piece.position.y,
    z: piece.position.z,
    rotation: ((Math.round(piece.rotation.y / (Math.PI / 2)) % 4) + 4) % 4,
    hp: Math.max(1, Math.round(piece.userData.hp)),
    doorAngle: d ? d.blade.rotation.y : 0,
  };
}

function serializeGameState() {
  const betweenWaves = enemies.length === 0 && spawnQueue.length === 0 && nextWaveAt !== 0;
  const checkpointWave = betweenWaves ? wave : Math.max(0, wave - 1);
  const ammoState = {};
  for (const id of Object.keys(WEAPONS)) {
    ammoState[id] = { mag: ammo[id].mag, reserve: ammo[id].res };
  }
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    checkpointWave,
    score: Math.max(0, Math.round(score || 0)),
    health: safeNumber(health, 100, 1, 100),
    elapsed: safeNumber(elapsed, 0, 0, 10000000),
    resources: {
      wood: Math.max(0, Math.round(resources.wood)),
      stone: Math.max(0, Math.round(resources.stone)),
      metal: Math.max(0, Math.round(resources.metal)),
    },
    equippedSlot: slot,
    ammo: ammoState,
    player: {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      yaw: player.rotation.y,
      pitch: pitchObj.rotation.x,
    },
    car: { x: car.position.x, y: car.position.y, z: car.position.z, heading: carHeading },
    heli: { x: heli.position.x, y: heli.position.y, z: heli.position.z, heading: heliHeading },
    builds: builds.map(serializeBuild),
    harvestables: harvestables.map(h => ({
      hp: Math.max(0, Math.round(h.userData.hp)),
      destroyed: !!h.userData.destroyed,
    })),
  };
}

function restoreHarvestables(saved) {
  if (!Array.isArray(saved)) return;
  for (let i = 0; i < harvestables.length && i < saved.length; i++) {
    const h = harvestables[i], data = saved[i] || {};
    h.userData.hp = safeNumber(data.hp, h.userData.maxHp, 0, h.userData.maxHp);
    const destroyed = !!data.destroyed || h.userData.hp <= 0;
    h.userData.destroyed = destroyed;
    h.visible = !destroyed;
    if (h.userData.block) h.userData.block.active = !destroyed;
    if (destroyed) removeFromSolids(h); else addToSolids(h);
    if (h.userData.weakMesh) h.userData.weakMesh.visible = false;
  }
}

function applyCloudGameState(saved) {
  if (!saved || saved.version !== 1) return false;
  reset(false);

  score = Math.round(safeNumber(saved.score, 0, 0, 1000000000));
  health = safeNumber(saved.health, 100, 1, 100);
  elapsed = safeNumber(saved.elapsed, 0, 0, 10000000);
  wave = Math.round(safeNumber(saved.checkpointWave, 0, 0, 100000));

  for (const key of Object.keys(resources)) {
    resources[key] = Math.round(safeNumber(saved.resources && saved.resources[key], 0, 0, 100000000));
  }
  for (const id of Object.keys(WEAPONS)) {
    const a = saved.ammo && saved.ammo[id];
    if (!a) continue;
    ammo[id].mag = Math.round(safeNumber(a.mag, WEAPONS[id].magazine, 0, WEAPONS[id].magazine));
    ammo[id].res = Math.round(safeNumber(a.reserve, WEAPONS[id].reserve, 0, WEAPONS[id].maxReserve));
  }

  if (saved.player) {
    player.position.set(
      safeNumber(saved.player.x, 0, -BOUND + 1, BOUND - 1),
      safeNumber(saved.player.y, EYE, EYE, 14),
      safeNumber(saved.player.z, 0, -BOUND + 1, BOUND - 1)
    );
    player.rotation.y = safeNumber(saved.player.yaw, 0, -1000, 1000);
    pitchObj.rotation.x = safeNumber(saved.player.pitch, 0, -1.45, 1.45);
  }
  if (saved.car) {
    car.position.set(
      safeNumber(saved.car.x, CAR_SPAWN.x, -BOUND + 3, BOUND - 3),
      safeNumber(saved.car.y, CAR_SPAWN.y, 0, 5),
      safeNumber(saved.car.z, CAR_SPAWN.z, -BOUND + 3, BOUND - 3)
    );
    carHeading = safeNumber(saved.car.heading, 0, -1000, 1000);
    car.rotation.y = carHeading;
    refreshCarSolid();
  }
  if (saved.heli) {
    heli.position.set(
      safeNumber(saved.heli.x, HELI_SPAWN.x, -BOUND + 3, BOUND - 3),
      safeNumber(saved.heli.y, HELI_SPAWN.y, HELI_MIN_ALT, HELI_MAX_ALT),
      safeNumber(saved.heli.z, HELI_SPAWN.z, -BOUND + 3, BOUND - 3)
    );
    heliHeading = safeNumber(saved.heli.heading, 0, -1000, 1000);
    heli.rotation.y = heliHeading;
    refreshHeliSolid();
  }

  restoreBuildsFromSave(saved.builds);
  restoreHarvestables(saved.harvestables);
  equip(Math.round(safeNumber(saved.equippedSlot, 1, 0, SLOTS.length - 1)));
  updateHealth();
  hudScore.textContent = score;
  updateResHud();
  updateSlotsHud();
  updateAmmoHud();
  drawMinimap();
  startWave();
  cloudGameActive = true;
  cloudDirty = false;
  return true;
}

function markCloudDirty() { if (cloudGameActive) cloudDirty = true; }

function saveLocalCloudBackup() {
  if (!accountUser || !cloudGameActive) return;
  const key = localSaveKey();
  if (!key) return;
  try { localStorage.setItem(key, JSON.stringify(serializeGameState())); } catch (err) { /* best effort */ }
}

function recordGameEvent(eventType, payload) {
  if (!accountUser) return;
  pendingGameEvents.push({
    user_id: accountUser.id,
    event_type: String(eventType).slice(0, 50),
    payload: payload && typeof payload === 'object' ? payload : {},
  });
  if (pendingGameEvents.length >= 8) flushGameEvents();
}

async function flushGameEvents() {
  if (!accountUser || pendingGameEvents.length === 0) return;
  const batch = pendingGameEvents.splice(0, 25);
  const { error } = await supabaseClient.from('game_events').insert(batch);
  if (error) pendingGameEvents.unshift(...batch);
}

function saveCloudGame(force) {
  if (!accountUser || !cloudGameActive || (!force && !cloudDirty)) return Promise.resolve(false);
  if (cloudSaveBusy) {
    cloudSaveAgain = true;
    return cloudSavePromise || Promise.resolve(false);
  }
  cloudSaveBusy = true;
  const operation = performCloudSave();
  cloudSavePromise = operation;
  return operation.finally(() => {
    if (cloudSavePromise === operation) cloudSavePromise = null;
  });
}

async function performCloudSave() {
  cloudDirty = false;
  setCloudStatus('Sparar…', 'saving');
  const savedState = serializeGameState();
  const nextRevision = cloudRevision + 1;
  const key = localSaveKey();
  if (key) {
    try { localStorage.setItem(key, JSON.stringify(savedState)); } catch (err) { /* best effort backup */ }
  }
  const { error } = await supabaseClient.from('game_saves').upsert({
    user_id: accountUser.id,
    save_version: 1,
    revision: nextRevision,
    state: savedState,
  }, { onConflict: 'user_id' });
  if (error) {
    cloudDirty = true;
    setCloudStatus('Lokalt sparat', 'warning');
    console.error('Cloud save failed:', error.message);
  } else {
    cloudRevision = nextRevision;
    lastCloudSaveAt = Date.now();
    setCloudStatus('Sparat', 'saved');
    flushGameEvents();
  }
  cloudSaveBusy = false;
  if (cloudSaveAgain) {
    cloudSaveAgain = false;
    return saveCloudGame(true);
  }
  return !error;
}

async function loadCloudGame() {
  pendingCloudState = null;
  cloudRevision = 0;
  if (!accountUser) return;
  setCloudStatus('Laddar…', 'saving');
  const { data, error } = await supabaseClient
    .from('game_saves')
    .select('state, revision, updated_at')
    .eq('user_id', accountUser.id)
    .maybeSingle();
  if (!error && data) {
    pendingCloudState = data.state;
    cloudRevision = Number(data.revision) || 0;
    setCloudStatus('Molnsparning hittad', 'saved');
  } else if (error) {
    const key = localSaveKey();
    try { pendingCloudState = JSON.parse(localStorage.getItem(key) || 'null'); } catch (err) { pendingCloudState = null; }
    setCloudStatus(pendingCloudState ? 'Lokal backup hittad' : 'Kunde inte ladda', 'warning');
  } else {
    setCloudStatus('Nytt konto', 'saved');
  }
  startActionEl.textContent = pendingCloudState ? (TOUCH_DEVICE ? '▶ Tryck för att fortsätta' : '▶ Klicka för att fortsätta') : (TOUCH_DEVICE ? '▶ Tryck för att spela' : '▶ Klicka för att spela');
  newGameBtn.hidden = !pendingCloudState;
}

async function loadAccountProfile() {
  const { data, error } = await supabaseClient.from('profiles').select('username').eq('id', accountUser.id).maybeSingle();
  if (error || !data) return false;
  accountProfile = data;
  accountNameEl.textContent = accountProfile.username;
  return true;
}

async function activateAccount(session) {
  accountUser = session.user;
  accountValidatedAt = 0;
  if (!await verifyAccountSession('Kontot finns inte längre eller sessionen har gått ut. Logga in igen.')) return;
  if (!await loadAccountProfile()) {
    await invalidateAccount('Kontot saknar en giltig spelarprofil. Logga in igen.');
    return;
  }
  await loadCloudGame();
  if (!isGameAuthenticated()) return;
  hideAuthOverlay();
  if (state === 'auth') state = 'start';
  show('ov-start');
}

function deactivateAccount(message) {
  const wasAlreadyLocked = state === 'auth';
  accountUser = null;
  accountProfile = null;
  accountValidatedAt = 0;
  pendingCloudState = null;
  cloudGameActive = false;
  cloudRevision = 0;
  cloudDirty = false;
  pendingGameEvents.length = 0;
  newGameBtn.hidden = true;
  if (typeof releaseAllTouchInput === 'function') releaseAllTouchInput();
  if (document.pointerLockElement) document.exitPointerLock();
  if (!message && !wasAlreadyLocked) setAuthMessage('');
  showAuthOverlay(message);
}

function startAuthenticatedGame(forceNew) {
  if (!isGameAuthenticated()) { showAuthOverlay('Logga in med ett giltigt konto för att spela.'); return false; }
  if (!forceNew && pendingCloudState) {
    const saved = pendingCloudState;
    pendingCloudState = null;
    newGameBtn.hidden = true;
    if (applyCloudGameState(saved)) return true;
    setCloudStatus('Sparningen var inkompatibel – nytt spel', 'warning');
  }
  pendingCloudState = null;
  newGameBtn.hidden = true;
  reset();
  cloudGameActive = true;
  cloudDirty = true;
  recordGameEvent('new_game', { wave: 1 });
  return true;
}

for (const tab of authTabEls) tab.addEventListener('click', () => selectAuthTab(tab.dataset.authTab));

authLoginForm.addEventListener('submit', async e => {
  e.preventDefault();
  setAuthBusy(true);
  setAuthMessage('Loggar in…');
  const form = new FormData(authLoginForm);
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: String(form.get('email') || '').trim(),
    password: String(form.get('password') || ''),
  });
  if (error) setAuthMessage('Inloggningen misslyckades. Kontrollera e-post och lösenord.', 'error');
  setAuthBusy(false);
});

authRegisterForm.addEventListener('submit', async e => {
  e.preventDefault();
  const form = new FormData(authRegisterForm);
  const username = String(form.get('username') || '').trim();
  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    setAuthMessage('Användarnamnet ska vara 3–20 tecken och bara innehålla bokstäver, siffror eller _.', 'error');
    return;
  }
  if (password.length < 8) {
    setAuthMessage('Lösenordet måste vara minst 8 tecken.', 'error');
    return;
  }
  setAuthBusy(true);
  setAuthMessage('Kontrollerar användarnamnet…');
  const { data: usernameAvailable, error: usernameError } = await supabaseClient
    .rpc('is_username_available', { candidate: username });
  if (usernameError) {
    console.error('Username availability check failed:', usernameError.message);
    setAuthMessage('Kunde inte kontrollera användarnamnet. Försök igen om en stund.', 'error');
    setAuthBusy(false);
    return;
  }
  if (!usernameAvailable) {
    setAuthMessage('Användarnamnet är redan upptaget. Välj ett annat.', 'error');
    setAuthBusy(false);
    return;
  }
  setAuthMessage('Skapar konto…');
  const redirectTo = location.origin + location.pathname;
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { username }, emailRedirectTo: redirectTo },
  });
  if (error) {
    console.error('Signup failed:', error.code || error.status || '', error.message);
    setAuthMessage(signupErrorMessage(error), 'error');
  } else if (!data.session) {
    selectAuthTab('login');
    setAuthMessage('Kontot är skapat. Kontrollera din e-post och bekräfta kontot innan du loggar in.', 'success');
  }
  setAuthBusy(false);
});

document.getElementById('accountSave').addEventListener('click', e => {
  e.stopPropagation();
  markCloudDirty();
  saveCloudGame(true);
});

async function logoutAccount(e) {
  e.preventDefault();
  e.stopPropagation();
  if (state === 'playing' && typeof pauseGame === 'function') pauseGame();
  await saveCloudGame(true);
  await flushGameEvents();
  try { await supabaseClient.auth.signOut({ scope: 'local' }); }
  finally { deactivateAccount(); }
}

document.getElementById('accountLogout').addEventListener('click', logoutAccount);
document.getElementById('pauseLogout').addEventListener('click', logoutAccount);

newGameBtn.addEventListener('click', e => {
  e.preventDefault();
  e.stopPropagation();
  if (!confirm('Starta ett nytt spel? Din nuvarande molnsparning ersätts vid nästa sparning.')) return;
  requestNewAuthenticatedGame();
});

supabaseClient.auth.onAuthStateChange((event, session) => {
  setTimeout(() => {
    if (event !== 'INITIAL_SESSION' && session && (!accountUser || accountUser.id !== session.user.id)) activateAccount(session);
    else if (!session && event === 'SIGNED_OUT') deactivateAccount();
  }, 0);
});

async function initializeAccount() {
  state = 'auth';
  const { data, error } = await supabaseClient.auth.getSession();
  if (error || !data.session) deactivateAccount();
  else await activateAccount(data.session);
  cloudAutosaveTimer = setInterval(() => {
    if (accountUser && Date.now() - accountValidatedAt >= 15000) {
      verifyAccountSession('Kontot eller sessionen är inte längre giltig. Logga in igen.');
    }
    if (state === 'playing' && cloudGameActive && (cloudDirty || Date.now() - lastCloudSaveAt > 30000)) {
      cloudDirty = true;
      saveCloudGame(false);
    }
  }, 15000);
}

addEventListener('focus', () => {
  if (accountUser) verifyAccountSession('Kontot eller sessionen är inte längre giltig. Logga in igen.');
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && accountUser) verifyAccountSession('Kontot eller sessionen är inte längre giltig. Logga in igen.');
});

initializeAccount();
