# Ideas

## Shark board — last man standing (idea de Manu, 2026-10-09)

Tablero de agua con tiburones (visibles como aletas). Jugadores entran en
cualquier momento y se mueven libremente.

- **Tiburones**: cada 2 s se mueven 3 veces en direcciones random. Al atacar,
  pegan en un 3×3 hacia adelante de su dirección final.
- **Jugador**: botón de atacar → stun de 3 s a otro jugador.
- **Puntos**: por tiempo sobrevivido + moneditas que spawnean random cada tanto.
- **Escala**: N tiburones en el espacio; el mapa se agranda si entran más
  jugadores y muestra más tiburones. Sensación de infinito sin serlo.
- **Agua**: copiada de raft-game (`src/factories/water.ts`, plano tiled PNG +
  bump + UV scroll).

### Resueltas (2026-10-09, Manu)

- Muerte: juego continuo. Botón de respawn. Puntos no se pierden.
- Powerup de vida extra: si lo tenés, safás de morir (se consume).
- Scoreboard: opt-in, el jugador decide si sube su nombre.

### Abiertas

- ¿El stun te deja vulnerable al tiburón? (probablemente sí = la gracia)
- Tamaño inicial del tablero y cuánto crece por jugador.
- Scoreboard: dónde persiste (server externo vs nada).

## Turns refactor — assistant proposals built for the first try (2026-10-09)

Built and running on the phone; not yet judged by the owner. Tunables live in
`src/shared/config.ts`.

- 3 hops per players' turn (`MOVES_PER_TURN`).
- Sharks show a straight red lane (own cell + up to 3 ahead) for the whole
  players' turn, then dash it; anyone on it at the end is bitten. Hunters
  (darker red) aim at the nearest player within 8 cells; others wander.
- Safe harbor 5×5 at spawn (buoys): no sharks, no points.
- Depth tiers every 12 cells from the harbor: more sharks near you, coins
  worth more, survival points per turn grow.
- Sharks/pickups are fixed synced pools (48/40) that surface 5–10 cells
  from a player and sink beyond 15. Grid lines only drawn 9 cells around you.
- Score kept on death (matches "puntos no se pierden"); leaderboard keeps
  each name's best.

Smoke 2026-10-09 (agent screenshots, phone, single player): scene loads at
~60 FPS, turn bar/pips/depth update, lanes and breaches render, score rose
while out at depth 2. No human play impressions recorded yet.
Seen in screenshots: d-pad sits mid-screen over the avatar; 👊 attack button
renders blank (emoji missing in mobile font); harbor patch not visible;
debug line still shown; fins are plain boxes.

## Pick-then-execute + boosts (Kuruk, 2026-10-09)

Built: players' turn = plan a path of up to `maxSteps` cells (2 for testing),
execution = everyone swims while sharks dash; bite checks only the final cell.
Next suggested (not chosen): a BOOST pickup that raises `PlayerSlot.maxSteps`
(+1, maybe for N turns). Open: should crossing a lane mid-path also bite?

## More end-game options (assistant suggestions, 2026-10-09)

Current try: salvage, shark-hunt and depth contracts. Boost superseded by the
owner's confirmed 4 moves for 5 rounds; see decisions.md.

- Distress beacon: activate a buoy, then survive nearby until rescue arrives.
  Staying near it creates a reason to plan mine placement instead of always fleeing.
- Heavy treasure chest: carry it back to the raft; choose a safer route or spend
  equipment to get home. Could become an optional finish to an expedition.
- Bait: throw a fish onto a tile to lure sharks toward a planted mine. Reuses
  the existing fish art and makes hunting more deliberate.

Not selected or implemented. Owner can mix, replace, or skip these.

## Smart sharks - open levers and remaining JAWS menu (assistant, 2026-10-10)

Built try: [playtests/smart-sharks.md](playtests/smart-sharks.md). The chum pickup
covers the earlier "Bait" suggestion above.

Unchosen levers if packs still feel easy after play: shorter planning at depth;
wanderers biting from a shallower tier (`WANDER_BITE_TIER`); 4-cell chaser
lunge earlier (`ELROY_TIER`).
Remaining JAWS-inspired ideas, not selected: submerged deep sharks (non-hunter
lanes appear late at tier 3+), a grudge/bounty shark (gold fin that keeps its
target, 3x bounty). The game's title and the Williams theme loops still carry the
music-permission question recorded in references.md; the new lock-on cues are
original synthesized heartbeats.
