import { getPlayerLanguage } from '@dcl/sdk/platform'

// English / Spanish. The default follows the phone's language
// (getPlayerLanguage(), a BCP-47 tag that also tracks mid-session changes);
// the raft button overrides it for this session.
export type Lang = 'en' | 'es'

let override: Lang | null = null

export function lang(): Lang {
  if (override) return override
  return getPlayerLanguage().toLowerCase().startsWith('es') ? 'es' : 'en'
}

export function toggleLang() {
  override = lang() === 'es' ? 'en' : 'es'
}

const ES = {
  'raft': 'BALSA',
  'depth': 'PROF.',
  'pick-move': 'ELIGE UN MOVIMIENTO',
  'go': '¡YA!',
  'raft.hint1': 'Toca las flechas para planear. Evita los carriles de tiburón.',
  'raft.hint2': '¡Nada fuera de la balsa para empezar!',
  'lane.blast': 'EXPLOSIÓN EN LA PRÓXIMA RONDA - ¡SAL!',
  'lane.shark': 'TU CASILLA ESTÁ EN UN CARRIL DE TIBURÓN',
  'no-target': 'SIN OBJETIVO',
  'harpoon': 'ARPÓN',
  'chum': 'CEBO',
  'mine': 'MINA',
  'hunted': 'CAZADO',
  'blood': 'SANGRE EN EL AGUA',
  'exp': 'EXP',
  'ok': 'OK',
  'notice.mine': 'MINA ENCONTRADA - PONLA Y ESCAPA',
  'notice.jacket': 'CHALECO SALVAVIDAS - SALVA DE UNA MORDIDA',
  'notice.boost': 'IMPULSO - 4 MOVIMIENTOS / 5 RONDAS',
  'notice.barrel': 'BARRIL AMARILLO - ARPONEA UN TIBURÓN CERCANO',
  'notice.chum': 'CEBO - SUÉLTALO PARA ATRAER A LOS TIBURONES',
  'notice.harpooned': '¡ARPONEADO! ESE TIBURÓN VA MÁS LENTO',
  'notice.chum-used': 'CEBO EN EL AGUA - ¡ALÉJATE NADANDO!',
  'notice.jacket-used': '¡EL CHALECO TE SALVÓ!',
  'notice.blood': 'SANGRE EN EL AGUA - ¡VIENEN!',
  'notice.shark-down': '¡TIBURÓN ABATIDO! +75',
  'notice.contract': 'CONTRATO COMPLETO - BONO SUMADO',
  'notice.expedition': 'EXPEDICIÓN COMPLETA - NUEVOS CONTRATOS',
  'boost.status': 'MOVIMIENTOS',
  'rounds': 'RONDAS',
  'death.mine': 'Te alcanzó la explosión de una mina.',
  'death.bruce': 'Te quedaste en el carril de Bruce.',
  'death.tiger': 'El Tigre te cortó el paso.',
  'death.wander': 'Un tiburón errante te encontró.',
  'death.blasted': '¡VOLADO!',
  'death.chomped': '¡MORDIDO!',
  'back-to-raft': 'VOLVER A LA BALSA',
  'swim-again': 'NADAR OTRA VEZ',
  'score-saved': 'PUNTAJE GUARDADO',
  'save-score': 'GUARDAR PUNTAJE',
  'death.preview': 'Solo vista previa. Puntaje y equipo sin cambios.',
  'death.kept': 'Puntaje y contratos se conservan. Pierdes el equipo.',
  'lost.title': 'PERDIDO EN EL MAR',
  'lost.body': 'No hay servidor multijugador.\nVuelve a entrar a la escena para reintentar.',
  'exit': 'SALIR',
  'view-scoreboard': 'Ver tabla de puntajes',
  'scores.loading': 'Cargando puntajes...',
  'scores.error': 'Puntajes no disponibles',
  'scores.none': 'Aún no hay puntajes guardados',
  'lang.button': 'IDIOMA: ESPAÑOL'
} as const

type Key = keyof typeof ES

const EN: Record<Key, string> = {
  'raft': 'RAFT',
  'depth': 'DEPTH',
  'pick-move': 'PICK A MOVE',
  'go': 'GO!',
  'raft.hint1': 'Tap arrows to plan. Avoid shark lanes.',
  'raft.hint2': 'Swim off the raft to start!',
  'lane.blast': 'BLAST NEXT ROUND - MOVE OUT!',
  'lane.shark': 'YOUR SPOT IS ON A SHARK LANE',
  'no-target': 'NO TARGET',
  'harpoon': 'HARPOON',
  'chum': 'CHUM',
  'mine': 'MINE',
  'hunted': 'HUNTED',
  'blood': 'BLOOD IN THE WATER',
  'exp': 'EXP',
  'ok': 'OK',
  'notice.mine': 'MINE FOUND - SET IT, THEN ESCAPE',
  'notice.jacket': 'LIFE JACKET - ONE SHARK BITE SAVED',
  'notice.boost': 'SWIM BOOST - 4 MOVES / 5 ROUNDS',
  'notice.barrel': 'YELLOW BARREL - HARPOON A SHARK NEAR YOU',
  'notice.chum': 'CHUM - DROP IT TO LURE THE SHARKS',
  'notice.harpooned': 'HARPOONED! THAT SHARK IS SLOWED',
  'notice.chum-used': 'CHUM IN THE WATER - SWIM AWAY!',
  'notice.jacket-used': 'JACKET SAVED YOU!',
  'notice.blood': 'BLOOD IN THE WATER - THEY ARE COMING',
  'notice.shark-down': 'SHARK DOWN! +75',
  'notice.contract': 'CONTRACT COMPLETE - BONUS SCORED',
  'notice.expedition': 'EXPEDITION COMPLETE - NEW CONTRACTS',
  'boost.status': 'MOVES',
  'rounds': 'ROUNDS',
  'death.mine': 'Caught in a mine blast.',
  'death.bruce': "You stayed on Bruce's line.",
  'death.tiger': 'The Tiger cut you off.',
  'death.wander': 'A wandering shark found you.',
  'death.blasted': 'BLASTED!',
  'death.chomped': 'CHOMPED!',
  'back-to-raft': 'BACK TO RAFT',
  'swim-again': 'SWIM AGAIN',
  'score-saved': 'SCORE SAVED',
  'save-score': 'SAVE SCORE',
  'death.preview': 'Preview only. Score and gear unchanged.',
  'death.kept': 'Score and contracts kept. Gear lost.',
  'lost.title': 'LOST AT SEA',
  'lost.body': 'No multiplayer server.\nRe-enter the scene to retry.',
  'exit': 'EXIT',
  'view-scoreboard': 'View scoreboard',
  'scores.loading': 'Loading scores...',
  'scores.error': 'Scores unavailable',
  'scores.none': 'No saved scores yet',
  'lang.button': 'LANGUAGE: ENGLISH'
}

export function t(key: Key): string {
  return lang() === 'es' ? ES[key] : EN[key]
}
