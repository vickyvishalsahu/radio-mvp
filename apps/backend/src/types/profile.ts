export type AudioFeatureWeights = {
  energy: number
  valence: number
  tempo: number          // normalized 0–1 (divide raw BPM by 200)
  acousticness: number
  instrumentalness: number
  danceability: number
}

export type TasteProfile = {
  userId: string
  topArtistIds: string[]
  topGenres: string[]
  audioFeatureWeights: AudioFeatureWeights
  recentTrackIds: string[]   // last 50 from Spotify
  radioTrackIds: string[]    // played by Radio (from PlayEvent)
  updatedAt: Date
}

export type TrackFeatures = {
  energy: number
  valence: number
  tempo: number
  acousticness: number
  instrumentalness: number
  danceability: number
  loudness: number
}

export type CandidateTrack = {
  trackId: string
  trackName: string
  artistId: string
  artistName: string
  albumId: string
  albumName: string
  albumArtUrl: string
  durationMs: number
  previewUrl: string | null
  features: TrackFeatures
  popularity: number
  isInLibrary: boolean
  source: 'library' | 'recommendation' | 'trending'
  hasRealFeatures?: boolean
}
