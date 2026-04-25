import type { Redis } from 'ioredis'
import type { RawContext, ContextVector, FeatureRange } from '../types/context.js'

type TimeSlot = ContextVector['timeSlot']
type MovementState = ContextVector['movementState']
type WeatherMood = ContextVector['weatherMood']
type Season = ContextVector['season']
type DayType = ContextVector['dayType']
type TargetFeatures = ContextVector['targetFeatures']

const POSITIVE_WORDS = [
  'good', 'great', 'win', 'victory', 'peace', 'hope', 'growth', 'success',
  'positive', 'strong', 'recovery', 'boost', 'rise', 'improve', 'celebrate',
  'record', 'breakthrough', 'save', 'help', 'advance',
]

const NEGATIVE_WORDS = [
  'crash', 'death', 'kill', 'war', 'crisis', 'attack', 'terror', 'disaster',
  'collapse', 'fail', 'loss', 'violence', 'threat', 'fear', 'damage',
  'danger', 'toxic', 'bomb', 'murder', 'tragedy',
]

// WMO weather codes → weatherMood
const WMO_TO_MOOD: Record<number, WeatherMood> = {
  0: 'bright', 1: 'bright',
  2: 'overcast', 3: 'overcast', 45: 'overcast', 48: 'overcast',
  51: 'rain', 53: 'rain', 55: 'rain', 56: 'rain', 57: 'rain',
  61: 'rain', 63: 'rain', 65: 'rain', 66: 'rain', 67: 'rain',
  80: 'rain', 81: 'rain', 82: 'rain',
  71: 'snow', 73: 'snow', 75: 'snow', 77: 'snow', 85: 'snow', 86: 'snow',
  95: 'storm', 96: 'storm', 99: 'storm',
}

// Base target features per time slot. Unspecified features default to full range.
// Priority order: timeSlot → movementState → weatherMood → dayType
const BASE_FEATURES: Record<TimeSlot, Partial<TargetFeatures>> = {
  early_morning: { energy: [0.1, 0.4], valence: [0.3, 0.6], tempo: [60, 90], acousticness: [0.5, 1.0], instrumentalness: [0.3, 0.8] },
  morning:       { energy: [0.3, 0.6], valence: [0.4, 0.7], tempo: [80, 110] },
  afternoon:     { energy: [0.5, 0.8], valence: [0.5, 0.8], tempo: [95, 130] },
  evening:       { energy: [0.4, 0.7], valence: [0.4, 0.7], tempo: [85, 115] },
  night:         { energy: [0.2, 0.5], valence: [0.3, 0.6], tempo: [65, 95] },
  late_night:    { energy: [0.1, 0.3], valence: [0.2, 0.5], tempo: [55, 85], acousticness: [0.6, 1.0] },
}

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val))

const clampFeature = (range: FeatureRange): FeatureRange => [
  clamp(range[0], 0, 1),
  clamp(range[1], 0, 1),
]

const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

const getTimeSlot = (date: Date): TimeSlot => {
  const h = date.getHours()
  if (h < 5) return 'late_night'
  if (h < 8) return 'early_morning'
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  if (h < 21) return 'evening'
  return 'night'
}

const getDayType = (date: Date): DayType => {
  const day = date.getDay()
  return day === 0 || day === 6 ? 'weekend' : 'weekday'
}

const getSeason = (date: Date): Season => {
  const m = date.getMonth() + 1
  if (m >= 3 && m <= 5) return 'spring'
  if (m >= 6 && m <= 8) return 'summer'
  if (m >= 9 && m <= 11) return 'autumn'
  return 'winter'
}

const getMovementState = (movementBpm: number | null, deviceType: RawContext['deviceType']): MovementState => {
  if (deviceType === 'desktop') return 'still'
  if (movementBpm === null || movementBpm < 20) return 'still'
  if (movementBpm <= 100) return 'walking'
  return 'running'
}

const buildTargetFeatures = (
  timeSlot: TimeSlot,
  movementState: MovementState,
  weatherMood: WeatherMood,
  dayType: DayType,
): TargetFeatures => {
  const features: TargetFeatures = {
    energy:           [0.0, 1.0],
    valence:          [0.0, 1.0],
    tempo:            [60, 200],
    acousticness:     [0.0, 1.0],
    instrumentalness: [0.0, 1.0],
    danceability:     [0.0, 1.0],
  }

  // Priority 1: timeSlot base
  Object.assign(features, BASE_FEATURES[timeSlot])

  // Priority 2: movement overrides/adjustments
  if (movementState === 'running') {
    features.energy = [0.7, 1.0]
    features.tempo = [140, 180]
  } else if (movementState === 'walking') {
    features.energy = [clamp(features.energy[0] + 0.1, 0, 1), features.energy[1]]
  }

  // Priority 3: weather adjustments
  if (weatherMood === 'rain') {
    features.valence = [features.valence[0], clamp(features.valence[1] - 0.15, 0, 1)]
  } else if (weatherMood === 'storm') {
    features.energy = [clamp(features.energy[0] - 0.1, 0, 1), clamp(features.energy[1] - 0.1, 0, 1)]
    features.valence = [clamp(features.valence[0] - 0.2, 0, 1), clamp(features.valence[1] - 0.2, 0, 1)]
  }

  // Priority 4: day type adjustments
  if (dayType === 'weekend') {
    features.valence = [clamp(features.valence[0] + 0.1, 0, 1), features.valence[1]]
    features.danceability = [clamp(features.danceability[0] + 0.1, 0, 1), features.danceability[1]]
  }

  return {
    energy:           clampFeature(features.energy),
    valence:          clampFeature(features.valence),
    tempo:            features.tempo, // BPM — not clamped to [0,1]
    acousticness:     clampFeature(features.acousticness),
    instrumentalness: clampFeature(features.instrumentalness),
    danceability:     clampFeature(features.danceability),
  }
}

const fetchWeatherMood = async (lat: number, lng: number, redis: Redis): Promise<WeatherMood> => {
  const latKey = lat.toFixed(1)
  const lngKey = lng.toFixed(1)
  const cacheKey = `weather:${latKey}:${lngKey}`

  const cached = await redis.get(cacheKey)
  if (cached) return cached as WeatherMood

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=weather_code`
    console.log(`[weather] cache miss — fetching Open-Meteo for ${latKey},${lngKey}`)
    const res = await fetch(url)
    if (!res.ok) return 'unknown'

    const data = await res.json() as { current?: { weather_code?: number } }
    const code = data.current?.weather_code ?? -1
    const mood: WeatherMood = WMO_TO_MOOD[code] ?? 'unknown'

    await redis.set(cacheKey, mood, 'EX', 1800)
    return mood
  } catch {
    return 'unknown'
  }
}

const checkLocationIsNew = async (lat: number, lng: number, userId: string, redis: Redis): Promise<boolean> => {
  const key = `user:${userId}:lastLocation`
  const stored = await redis.get(key)

  let isNew = false
  if (stored) {
    const last = JSON.parse(stored) as { lat: number; lng: number }
    isNew = haversineKm(lat, lng, last.lat, last.lng) > 2
  }

  await redis.set(key, JSON.stringify({ lat, lng }), 'EX', 86400)
  return isNew
}

const fetchNewsSentiment = async (redis: Redis): Promise<number> => {
  const newsApiKey = process.env.NEWS_API_KEY
  if (!newsApiKey) return 0

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const cacheKey = `news:sentiment:${today}`

  const cached = await redis.get(cacheKey)
  if (cached) return parseFloat(cached)

  try {
    const res = await fetch(`https://newsapi.org/v2/top-headlines?country=us&apiKey=${newsApiKey}`)
    if (!res.ok) return 0

    const data = await res.json() as { articles?: Array<{ title?: string }> }
    const text = (data.articles ?? [])
      .slice(0, 5)
      .map(a => a.title ?? '')
      .join(' ')
      .toLowerCase()

    const posHits = POSITIVE_WORDS.filter(w => text.includes(w)).length
    const negHits = NEGATIVE_WORDS.filter(w => text.includes(w)).length
    const score = clamp((posHits - negHits) / (posHits + negHits + 1), -1, 1)

    await redis.set(cacheKey, score.toString(), 'EX', 21600)
    return score
  } catch {
    return 0
  }
}

export const buildContextVector = async (
  raw: RawContext,
  userId: string,
  redis: Redis,
): Promise<ContextVector> => {
  const date = new Date(raw.localTimestamp)
  const timeSlot = getTimeSlot(date)
  const dayType = getDayType(date)
  const season = getSeason(date)
  const movementState = getMovementState(raw.movementBpm, raw.deviceType)

  const [weatherMood, locationIsNew, newsSentiment] = await Promise.all([
    fetchWeatherMood(raw.lat, raw.lng, redis),
    checkLocationIsNew(raw.lat, raw.lng, userId, redis),
    fetchNewsSentiment(redis),
  ])

  const targetFeatures = buildTargetFeatures(timeSlot, movementState, weatherMood, dayType)

  let discoveryWeight = 0.3
  if (locationIsNew) discoveryWeight += 0.2
  if (timeSlot === 'late_night' || timeSlot === 'early_morning') discoveryWeight -= 0.1
  discoveryWeight = clamp(discoveryWeight, 0.1, 0.8)

  return {
    timeSlot,
    dayType,
    season,
    movementState,
    weatherMood,
    newsSentiment,
    targetFeatures,
    discoveryWeight,
    locationIsNew,
    rawSignals: {
      lat: raw.lat,
      lng: raw.lng,
      movementBpm: raw.movementBpm,
      deviceType: raw.deviceType,
      headphonesConnected: raw.headphonesConnected,
      localTimestamp: raw.localTimestamp,
    },
  }
}
