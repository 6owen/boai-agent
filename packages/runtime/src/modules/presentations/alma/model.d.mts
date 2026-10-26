/*
 * [INPUT]: Fixed migrated Zod model and layout catalogue.
 * [OUTPUT]: Typed host boundary; runtime validation remains the original complete schema.
 * [POS]: Declaration companion for model.mjs, not a second validation implementation.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import type { ZodType } from 'zod'
export interface SlideElement extends Record<string, unknown> { id: string; type: string; x: number; y: number; w: number; h: number; zIndex: number; animations: unknown[]; path?: string }
export interface PresentationSlide extends Record<string, unknown> { id: string; role: string; layoutKey: string; elements: SlideElement[]; speakerNotes?: string }
export interface PresentationSpec extends Record<string, unknown> {
  version: 1; revision: number; id: string; title: string; author: string
  layout: 'wide' | 'standard'; outputPath: string; assetBasePath: string
  theme: Record<string, unknown>; story: Record<string, unknown>; design: Record<string, unknown>
  slides: PresentationSlide[]; createdAt: string; updatedAt: string
}
export interface ValidationIssue { severity: 'error' | 'warning'; code: string; message: string; slideId?: string; elementId?: string }
export const p: ZodType<PresentationSpec>
export const b: ZodType<PresentationSlide>
export const a: ZodType<Record<string, unknown>>
export const d: ZodType<Record<string, unknown>>
export const s: ZodType<Record<string, unknown>>
export function v(spec: PresentationSpec): { valid: boolean; errors: ValidationIssue[]; warnings: ValidationIssue[] }
export function f(input: { query?: string; role?: string; limit?: number; canvas?: 'wide' | 'standard' }): Array<{ id: string; name: string; roles: string[]; zones: Array<{ id: string; purpose: string; x: number; y: number; w: number; h: number }>; rules: string[] }>
export function c(query: string, limit?: number): Array<{ name: string; keywords: string[] }>
export function r(name: string, color: string, strokeWidth?: number): string
