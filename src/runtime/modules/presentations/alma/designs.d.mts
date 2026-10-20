/*
 * [INPUT]: Migrated helper implementation.
 * [OUTPUT]: Typed companion without duplicating runtime parsing.
 * [POS]: Presentation helper declarations.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
export function listDesigns(query?: string, limit?: number): Array<{ id: string; name: string; description: string; keywords: string[]; theme: Record<string, unknown>; design: Record<string, unknown> }>
