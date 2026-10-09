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
