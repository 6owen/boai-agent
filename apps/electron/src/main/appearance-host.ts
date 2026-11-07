/*
 * [INPUT]: The original appearance writer and explicitly whitelisted desktop commands.
 * [OUTPUT]: Validated v1/v2 calls with pre-commit error identity preserved across the runtime bridge.
 * [POS]: Main-only adapter; transport failures remain unknown rather than safe-to-retry.
 * [PROTOCOL]: Changes must update this Header and main/.folder.md.
 */
import { z } from 'zod'
import { appearancePatchSchema } from '@boai/shared/appearance/schema'
import { AppearanceError } from '@boai/shared/appearance/commands'
import { ApplicationHostError } from '@boai/shared/ipc/application-host'
import type { AppearanceStore } from './appearance'

export const appearanceRevisionInput = z.object({ expectedRevision: z.number().int().nonnegative() }).strict().optional()
export async function appearanceHostRequest(store: AppearanceStore, method: 'getAppearance' | 'updateAppearance' | 'removeAppearanceBackground' | 'resetAppearance', input: unknown) {
  try {
    if (method === 'getAppearance') { z.undefined().parse(input); return store.snapshot() }
    if (method === 'updateAppearance') {
      const value = z.object({ patch: appearancePatchSchema, expectedRevision: z.number().int().nonnegative(), contractVersion: z.union([z.literal(1), z.literal(2)]).optional() }).strict().parse(input)
      return await (value.contractVersion === 2 ? store.updateCommand(value.patch, value.expectedRevision) : store.update(value.patch, value.expectedRevision))
    }
    const value = appearanceRevisionInput.parse(input)
    return await (method === 'resetAppearance' ? store.reset(value?.expectedRevision) : store.remove(value?.expectedRevision))
  } catch (error) {
    if (error instanceof AppearanceError) throw new ApplicationHostError(error.code === 'INVALID_ARGUMENT' ? 'INVALID_INPUT' : error.code === 'READ_ONLY' ? 'FORBIDDEN' : error.code, error.message)
    if (error instanceof z.ZodError) throw new ApplicationHostError('INVALID_INPUT', '外观参数不符合当前配置合同，未提交修改。')
    throw error
  }
}
