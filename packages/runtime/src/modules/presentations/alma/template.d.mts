/*
 * [INPUT]: Migrated helper implementation.
 * [OUTPUT]: Typed companion without duplicating runtime parsing.
 * [POS]: Presentation helper declarations.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
export function inspectTemplate(bytes: Uint8Array): Promise<{slideCount: number; widthInches?: number; heightInches?: number; headFontFace?: string; bodyFontFace?: string; colors: Record<string,string>; layouts: string[]}>
