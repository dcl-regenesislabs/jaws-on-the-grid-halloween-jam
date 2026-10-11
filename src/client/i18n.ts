import { getPlayerLanguage } from '@dcl/sdk/platform'

// English / Spanish / Portuguese. The default follows the phone's language
// (getPlayerLanguage(), a BCP-47 tag that also tracks mid-session changes);
// the raft button overrides it for this session.
export type Lang = 'en' | 'es' | 'pt'

let override: Lang | null = null

export function lang(): Lang {
  if (override) return override
  const tag = getPlayerLanguage().toLowerCase()
  return tag.startsWith('es') ? 'es' : tag.startsWith('pt') ? 'pt' : 'en'
}

export function setLang(next: Lang) {
  override = next
}

const ES = {
  'raft': 'BALSA',
  'depth': 'PROF.',
  'pick-move': 'TU TURNO',
  'go': '¡YA!',
  'raft.hint1': 'Toca flechas. Evita carriles de tiburón.',
  'raft.hint2': '¡Nada fuera de la balsa para empezar!',
  'lane.blast': '¡EXPLOSIÓN PRÓXIMA! ¡SAL!',
  'lane.shark': 'TU CASILLA: CARRIL DE TIBURÓN',
  'no-target': 'SIN OBJETIVO',
  'harpoon': 'ARPÓN',
  'chum': 'CEBO',
  'mine': 'MINA',
  'hunted': 'CAZADO',
  'blood': 'SANGRE EN EL AGUA',
  'exp': 'EXP',
  'ok': 'OK',
  'notice.mine': 'MINA ENCONTRADA - PONLA Y ESCAPA',
  'notice.jacket': 'CHALECO - TE SALVA DE UNA MORDIDA',
  'notice.boost': 'IMPULSO - 4 MOVIMIENTOS / 5 RONDAS',
  'notice.barrel': 'BARRIL AMARILLO - ARPONEA UN TIBURÓN',
  'notice.chum': 'CEBO - SUÉLTALO PARA ATRAER TIBURONES',
  'notice.harpooned': '¡ARPONEADO! ESE TIBURÓN VA MÁS LENTO',
  'notice.chum-used': 'CEBO EN EL AGUA - ¡ALÉJATE NADANDO!',
  'notice.jacket-used': '¡EL CHALECO TE SALVÓ!',
  'notice.blood': 'SANGRE EN EL AGUA - ¡VIENEN!',
  'notice.shark-down': '¡TIBURÓN ABATIDO! +75',
  'notice.contract': 'CONTRATO COMPLETO - BONO SUMADO',
  'notice.expedition': 'EXPEDICIÓN COMPLETA - NUEVOS CONTRATOS',
  'boost.status': 'MOV',
  'rounds': 'RONDAS',
  'death.mine': 'Te alcanzó una explosión.',
  'death.bruce': 'Te quedaste en el carril de Bruce.',
  'death.tiger': 'El Tigre te cortó el paso.',
  'death.wander': 'Un tiburón errante te encontró.',
  'death.blasted': '¡VOLADO!',
  'death.chomped': '¡MORDIDO!',
  'back-to-raft': 'A LA BALSA',
  'swim-again': 'NADAR OTRA VEZ',
  'score-saved': 'PUNTAJE GUARDADO',
  'save-score': 'GUARDAR PUNTAJE',
  'death.preview': 'Vista previa. Puntaje y equipo intactos.',
  'death.kept': 'Puntaje y contratos intactos. Sin equipo.',
  'lost.title': 'A LA DERIVA',
  'lost.body': 'No hay servidor multijugador.\nVuelve a entrar para reintentar.',
  'exit': 'SALIR',
  'view-scoreboard': 'Ver tabla de puntajes',
  'scores.loading': 'Cargando puntajes...',
  'scores.error': 'Puntajes no disponibles',
  'scores.none': 'Aún no hay puntajes guardados'
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
  'scores.none': 'No saved scores yet'
}

const PT: Record<Key, string> = {
  'raft': 'BALSA',
  'depth': 'PROF.',
  'pick-move': 'SUA VEZ',
  'go': 'VAI!',
  'raft.hint1': 'Toque nas setas. Evite rotas de tubarão.',
  'raft.hint2': 'Nade para fora da balsa e comece!',
  'lane.blast': 'EXPLOSÃO NA RODADA! SAIA!',
  'lane.shark': 'SEU LUGAR: ROTA DE TUBARÃO',
  'no-target': 'SEM ALVO',
  'harpoon': 'ARPÃO',
  'chum': 'ISCA',
  'mine': 'MINA',
  'hunted': 'CAÇADO',
  'blood': 'SANGUE NA ÁGUA',
  'exp': 'EXP',
  'ok': 'OK',
  'notice.mine': 'MINA ACHADA - POSICIONE E FUJA',
  'notice.jacket': 'COLETE - SALVA DE UMA MORDIDA',
  'notice.boost': 'IMPULSO - 4 MOVIMENTOS / 5 RODADAS',
  'notice.barrel': 'BARRIL AMARELO - ARPOE UM TUBARÃO',
  'notice.chum': 'ISCA - SOLTE PARA ATRAIR TUBARÕES',
  'notice.harpooned': 'ARPOADO! O TUBARÃO FICOU MAIS LENTO',
  'notice.chum-used': 'ISCA NA ÁGUA - NADE PARA LONGE!',
  'notice.jacket-used': 'O COLETE SALVOU VOCÊ!',
  'notice.blood': 'SANGUE NA ÁGUA - ELES VÊM AÍ!',
  'notice.shark-down': 'TUBARÃO ABATIDO! +75',
  'notice.contract': 'CONTRATO COMPLETO - BÔNUS GANHO',
  'notice.expedition': 'EXPEDIÇÃO COMPLETA - NOVOS CONTRATOS',
  'boost.status': 'MOV',
  'rounds': 'RODADAS',
  'death.mine': 'Pegou a explosão de uma mina.',
  'death.bruce': 'Você ficou na rota do Bruce.',
  'death.tiger': 'O Tigre cortou seu caminho.',
  'death.wander': 'Um tubarão errante te achou.',
  'death.blasted': 'EXPLODIDO!',
  'death.chomped': 'MORDIDO!',
  'back-to-raft': 'À BALSA',
  'swim-again': 'NADAR DE NOVO',
  'score-saved': 'PONTOS SALVOS',
  'save-score': 'SALVAR PONTOS',
  'death.preview': 'Prévia. Pontos e equipamento intactos.',
  'death.kept': 'Pontos e contratos mantidos. Sem itens.',
  'lost.title': 'À DERIVA',
  'lost.body': 'Sem servidor multijogador.\nEntre de novo para tentar.',
  'exit': 'SAIR',
  'view-scoreboard': 'Ver placar',
  'scores.loading': 'Carregando pontos...',
  'scores.error': 'Pontos indisponíveis',
  'scores.none': 'Ainda sem pontos salvos'
}

const DICT: Record<Lang, Record<Key, string>> = { en: EN, es: ES, pt: PT }

export function t(key: Key): string {
  return DICT[lang()][key]
}
