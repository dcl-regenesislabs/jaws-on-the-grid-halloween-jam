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
