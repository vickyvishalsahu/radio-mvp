import type { CandidateTrack } from '../types/profile.js'
import type { ContextVector } from '../types/context.js'
import type { TasteProfile } from '../types/profile.js'
import type { SessionState, ContinuityHint } from '../types/session.js'

// Weighted random selection — index 0 = highest score gets weight 30
const PICK_WEIGHTS = [30, 20, 15, 12, 10, 7, 4, 2]

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val))

const cosineSimilarity = (a: number[], b: number[]): number => {
  const dot = a.reduce((sum, ai, i) => sum + ai * (b[i] ?? 0), 0)
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0))
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0))
  if (magA === 0 || magB === 0) return 0
  return dot / (magA * magB)
}

const weightedPick = <T>(items: T[], weights: number[]): T => {
  const total = weights.slice(0, items.length).reduce((a, b) => a + b, 0)
  let rand = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    rand -= weights[i] ?? 0
    if (rand <= 0) return items[i]!
  }
  return items[0]!
}

const scoreTrack = (
  track: CandidateTrack,
  cv: ContextVector,
  profile: TasteProfile,
  session: SessionState,
): number => {
  const tf = cv.targetFeatures
  const f = track.features

  // a) Feature distance score (0–40)
  const features: Array<{ val: number; min: number; max: number }> = [
    { val: f.energy,           min: tf.energy[0],           max: tf.energy[1] },
    { val: f.valence,          min: tf.valence[0],          max: tf.valence[1] },
    { val: f.tempo / 200,      min: tf.tempo[0] / 200,      max: tf.tempo[1] / 200 },
    { val: f.acousticness,     min: tf.acousticness[0],     max: tf.acousticness[1] },
    { val: f.instrumentalness, min: tf.instrumentalness[0], max: tf.instrumentalness[1] },
    { val: f.danceability,     min: tf.danceability[0],     max: tf.danceability[1] },
  ]
  const distanceScore = features.reduce((sum, { val, min, max }) => {
    const midpoint = (min + max) / 2
    const rangeWidth = Math.max(max - min, 0.01)
    return sum + clamp(1 - Math.abs(val - midpoint) / rangeWidth, 0, 1)
  }, 0) / features.length * 40

  // b) Profile affinity score (0–25) — cosine similarity with learned weights
  const w = profile.audioFeatureWeights
  const trackVec = [f.energy, f.valence, f.tempo / 200, f.acousticness, f.instrumentalness, f.danceability]
  const profileVec = [w.energy, w.valence, w.tempo, w.acousticness, w.instrumentalness, w.danceability]
  const affinityScore = ((cosineSimilarity(trackVec, profileVec) + 1) / 2) * 25

  // c) Library bonus (0–10)
  const libraryBonus = track.isInLibrary ? 10 : 0

  // d) Freshness bonus (0–10)
  const recentIdx = session.recentTracks.findIndex(r => r.trackId === track.trackId)
  const freshnessBonus = recentIdx === -1 ? 10 : recentIdx > 3 ? 5 : 0

  // e) Artist diversity penalty (-15)
  const lastTwo = session.recentTracks.slice(0, 2).map(r => r.artistId)
  const diversityPenalty = lastTwo.includes(track.artistId) ? -15 : 0

  // f) Energy arc nudge (±10)
  let energyNudge = 0
  if (session.energyTrajectory.length > 0) {
    const avgEnergy = session.energyTrajectory.reduce((a, b) => a + b, 0) / session.energyTrajectory.length
    if (avgEnergy > 0.75 && f.energy > 0.75) energyNudge = -10
    else if (avgEnergy < 0.35 && f.energy < 0.35) energyNudge = -10
  }

  const base = distanceScore + affinityScore + libraryBonus + freshnessBonus + diversityPenalty + energyNudge

  // g) Discovery weight modifier for recommendation tracks
  if (track.source === 'recommendation') {
    return base * (0.7 + cv.discoveryWeight * 0.6)
  }

  return base
}

// Pure function — no I/O, no async. All data passed in.
export const scoreAndPick = (
  pool: CandidateTrack[],
  cv: ContextVector,
  profile: TasteProfile,
  session: SessionState,
  continuityHint: ContinuityHint | null,
): CandidateTrack => {
  if (continuityHint) {
    const hint = pool.find(t => t.trackId === continuityHint.trackId)
    if (hint) return hint
  }

  const scored = pool
    .map(track => ({ track, score: scoreTrack(track, cv, profile, session) }))
    .sort((a, b) => b.score - a.score)

  const top = scored.slice(0, Math.min(8, scored.length)).map(s => s.track)
  return weightedPick(top, PICK_WEIGHTS)
}
