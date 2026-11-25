/**
 * Values the admin can change from the panel, held in memory and refreshed
 * from the Setting table (see services/settingsService.ts). No imports, so
 * env.ts can read it without an import cycle. Unset means "use the default".
 */
/** A round with one player in a least-rule game (soloRuleService.ts): its own random result with the House taking `houseChance`, or the least rule. */
export type SoloRuleSetting = { mode: "RANDOM" | "LEAST"; houseChance: number };

export const runtimeSettings: { maxPayout?: number; soloRules?: Partial<Record<string, SoloRuleSetting>> } = {};
