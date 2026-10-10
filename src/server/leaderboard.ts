import { engine, Entity } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'
import { Storage } from '@dcl/sdk/server'
import { Leaderboard } from '../shared/components'

type Entry = { name: string; score: number }
let entity: Entity
let queue: Promise<void> = Promise.resolve()

async function readBoard(): Promise<Entry[]> {
  const raw = await Storage.get<string>('leaderboard')
  if (!raw) return []
  const data: unknown = JSON.parse(raw)
  if (!Array.isArray(data)) throw new Error('Invalid leaderboard')
  return data.filter((e): e is Entry => !!e && typeof e.name === 'string' && Number.isSafeInteger(e.score) && e.score >= 0)
    .sort((a, b) => b.score - a.score).slice(0, 10)
}

function publish(entries: Entry[]): void {
  Object.assign(Leaderboard.getMutable(entity), { entries, status: 'ready' })
}

function unavailable(error: unknown): void {
  Leaderboard.getMutable(entity).status = 'error'
  console.error('[server] leaderboard unavailable', String(error))
}

export function initLeaderboard(syncId: number): void {
  Leaderboard.validateBeforeChange(({ senderAddress }) => senderAddress === AUTH_SERVER_PEER_ID)
  entity = engine.addEntity()
  Leaderboard.create(entity, { status: 'loading', entries: [] })
  syncEntity(entity, [Leaderboard.componentId], syncId)
  queue = readBoard().then(publish).catch(unavailable)
}

export function saveLeaderboardScore(name: string, score: number): void {
  // Preserve the existing name-based best-score storage format. Serialize reads
  // and writes; a failed read must never erase previously saved scores.
  queue = queue.then(async () => {
    const board = await readBoard()
    const mine = board.find((e) => e.name === name)
    if (mine) mine.score = Math.max(mine.score, score)
    else board.push({ name, score })
    const top = board.sort((a, b) => b.score - a.score).slice(0, 10)
    if (!await Storage.set('leaderboard', JSON.stringify(top))) throw new Error('Save failed')
    publish(top)
  }).catch(unavailable)
}
