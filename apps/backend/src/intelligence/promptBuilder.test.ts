import { describe, it, expect } from 'vitest'
import { buildRecommendationPrompt } from './promptBuilder'
import type { ContextVector } from '../types/context'
import type { TasteProfile } from '../types/profile'

const makeContext = (overrides: Partial<ContextVector> = {}): ContextVector => ({
  timeSlot: 'morning',
  dayType: 'weekday',
  season: 'autumn',
  movementState: 'still',
  weatherMood: 'rain',
  newsSentiment: 0.5,
  locationIsNew: false,
  discoveryWeight: 0.5,
  rawSignals: {},
  targetFeatures: {
    energy:           [0.2, 0.4],
    valence:          [0.2, 0.4],
    tempo:            [60,  90],
    acousticness:     [0.7, 1.0],
    instrumentalness: [0.4, 0.8],
    danceability:     [0.2, 0.5],
  },
  ...overrides,
})

const makeProfile = (overrides: Partial<TasteProfile> = {}): TasteProfile => ({
  userId: 'user-1',
  topArtistIds: ['id1', 'id2'],
  topGenres: ['indie', 'folk'],
  audioFeatureWeights: { energy: 0.4, valence: 0.5, tempo: 0.5, acousticness: 0.7, instrumentalness: 0.3, danceability: 0.4 },
  recentTrackIds: [],
  radioTrackIds: [],
  updatedAt: new Date(),
  ...overrides,
})

describe('buildRecommendationPrompt', () => {
  it('labels low energy as "calm and quiet"', () => {
    // midpoint = 0.15 → clearly ≤ 0.3
    const cv = makeContext({ targetFeatures: { ...makeContext().targetFeatures, energy: [0.1, 0.2] } })
    const prompt = buildRecommendationPrompt(cv, makeProfile())
    expect(prompt).toContain('calm and quiet')
  })

  it('labels high energy as "intense and driving"', () => {
    // midpoint = 0.9 → clearly > 0.8
    const cv = makeContext({ targetFeatures: { ...makeContext().targetFeatures, energy: [0.85, 0.95] } })
    const prompt = buildRecommendationPrompt(cv, makeProfile())
    expect(prompt).toContain('intense and driving')
  })

  it('labels low valence as "melancholic and dark"', () => {
    // midpoint = 0.15 → clearly ≤ 0.3
    const cv = makeContext({ targetFeatures: { ...makeContext().targetFeatures, valence: [0.1, 0.2] } })
    const prompt = buildRecommendationPrompt(cv, makeProfile())
    expect(prompt).toContain('melancholic and dark')
  })

  it('labels high valence as "euphoric and uplifting"', () => {
    // midpoint = 0.925 → clearly > 0.8
    const cv = makeContext({ targetFeatures: { ...makeContext().targetFeatures, valence: [0.9, 0.95] } })
    const prompt = buildRecommendationPrompt(cv, makeProfile())
    expect(prompt).toContain('euphoric and uplifting')
  })

  it('includes top genres from profile', () => {
    const profile = makeProfile({ topGenres: ['post-rock', 'ambient'] })
    const prompt = buildRecommendationPrompt(makeContext(), profile)
    expect(prompt).toContain('post-rock')
    expect(prompt).toContain('ambient')
  })

  it('sanitizes double quotes in genre names', () => {
    const profile = makeProfile({ topGenres: ['"weird genre"'] })
    const prompt = buildRecommendationPrompt(makeContext(), profile)
    expect(prompt).not.toContain('"weird genre"')
    expect(prompt).toContain("'weird genre'")
  })

  it('ends with the JSON instruction', () => {
    const prompt = buildRecommendationPrompt(makeContext(), makeProfile())
    expect(prompt).toContain('Return ONLY a JSON array')
    expect(prompt).toContain('"artist"')
    expect(prompt).toContain('"title"')
  })

  it('includes the time slot and weather in the prompt', () => {
    const cv = makeContext({ timeSlot: 'late_night', weatherMood: 'storm' })
    const prompt = buildRecommendationPrompt(cv, makeProfile())
    expect(prompt).toContain('late night')
    expect(prompt).toContain('storm')
  })
})
