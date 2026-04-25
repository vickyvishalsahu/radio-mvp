import { describe, it, expect } from 'vitest'
import { _parseResponse } from './llm'

describe('_parseResponse', () => {
  it('parses a valid JSON array', () => {
    const input = '[{"artist":"Radiohead","title":"Creep"}]'
    expect(_parseResponse(input)).toEqual([{ artist: 'Radiohead', title: 'Creep' }])
  })

  it('strips markdown code fences and parses', () => {
    const input = '```json\n[{"artist":"Bjork","title":"Jóga"}]\n```'
    expect(_parseResponse(input)).toEqual([{ artist: 'Bjork', title: 'Jóga' }])
  })

  it('strips code fences without language label', () => {
    const input = '```\n[{"artist":"Nick Drake","title":"Pink Moon"}]\n```'
    expect(_parseResponse(input)).toEqual([{ artist: 'Nick Drake', title: 'Pink Moon' }])
  })

  it('returns empty array for malformed JSON', () => {
    expect(_parseResponse('not json at all')).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(_parseResponse('')).toEqual([])
  })

  it('returns empty array when result is not an array', () => {
    expect(_parseResponse('{"artist":"Radiohead","title":"Creep"}')).toEqual([])
  })

  it('filters out items missing artist field', () => {
    const input = '[{"title":"Creep"},{"artist":"Radiohead","title":"Karma Police"}]'
    expect(_parseResponse(input)).toEqual([{ artist: 'Radiohead', title: 'Karma Police' }])
  })

  it('filters out items missing title field', () => {
    const input = '[{"artist":"Radiohead"},{"artist":"Bjork","title":"Hyperballad"}]'
    expect(_parseResponse(input)).toEqual([{ artist: 'Bjork', title: 'Hyperballad' }])
  })

  it('returns multiple valid tracks', () => {
    const input = '[{"artist":"A","title":"1"},{"artist":"B","title":"2"},{"artist":"C","title":"3"}]'
    expect(_parseResponse(input)).toHaveLength(3)
  })

  it('returns empty array when no items pass the field filter', () => {
    const input = '[{"name":"wrong"},{"foo":"bar"}]'
    expect(_parseResponse(input)).toEqual([])
  })
})
