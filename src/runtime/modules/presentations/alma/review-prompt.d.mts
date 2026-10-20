/*
 * [INPUT]: Migrated helper implementation.
 * [OUTPUT]: Typed companion without duplicating runtime parsing.
 * [POS]: Presentation helper declarations.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import type { PresentationSpec, PresentationSlide } from './model.mjs'
export function reviewPrompt(spec: PresentationSpec, slides: PresentationSlide[]): string
