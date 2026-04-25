import Anthropic from '@anthropic-ai/sdk'
import { buildRecommendationPrompt } from './promptBuilder.js'
import type { MusicIntelligence, TrackIdentity } from './types.js'
import type { ContextVector } from '../types/context.js'
import type { TasteProfile } from '../types/profile.js'

const client = new Anthropic() // reads ANTHROPIC_API_KEY from env

export const _parseResponse = (text: string): TrackIdentity[] => {
  // Strip markdown code fences if present
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item) => typeof item?.artist === 'string' && typeof item?.title === 'string'
    )
  } catch {
    return []
  }
}

export const createLlmIntelligence = (): MusicIntelligence => ({
  async recommend(context: ContextVector, profile: TasteProfile) {
    const prompt = buildRecommendationPrompt(context, profile)

    let text: string
    try {
      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })
      const block = message.content[0]
      text = block?.type === 'text' ? block.text : ''
    } catch (err) {
      console.error('[intelligence] LLM call failed:', err)
      return []
    }

    const tracks = _parseResponse(text)

    // Retry once with a simpler prompt if we got fewer than 5 valid tracks
    if (tracks.length < 5) {
      console.warn(`[intelligence] got ${tracks.length} tracks on first attempt — retrying`)
      try {
        const retry = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [
            { role: 'user', content: prompt },
            { role: 'assistant', content: text },
            { role: 'user', content: 'Please return only the JSON array, no other text.' },
          ],
        })
        const retryBlock = retry.content[0]
        const retryText = retryBlock?.type === 'text' ? retryBlock.text : ''
        return _parseResponse(retryText)
      } catch {
        return tracks // return whatever we got
      }
    }

    return tracks
  },
})
