# Decisions

## 2026-10-09 — Architecture: authoritative Multiplayer Server

- SDK branch `@dcl/sdk@auth-server` + `@dcl/js-runtime@auth-server`.
  `authoritativeMultiplayer: true` en scene.json (auto-agregado por el build).
- Server headless (`src/server/game.ts`) es la única autoridad: tiburones,
  pickups, slots de jugador, fase de turno, scores. Todo via `syncEntity` +
  `validateBeforeChange` (solo `AUTH_SERVER_PEER_ID` escribe).
- Clientes mandan intenciones con `registerMessages`: move/attack/respawn/
  saveScore. Server valida (fase, stun, cooldown, celda cardinal).
- Muerte/kill check por celda, no por posición (la grilla es lo autoritativo).
- Leaderboard: `Storage` world-level, top 10, opt-in via botón SAVE SCORE.
- Si `isStateSyncronized()` no llega en 12 s → modal de error (sin server).
- Rechazado por ahora: serverless (MessageBus/syncEntity por cliente) — sin
  autoridad ni persistencia, y el user pidió server explícitamente.

## 2026-10-09 — Mobile (docs Build for Mobile leídas)

- `TouchScreenControls` en RootEntity: joystick, crosshair y todos los botones
  nativos ocultos. Movimiento y ataque son UI custom (d-pad + 👊), sancionado
  por docs ("replace the native controls entirely with custom UI").
- UI con `screenInset: 'interactable'`; d-pad abajo-izq, ataque abajo-der,
  HUD arriba-centro. Botones ≥96px.
- Sin IA_ACTION_3–6, sin jump/E/F. `InputModifier disableAll` para desktop.
- Cámara fija top-down con `VirtualCamera` + `MainCamera`, pitch +78°
  (positivo = hacia abajo; nunca 90 exacto, rompe referencia de dirección).

## Pendientes

- Mapa que crece con cantidad de jugadores + más tiburones (sensación infinita).
- Scoreboard visible in-world (hoy solo se guarda, no se muestra).
- Guests sin wallet: slots usan address; verificar comportamiento con guest.

## 2026-10-09 — Global turns + endless 50×50 board (Kuruk)

- Board = whole scene: 200×200 cells of 4 m (50×50 parcels). Sharks and
  pickups appear around players as they swim; the 800 m edge is the limit.
- Global turns: players 2 s, then sharks 0.5 s with nobody moving.
- Movement stays grid d-pad (chosen over free joystick + freeze).

## 2026-10-09 — Merge with Manu's parallel refactor (8bdd87d) (Kuruk)

Kuruk asked to merge Manu's work into the global-turns version. Kept the
global-turns design (Kuruk's decisions above); ported from Manu:
- client prediction (hop on tap; server confirms or snaps back), desktop
  WASD/arrows + E as optional extras (keyboard under `disableAll` unverified);
- server slot dedupe on reconnect + move-reject logging;
- red full-screen wash during the sharks' turn;
- Jaws loops, now chosen by depth (harbor calm → climax); 0.5 s phases are
  too short to swap tracks. Game-use permission still unresolved (references.md);
- preview tooling: MP server as a supervised separate process (also in the
  Windows script).
Not ported (assistant proposal, accepted by Kuruk's merge request): world-shift
8×8 tiling and AvatarShape copies (needed only because world-shift parks every
real avatar at the center; real avatars move on the real board here), 10 s /
3-move turns, telegraph-then-attack. `fist.png` and `cell-border.png` kept unused.

## 2026-10-09 � End-game expansion (owner)

- Planning changes from 2 to 3 seconds; execution stays 0.5 seconds.
- Collect and plant sea mines: two round resolutions, center plus four cardinal
  neighbors, lethal to players and sharks, camera shake on explosion.
- Boost explicitly confirmed: 4 moves per round for 5 rounds.
- Touch movement pad only when `isMobile()`; desktop keeps keyboard movement.
- New generated mine, boost and life-jacket 2D placeholders; Meshy deferred.
- Agent tuning for this try is in [exploration](playtests/endgame/exploration.md).

Mobile docs re-read before this build: [input](https://docs.decentraland.org/creator/build-for-mobile/develop/input-on-mobile),
[safe area](https://docs.decentraland.org/creator/build-for-mobile/develop/safe-area),
[UI](https://docs.decentraland.org/creator/build-for-mobile/develop/ui-best-practices),
[performance](https://docs.decentraland.org/creator/build-for-mobile/develop/optimize-performance),
[missing features](https://docs.decentraland.org/creator/build-for-mobile/mobile-client/missing-features).
Applied: tap-only controls, explicit virtual sizes and label boxes, safe-area HUD,
small raster pickup sprites, pooled mines/FX; no nine-slice dependency or new lights
or particle emitters. Native action buttons remain hidden so custom bottom-right
buttons work. Check the docs' mobile limits/performance panel on device; build and
triangle counts alone do not establish performance. PC phone emulation is not a
substitute for the Motorola check.

Owner follow-up: use bevy-web for PC visual verification. Global HUD margins
on desktop only; mobile keeps only SDK safe areas, with no extra margin or
decorative frame. Applied as a shared 24-unit inset guarded by isMobile().

2026-10-10 — Owner: the execution (swim) turn goes from 0.5 s to 1 s (`SHARKS_TIME`);
shark lunges, the timer bar and the swimmer/camera glides follow it. Not yet
playtested on the phone.

2026-10-10 — Agent (reading godot-explorer `release`, not yet confirmed on device):
swim/float trouble on the phone is likely trigger loss, not locomotion. Godot drops
scene-emote requests <0.5 s apart and while an emote is loading; scene emotes on an
AvatarShape never loop. `src/client/avatars.ts` now queues triggers behind a 0.6 s gap,
preloads swim + float at spawn (hidden under the water for 2.4 s), and re-triggers float
at 1.5 s. Applies to every client, no `isMobile()` branch.

2026-10-10 - Owner: shark-loss cinematic based on the thumbnail/Jaws poster; lone swimmer, upward shark attack through transparent water, camera transition, no actions or personal turn counting. Build/evidence: [cinematic exploration](playtests/endgame/cinematic.md).

2026-10-10 - Owner: keep cinematic camera at 60 degrees (known mobile FOV issue); replace black water with a full-screen ocean image, repeat swimming continuously, and start the shark lower. No duplicate SDK report.

2026-10-10 - Owner (Kuruk): smart sharks, built for the next try (plan: review of
spawn/movement/collision plus coordinated packs).
- Max hunters per player: 1 near the raft (tier 0), 2 deeper, +1 when 4+ players
  are in open water ("it should adapt"); cap 3. Everyone else ignores players.
- Pack roles: chaser ("Bruce") runs its lane straight through you; blocker ("the
  Tiger") cuts off where you're heading.
- Lanes are walls: paths can't cross a shark or its lane. Toggle in
  `src/shared/config.ts` (`LANES_BLOCK_PATHS`, default on). The "only the final cell
  bites" rule stays.
- SLAP removed entirely (no stun).
- JAWS extras in scope: lock-on pulse audio, blood in the water + named deaths,
  chum/decoy pickup, yellow barrels as a pickup + HARPOON button.
Tunables in config.ts are starting values, not validated. Records:
[smart sharks try](playtests/smart-sharks.md).

2026-10-10 - Owner (Kuruk): d-pad moves to the bottom-right (from closed PR #1); the
gear buttons (mine, barrel, chum) move to the bottom-left. PR #1's slap removal was
already in the smart-sharks work.

2026-10-10 - Owner (Kuruk): BOTS, exactly like real players, so people can't tell.
- Each bot is an ordinary PlayerSlot (fake wallet-style address, player-style name,
  random base-avatars wearables and colours), drawn by every client as an AvatarShape
  like any player. Sharks hunt them; they act only through the players' own actions.
- Start with 2. Count is `BOT_COUNT` in `src/shared/config.ts` (0 = off).
- A bot loses after ~5 min of play (`BOT_PLAY_SECONDS` = 300, +/- `BOT_PLAY_JITTER`):
  it stops dodging and lets a shark get it.
Agent defaults, not owner decisions: after losing, a bot swims again or leaves and a
new one joins later (`BOT_LEAVE_CHANCE` 0.4); bots don't save to the leaderboard
(`BOT_SAVE_SCORES` = false). Headless check: `node scripts/test-bots.cjs`. Not yet
seen on the phone.

2026-10-10 - Owner UI correction: use the interactable area without added outer
margins, separate gold/gear stats from PICK A MOVE, remove the GO red wash.
Movement returns to bottom-left; action items return to bottom-right, superseding
the PR #1 layout above. Implementation/checks: [HUD pass](playtests/endgame/ui.md).

2026-10-10 - Owner (Kuruk): admin access for 0x481bed8645804714Efd1dE3f25467f78E7Ba07d6
to RESET THE WORLD and change the number of bots in game. `ADMINS` in
`src/shared/config.ts`. Agent choices: two-tap RESET; reset clears every slot (players
and bots) and the sea but keeps the saved leaderboard; bot count 0..`BOT_MAX` (20),
stored on the server so it survives restarts. Deployed 57ccf08; not yet tried in game.

2026-10-10 - Owner (Kuruk): avatars read too small. Make the TILES smaller rather than
scaling the avatars, and show a player's name above their avatar when you are near
them. Agent choice: CELL 4 m -> 3.2 m (GRID 200 -> 250, still the full 800 m), so an
avatar is 25% bigger relative to a tile (4 / 3.2 = 1.25). Nametag distance is a
starting value, not validated.
Agent defaults: game rules stay in cells (same balance); camera unchanged, so
avatars keep their pixel size and ~25% more cells fit on screen. Tile-tied props
(fins, pickups, mine sprite, marks) shrink by `PROP_SCALE` = CELL/4; shark barrel
counts and mine blast plates keep their size. Raft scaled (0.8, 1, 0.8) in the
composite, scoreboard z 407.6. Names: TextShape over other players within
`NAMETAG_CELLS` (3), not over yourself. Phone, first look:
[smaller-tiles-phone.png](playtests/smaller-tiles-phone.png). Open: spawn ring
5..10 cells is now 16..32 m (sharks may surface in view); scoreboard still sits
on two raft spawn cells (as before).

2026-10-10 - Owner (Kuruk): the shark lunge was too violent. It should read as a
displacement, not a jump out of the water; the jump is for when it eats someone. Also
a Counter-Strike-style global kill feed below the minimap when someone dies to a
shark, with that player's score; bots appear exactly the same as players.
Agent choices: lunge = surge 1.2 m under the surface (`SURGE_DEPTH`); a shark with a
swimmer it eats leaps (old peak height): it reaches the first victim on the lane as
their avatar arrives (`LEAP_PEAK` 0.78 of the dash) and lands as the dash ends. Life
jackets absorb the bite, so a jacket save gets no leap. Feed: up to 4 rows for 6 s under
the radar/HUNTED pill, on its own UI layer so it also shows while you are dead; shark
icon (Bruce/Tiger/other) + name + score at death; shark deaths only, not mines.
Starting values, not yet tried in game.

2026-10-10 - Owner (Kuruk): make a shark lane's DIRECTION readable, e.g. an icon per
square or something animated. Agent choice: one flat arrow per lane cell (UI
`arrow-up.png`, tinted by lane tone), drifting from the shark toward the lane's end
(`ARROW_FLOW` 1.4 cells/s), fading in and out at the ends. Phone first look: arrows
point along the lane; size raised to 0.85 cell after it read small. Not yet judged in play.

2026-10-10 - Owner correction: the left movement arrows use the DEVICE safe inset,
not the interactable area. No additional left/bottom padding. Informational HUD
and gear retain the interactable inset.

2026-10-10 - Owner (Kuruk): limit the map size (no endless ocean), draw a line between
depth zones, turn off the landscape terrain generation, and always show my own nametag.
Owner choice: 3 depth zones. Agent choices: `MAX_TIERS` 3 -> `MAX_DEPTH` 35 cells from
the raft centre (71x71 cells, ~227 m); `inBoard` enforces it for players, sharks,
pickups, mines and bots. The 50x50-parcel scene and all positions stay unchanged. Red
shark net (1.2 m) at the edge; gold line where DEPTH 2 starts, coral where DEPTH 3
starts; the same lines on the radar; HUD depth turns coral at DEPTH 3. DEEP DIVER target
capped at 3. scene.json root `"landscapeTerrain": false` (docs: scene-metadata
"Landscape terrain"; single-scene Worlds only, ignored in Genesis City). Own nametag
shows over your avatar at all times, except while dead or loading in.
Known consequence, not changed: tier is at most 2 now, so `WANDER_BITE_TIER` (3),
`ELROY_TIER` (5), `SAFE_FLOOR_BY_TIER[3..]` and `SHARKS_NEAR_MAX` (9) never apply:
non-hunter sharks never bite and at most 5 sharks spawn around you. Phone: own tag and
radar line seen, [own-nametag-radar-phone.jpg](playtests/own-nametag-radar-phone.jpg).
In-world lines, net and terrain-off not yet seen in game.

2026-10-10 - Owner (Kuruk): billboard item art (mines, boost, bait, life jacket) can't have a
transparent background with its material type; hide the AvatarShape nametags; on desktop
(`!isMobile()`) keep the UI off the screen borders.
Desktop Explorer A/B/C test (sea-mine.png beside the player): basic material = black square;
basic + `alphaTexture` = background gone but the dark mine turns faint (alpha read from
brightness); PBR `MTM_ALPHA_TEST` + same texture as emissive = clean cutout, looks unlit.
Agent choice: the last one, `setSpriteMaterial` in `src/client/sprite.ts`. A live pickup was
not caught on camera after the switch; phone not yet checked.
AvatarShape `name: ''` removes the client's pill nametag (desktop, seen); our TextShape name
stays. Desktop HUD renderers sit inside a 32 px (virtual 1920x1080) margin via
`edgePadded` in `src/client/ui-frame.tsx`; vignette, cinematic, no-server blocker and the
mobile move pad stay unpadded. Seen on desktop; phone unchanged by design.
