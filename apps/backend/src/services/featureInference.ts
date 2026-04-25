import type { AudioFeatureWeights } from '../types/profile.js'

type GenreProfile = AudioFeatureWeights

const GENRE_PROFILES: Array<{ keyword: string; profile: GenreProfile }> = [
  { keyword: 'metal',       profile: { energy: 0.92, valence: 0.35, tempo: 0.85, acousticness: 0.04, instrumentalness: 0.25, danceability: 0.35 } },
  { keyword: 'punk',        profile: { energy: 0.88, valence: 0.50, tempo: 0.80, acousticness: 0.05, instrumentalness: 0.05, danceability: 0.55 } },
  { keyword: 'hip hop',     profile: { energy: 0.68, valence: 0.58, tempo: 0.65, acousticness: 0.12, instrumentalness: 0.05, danceability: 0.82 } },
  { keyword: 'rap',         profile: { energy: 0.72, valence: 0.55, tempo: 0.68, acousticness: 0.10, instrumentalness: 0.04, danceability: 0.80 } },
  { keyword: 'electronic',  profile: { energy: 0.78, valence: 0.60, tempo: 0.75, acousticness: 0.06, instrumentalness: 0.60, danceability: 0.80 } },
  { keyword: 'dance',       profile: { energy: 0.82, valence: 0.70, tempo: 0.78, acousticness: 0.05, instrumentalness: 0.20, danceability: 0.88 } },
  { keyword: 'pop',         profile: { energy: 0.65, valence: 0.68, tempo: 0.58, acousticness: 0.18, instrumentalness: 0.04, danceability: 0.72 } },
  { keyword: 'indie',       profile: { energy: 0.55, valence: 0.55, tempo: 0.52, acousticness: 0.35, instrumentalness: 0.12, danceability: 0.58 } },
  { keyword: 'folk',        profile: { energy: 0.38, valence: 0.55, tempo: 0.40, acousticness: 0.72, instrumentalness: 0.10, danceability: 0.45 } },
  { keyword: 'classical',   profile: { energy: 0.28, valence: 0.50, tempo: 0.42, acousticness: 0.88, instrumentalness: 0.88, danceability: 0.25 } },
  { keyword: 'jazz',        profile: { energy: 0.40, valence: 0.60, tempo: 0.48, acousticness: 0.65, instrumentalness: 0.45, danceability: 0.52 } },
  { keyword: 'ambient',     profile: { energy: 0.20, valence: 0.48, tempo: 0.25, acousticness: 0.70, instrumentalness: 0.80, danceability: 0.22 } },
  { keyword: 'rock',        profile: { energy: 0.75, valence: 0.50, tempo: 0.65, acousticness: 0.12, instrumentalness: 0.10, danceability: 0.55 } },
  { keyword: 'soul',        profile: { energy: 0.55, valence: 0.68, tempo: 0.50, acousticness: 0.38, instrumentalness: 0.08, danceability: 0.70 } },
  { keyword: 'r&b',         profile: { energy: 0.60, valence: 0.62, tempo: 0.55, acousticness: 0.25, instrumentalness: 0.06, danceability: 0.75 } },
]

const NEUTRAL: GenreProfile = {
  energy: 0.5,
  valence: 0.5,
  tempo: 0.5,
  acousticness: 0.5,
  instrumentalness: 0.5,
  danceability: 0.5,
}

export const inferFeaturesFromGenres = (genres: string[]): AudioFeatureWeights => {
  const lowercased = genres.map(genre => genre.toLowerCase())

  const matched = GENRE_PROFILES.filter(entry =>
    lowercased.some(genre => genre.includes(entry.keyword))
  )

  if (matched.length === 0) return NEUTRAL

  const sum = matched.reduce(
    (acc, entry) => ({
      energy:           acc.energy           + entry.profile.energy,
      valence:          acc.valence           + entry.profile.valence,
      tempo:            acc.tempo             + entry.profile.tempo,
      acousticness:     acc.acousticness      + entry.profile.acousticness,
      instrumentalness: acc.instrumentalness  + entry.profile.instrumentalness,
      danceability:     acc.danceability      + entry.profile.danceability,
    }),
    { energy: 0, valence: 0, tempo: 0, acousticness: 0, instrumentalness: 0, danceability: 0 },
  )

  const count = matched.length
  return {
    energy:           sum.energy           / count,
    valence:          sum.valence           / count,
    tempo:            sum.tempo             / count,
    acousticness:     sum.acousticness      / count,
    instrumentalness: sum.instrumentalness  / count,
    danceability:     sum.danceability      / count,
  }
}
