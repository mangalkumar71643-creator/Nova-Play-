/**
 * Values the admin can change from the panel, held in memory and refreshed
 * from the Setting table (see services/settingsService.ts). No imports, so
 * env.ts can read it without an import cycle. Unset means "use the default".
 */
export const runtimeSettings: { maxPayout?: number } = {};
