/*
 * [INPUT]: One validated PPTX revision, matching rendered PNG bytes, and an explicitly selected vision caller.
 * [OUTPUT]: Alma's six-slide/one-overlap production review with exact coverage, conservative score merging and source hashes.
 * [POS]: Dedicated visual review, separate from the employee chat model; no fallback or implicit model request.
 * [PROTOCOL]: Update Header and presentations/.folder.md when changed.
 */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { PresentationSpec } from './alma/model.mjs'
import { reviewPrompt } from './alma/review-prompt.mjs'
import { materialImageMimeType } from '../materials/material-files'

const category = z.enum(['clipping', 'overlap', 'legibility', 'hierarchy', 'contrast', 'repetition', 'composition', 'consistency', 'factual-risk', 'rendering-artifact', 'review-integrity'])
const issue = z.object({ severity: z.enum(['blocker', 'major', 'minor']), category, description: z.string().min(1), suggestedRepair: z.string().min(1), elementIds: z.array(z.string()).default([]) })
const slideReview = z.object({ slideId: z.string().min(1), score: z.number().int().min(0).max(100), issues: z.array(issue).default([]), strengths: z.array(z.string()).max(3).default([]) })
const deckIssue = issue.omit({ elementIds: true }).extend({ slideIds: z.array(z.string()).min(1) })
const response = z.object({ slides: z.array(slideReview), deckIssues: z.array(deckIssue).default([]) })
type SlideReview = z.infer<typeof slideReview>
export interface RenderedSlide { slideId: string; bytes: Uint8Array; sha256: string }
export interface VisionReviewer {
  /** Host-selected identity/version. Never supplied by the employee model. */
  model: string
  selectionId: string
  verify(): Promise<void>
  generate(input: { prompt: string; images: RenderedSlide[]; signal?: AbortSignal }): Promise<{ text: string; requestId: string }>
}
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const integrity = (description: string): z.infer<typeof issue> => ({ severity: 'blocker', category: 'review-integrity', description, suggestedRepair: 'Review every requested slide exactly once with its matching slide and element IDs.', elementIds: [] })
function parse(text: string) {
  const json = text.match(/^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i)?.[1] ?? text
  return response.parse(JSON.parse(json))
}

export async function reviewSlides(spec: PresentationSpec, fileHash: string, images: RenderedSlide[], reviewer: VisionReviewer | undefined, signal?: AbortSignal) {
  if (!reviewer) throw new Error('Presentation review requires a configured dedicated vision model; no chat-model fallback')
  if (!spec.slides.length || images.length !== spec.slides.length) throw new Error('Visual review requires one rendered PNG per slide')
  for (const [index, image] of images.entries()) {
    if (image.slideId !== spec.slides[index].id || image.sha256 !== sha(image.bytes)) throw new Error('Rendered slide identity or hash mismatch')
    if (image.bytes.byteLength > 20 * 1024 * 1024 || materialImageMimeType(Buffer.from(image.bytes)) !== 'image/png') throw new Error('Visual review requires actual PNG bytes, at most 20 MiB per slide')
  }
  const reviews = new Map<string, SlideReview>(), deckIssues: z.infer<typeof deckIssue>[] = [], requests: string[] = []
  for (let start = 0; start < images.length; start += 5) {
    signal?.throwIfAborted(); await reviewer.verify()
    const batch = images.slice(start, start + 6), slides = spec.slides.slice(start, start + 6)
    const result = await reviewer.generate({ prompt: reviewPrompt(spec, slides), images: batch, signal })
    signal?.throwIfAborted(); await reviewer.verify()
    if (!result.requestId) throw new Error('Visual review did not return a model-call receipt')
    requests.push(result.requestId)
    const parsed = parse(result.text), expected = new Set(batch.map(image => image.slideId))
    const unexpected = parsed.slides.some(item => !expected.has(item.slideId))
    for (const slide of slides) {
      const matches = parsed.slides.filter(item => item.slideId === slide.id)
      const value: SlideReview = matches.length === 1 ? matches[0] : { slideId: slide.id, score: 0, strengths: [], issues: [integrity(matches.length ? 'The reviewer returned this slide more than once.' : 'The reviewer omitted this slide.')] }
      if (unexpected) value.issues.push(integrity('The reviewer returned an unrequested slide.'))
      const elements = new Set(slide.elements.map(element => element.id))
      if (value.issues.some(item => item.elementIds.some(id => !elements.has(id)))) value.issues.push(integrity('The reviewer cited an element absent from this slide.'))
      const previous = reviews.get(slide.id)
      reviews.set(slide.id, previous ? { slideId: slide.id, score: Math.min(previous.score, value.score), strengths: [...new Set([...previous.strengths, ...value.strengths])].slice(0, 3), issues: [...new Map([...previous.issues, ...value.issues].map(item => [JSON.stringify(item), item])).values()] } : value)
    }
    for (const item of parsed.deckIssues) {
      if (item.slideIds.some(id => !expected.has(id))) deckIssues.push({ ...integrity('The reviewer cited an unrequested slide in a deck issue.'), slideIds: [...expected] })
      else deckIssues.push(item)
    }
    if (start + 6 >= images.length) break
  }
  const slides = spec.slides.map(slide => {
    const value = reviews.get(slide.id)!
    return { ...value, passed: value.score >= 85 && value.issues.every(item => item.severity === 'minor') }
  })
  return { passed: slides.every(slide => slide.passed) && deckIssues.every(item => item.severity === 'minor'), passingScore: 85, model: reviewer.model, selectionId: reviewer.selectionId, reviewedRevision: spec.revision, fileHash, images: images.map(({ slideId, sha256 }) => ({ slideId, sha256 })), requests, slides, deckIssues }
}
