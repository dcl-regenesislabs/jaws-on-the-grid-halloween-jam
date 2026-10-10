// Three parallel contracts. Completing all three starts a harder expedition.
// These are gameplay tuning choices, not playtest success criteria.
export function objectives(level: number) {
  return [
    { title: 'SALVAGE RUN', detail: 'Collect coins', target: 5 + level * 3, reward: 100 + level * 50, bit: 1 },
    { title: 'SHARK HUNTER', detail: 'Blast sharks', target: 1 + level, reward: 150 + level * 75, bit: 2 },
    { title: 'DEEP DIVER', detail: 'Reach depth', target: Math.min(8, 2 + level), reward: 125 + level * 50, bit: 4 }
  ]
}

export function objectiveProgress(slot: { coinsCollected: number; sharksKilled: number; deepestTier: number }) {
  return [slot.coinsCollected, slot.sharksKilled, slot.deepestTier + 1]
}
