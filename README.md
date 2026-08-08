# Cube Assault 3D

A browser-based first-person shooter / battle-builder built with plain [Three.js](https://threejs.org/) and Supabase authentication/cloud saves. Fight waves of enemies and minibosses, harvest resources, build defensive structures (walls, windows, doors, ramps, floors), and drive a car or fly a helicopter gunship around an open 320×320 unit map. Fully playable with keyboard/mouse on desktop or touch controls on phones and tablets.

## Project structure

```
3D Shooting game/
├── index.html            HTML structure, HUD/overlay markup, touch control markup, script tags
├── css/
│   └── styles.css        All game styling (HUD, overlays, animations, touch controls, responsive layout)
├── js/
│   ├── core.js            Scene/camera/renderer, touch-device detection, shared game state,
│   │                       collision system, shared geometry/material helpers, particle pool
│   ├── audio.js            AudioContext setup, synthesized sound effects
│   ├── ui.js                HUD updates, overlays, banners, boss health bars, minimap
│   ├── world.js            Lighting, terrain, environment props, map boundaries,
│   │                        day/night cycle, static world colliders
│   ├── player.js            Player/camera rig, movement (keyboard + analog joystick), mouse-look, damage/death
│   ├── items.js              Weapons, pickaxe, inventory, shooting, reloading,
│   │                          projectiles/explosions
│   ├── build.js               Build mode, ghost previews, placement, doors, ramps
│   ├── pickups.js              Ammo drops, ammo boxes, pickup collection
│   ├── enemies.js               Enemies, minibosses, waves, AI, enemy projectiles
│   ├── car.js                    Drivable vehicle
│   ├── heli.js                    Flyable helicopter gunship
│   ├── mobile.js                   Touch input layer: joystick, look-zone, action buttons, build panel
│   ├── supabase-client.js           Public Supabase browser-client configuration
│   ├── account.js                   Registration, login, session handling, cloud save/load and event log
│   └── main.js                     Initialization, input routing, main loop (loads last)
├── lib/
│   ├── three.min.js       Three.js library (external, unmodified)
│   ├── supabase.js        Vendored Supabase JavaScript browser client
│   └── supabase.LICENSE   Supabase JavaScript client license
├── supabase/
│   └── migrations/        Profiles, per-user saves, event history and RLS policies
├── assets/
│   ├── images/            (currently empty — the game uses no image assets)
│   ├── audio/              (currently empty — all sound is synthesized at runtime)
│   └── models/              (currently empty — all models are built from
│                             Three.js primitives at runtime)
└── README.md
```

## File responsibilities

| File | Responsibility |
|---|---|
| `js/core.js` | Three.js scene/camera/renderer setup, touch/coarse-pointer device detection (`TOUCH_DEVICE`) and pixel-ratio cap, shared game-mode/state constants, shared vectors and raycaster, collision utilities (`blocked`, `slideMove`, `supportHeightAt`), shared geometry/material caching, pooled particle effects. |
| `js/audio.js` | The single shared `AudioContext` + master gain, and every synthesized sound effect (gunfire, footstep, build, damage, UI cues, etc). |
| `js/ui.js` | Cached DOM references, HUD text/bar updates (health, ammo, score, wave, resources, build info), overlay show/hide, hit markers, floating gain text, wave banners, miniboss health bars, and the minimap renderer. |
| `js/world.js` | Sun/hemisphere lighting, ground and terrain props, the farm/town/garage areas, map boundary colliders, harvestable resources, and the day/night cycle. |
| `js/player.js` | The player/camera rig, movement with sprint (keyboard WASD, with an analog touch-joystick fallback), jump/gravity, mouse-look, and player damage/death handling. |
| `js/items.js` | Weapon definitions and state, the pickaxe, equip/reload logic, hitscan and rocket weapons, muzzle/tracer effects. |
| `js/build.js` | Build-mode selection, ghost preview and grid snapping, placement validation, wall/window/door/ramp/floor pieces, door open/close behavior, build damage and cleanup. |
| `js/pickups.js` | Enemy ammo drops and searchable ammo boxes. |
| `js/enemies.js` | Regular enemy types and the four minibosses, wave spawning, AI/attacks, damage and death, enemy projectiles, miniboss rewards. |
| `js/car.js` | The drivable vehicle: enter/exit, driving physics, collision, chase camera. |
| `js/heli.js` | The flyable helicopter gunship: enter/exit, flight physics, collision, mounted machine gun. |
| `js/mobile.js` | Touch input layer, active only on coarse-pointer/touch devices: the analog left-stick joystick, the drag-to-look right-side "look zone", all action buttons (fire/aim/jump/reload/interact/build/pause/up/down), the build-mode panel, inventory-slot taps, per-frame HUD sync, and guaranteed input release on pointer-up/cancel/pause/blur/reset. Reuses the same shared gameplay actions/globals as desktop input — no gameplay logic is duplicated. |
| `js/supabase-client.js` | Creates the browser Supabase client with persistent sessions. Contains only the public browser key; authorization is enforced by database RLS. |
| `js/account.js` | Account UI, email/password registration, unique usernames, login/logout, session restoration, remote save/load, local emergency backup, autosave and meaningful game-event logging. |
| `js/main.js` | Wires everything together: window resize/orientation handling, the shared input-action functions (`primaryActionDown`/`interact`/`equipSlot`/`reloadOrRotate`/etc.) that both the desktop keyboard/mouse router and `mobile.js` call into, state transitions (`reset`, `gameOver`, `pauseGame`), and the main render loop that calls each subsystem's per-frame update function in order. Loads after every subsystem except `main.js` itself. |

## Script loading order

```html
<script src="lib/supabase.js"></script>
<script src="js/supabase-client.js"></script>
<script src="lib/three.min.js"></script>
<script src="js/core.js"></script>
<script src="js/audio.js"></script>
<script src="js/ui.js"></script>
<script src="js/world.js"></script>
<script src="js/player.js"></script>
<script src="js/items.js"></script>
<script src="js/build.js"></script>
<script src="js/pickups.js"></script>
<script src="js/enemies.js"></script>
<script src="js/car.js"></script>
<script src="js/heli.js"></script>
<script src="js/mobile.js"></script>
<script src="js/account.js"></script>
<script src="js/main.js"></script>
```

These are classic (non-module) scripts that share one global scope — there is no bundler and no `import`/`export`. The vendored Supabase client and its configuration load first. `three.min.js` then loads before every gameplay file that uses the `THREE` global. `account.js` loads after all gameplay systems so it can serialize their state, but before `main.js` wires the final input flow and starts the render loop.

## Accounts and cloud saves

- Registration uses email, password and a case-insensitive unique username.
- Supabase Auth persists the browser session, while Postgres RLS restricts every profile, save and event row to its owner.
- Cloud saves include score, health, wave checkpoint, resources, ammo, equipped item, player/car/helicopter positions, harvest state and player-built structures.
- Autosave runs during play, at wave completion, on pause and on game over. A per-account local backup is used only if the network save cannot be loaded.
- Mid-wave saves restart the current wave on load rather than serializing live enemy AI/projectiles.

## Running the game

This game must be served over HTTP — opening `index.html` directly from disk (a `file://` URL) is **not supported**, because the split into multiple `<script src="...">` files and `css/styles.css` will be blocked by the browser's local-file security restrictions in most configurations.

From the project root, start any static file server, for example:

```sh
# Node.js (no install needed if you have npx)
npx serve .

# or Python 3
python -m http.server 8000
```

Then open the printed local address (e.g. `http://localhost:8000` or `http://localhost:3000`) in a browser. To test the touch controls, open that address on a phone/tablet on the same network (or use your browser's device-emulation mode) — touch controls only appear on devices that report a coarse pointer and/or touch support (`matchMedia('(pointer: coarse)')` / `navigator.maxTouchPoints`), never on a desktop browser just because the window is narrow.

## Controls

### Desktop (keyboard + mouse)

- **WASD** — move
- **Shift** — sprint
- **Space** — jump (handbrake while driving)
- **Mouse** — look
- **Left click** — fire / swing pickaxe / place build piece / open or close a targeted door
- **Right click** — aim / rotate build preview
- **1–7** — pickaxe / rifle / shotgun / bazooka / AK-47 / sniper / machine gun
- **Mouse wheel** — cycle equipped item (cycles build piece instead while in build mode)
- **Q** — toggle build mode
- **Z / X / C / V** — select wall / window / ramp / floor
- **R** — reload (weapon mode) or rotate build piece 90° clockwise (build mode)
- **Shift+R** — rotate build piece 90° counter-clockwise (build mode)
- **M** — cycle build material (wood / stone / metal)
- **E** — enter/exit the car or helicopter, open/close a targeted door, or search a nearby ammo box (context-sensitive)
- **Esc** — pause (via releasing pointer lock)

Click the start screen to begin — this grants mouse pointer lock for looking around. Click again to resume from pause, or to retry after dying.

### Touch (phone / tablet)

Touch controls appear automatically on coarse-pointer/touch devices — landscape orientation is recommended (a "Rotate your device" hint appears in portrait, but nothing breaks if you ignore it).

- **Left analog stick** (bottom-left) — move on foot / throttle & steer the car / fly forward-back & yaw the helicopter. Push gently for a slow walk, push to the edge to auto-sprint.
- **Drag anywhere on the right side of the screen** — look around / aim, exactly like mouse-look (also steers the car's free-look camera and the helicopter's aim).
- **FIRE** (bottom-right, large) — fire / swing the pickaxe / place the selected build piece. Hold for automatic weapons; semi-auto weapons still fire once per tap, matching desktop.
- **ADS** — toggle aim down sights (stays on so you can move and fire while aiming, unlike the desktop hold-to-aim).
- **JUMP** — jump on foot. Becomes **BRAKE** (handbrake) while driving the car; hidden while flying the helicopter (see UP/DOWN below).
- **RELOAD** — reload the current weapon. Becomes **ROTATE** in build mode, rotating the build ghost.
- **E** — the same context-sensitive interact as desktop: enter/exit vehicles, open doors, search ammo boxes.
- **🧱** — toggle build mode.
- **UP / DOWN** — shown only while flying the helicopter, for ascend/descend.
- **⏸ (top-center)** — pause. Tap the pause screen to resume (no pointer lock needed on touch).
- **Inventory slots** (top-right) — tap a slot to equip that item, same slots as desktop (keyboard number hints are hidden on touch).
- **Build panel** (shown only in build mode) — tap WALL / WIN / RAMP / FLOOR to pick a piece, MAT to cycle material, PLACE to place (hold to chain-place like desktop), EXIT to leave build mode.

All touch input is released — movement stops, firing stops, aiming turns off — whenever a finger lifts, a touch is cancelled, the tab loses focus or visibility, the game pauses, ends, or resets.
