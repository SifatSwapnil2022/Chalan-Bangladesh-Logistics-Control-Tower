// Generated once per page load (about 0.2 s). Same seed as the CSV export, so the app, the
// warehouse and the model all describe the same 23,596 shipments.
import { generate } from './generate'
import model from './model.json'
import pipeline from './pipeline.json'

export const ALL = generate()
export const BY_ID = new Map(ALL.map((s) => [s.id, s]))
export const MODEL = model
export const PIPELINE = pipeline
export const riskOf = (id: string) => (MODEL.open as Record<string, number>)[id] ?? null
