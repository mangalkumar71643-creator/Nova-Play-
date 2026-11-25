import { prisma } from "../db/prismaClient";
import { env } from "../config/env";
import { runtimeSettings, type SoloRuleSetting } from "../config/runtimeSettings";
import { fairGameFloat } from "../utils/rng";

/**
 * A round with exactly one player, in the games whose result follows the least rule ("the result that pays the least /
 * has the least money on it wins"; owner's request, 2026-11-26: Admin → Result Rules). With one player there is nobody
 * to weigh the bets against, so the admin picks, game by game, what such a round does:
 *  - RANDOM: the round keeps its own random result (drawn from its seed, as without the least rule), except that the
 *    House takes `houseChance` of such rounds: the result is then the least rule's (the one that pays that player the least).
 *  - LEAST: the least rule, as with any number of players (a player alone gets the result that pays them the least).
 * The defaults are what the games did before the setting existed: Win Go and Trx Win Go RANDOM with the House taking
 * WINGO_SOLO_HOUSE_CHANCE (40%), every other game LEAST. Each game's config reports the rule in force (soloRule) and its
 * rules text in the app states it. Rounds with two or more players always follow the least rule.
 */
export const SOLO_GAMES = [
  { key: "winGo", name: "Win Go", group: "Win Go" },
  { key: "trxWinGo", name: "Trx Win Go", group: "Lottery" },
  { key: "k3", name: "K3 Lottery", group: "Lottery" },
  { key: "fiveD", name: "5D Lottery", group: "Lottery" },
  { key: "jhandiMunda", name: "Jhandi Munda", group: "Lottery" },
  { key: "sevenUpDown", name: "7 Up Down", group: "Table" },
  { key: "dragonTiger", name: "Dragon Tiger", group: "Table" },
  { key: "andarBahar", name: "Andar Bahar", group: "Table" },
  { key: "teenPatti", name: "Teen Patti", group: "Table" },
  { key: "roulette", name: "Roulette", group: "Table" },
  { key: "baccarat", name: "Baccarat", group: "Table" },
] as const;
export type SoloGame = (typeof SOLO_GAMES)[number]["key"];
export const SOLO_GAME_KEYS = SOLO_GAMES.map((g) => g.key) as [SoloGame, ...SoloGame[]];
export type SoloMode = SoloRuleSetting["mode"];

/** Where the admin's choices are kept (Setting table), read with the other runtime settings (settingsService.ts). */
export const SOLO_RULES_KEY = "soloRules";

function defaultRule(game: SoloGame): SoloRuleSetting {
  return game === "winGo" || game === "trxWinGo" ? { mode: "RANDOM", houseChance: env.games.winGoSoloHouseChance } : { mode: "LEAST", houseChance: 1 };
}

export function soloRuleFor(game: SoloGame): SoloRuleSetting {
  return runtimeSettings.soloRules?.[game] ?? defaultRule(game);
}

/** Whether the game's least rule itself is on (a server setting: WINGO_LEAST_STAKED, LOTTERY_LEAST_PAYOUT, TABLE_LEAST_PAYOUT). */
export function leastRuleOn(game: SoloGame): boolean {
  if (game === "winGo") return env.games.winGoLeastStaked;
  if (game === "trxWinGo" || game === "k3" || game === "fiveD" || game === "jhandiMunda") return env.games.lotteryLeastPayout;
  return env.games.tableLeastPayout;
}

/**
 * Whether a round keeps its own random result: it has exactly one player, the game's rule for that is RANDOM, and the
 * House did not take the round. The House's draw comes from the round's own seed (its own HMAC message), so every
 * settler of the round, and anyone re-checking it once the seed is out, gets the same answer. Otherwise the least rule
 * decides. (Win Go and Trx Win Go apply the same rule in winGoService.resultForBets.)
 */
export function keepsOwnResult(game: SoloGame, bets: { userId: string }[], serverSeed: string, periodNumber: string): boolean {
  if (new Set(bets.map((b) => b.userId)).size !== 1) return false;
  const rule = soloRuleFor(game);
  return rule.mode === "RANDOM" && fairGameFloat(serverSeed, periodNumber, `${game}-solo`, 0) >= rule.houseChance;
}

/**
 * The rule for the app's rules text (each game's config). Under LEAST the House's share is reported as 100%: apps
 * older than the setting (Win Go and Trx Win Go, 1.0.128 and before) show "the House takes N% of such periods: the
 * number is then the one that pays that player the least", which is what LEAST does to a player alone.
 */
export function soloRuleView(game: SoloGame): { mode: SoloMode; houseChancePercent: number } {
  const rule = soloRuleFor(game);
  return { mode: rule.mode, houseChancePercent: rule.mode === "LEAST" ? 100 : Math.round(rule.houseChance * 10000) / 100 };
}

/** Every game's rule, for the admin's Result Rules page. */
export function listSoloRules() {
  return SOLO_GAMES.map((g) => ({ key: g.key, name: g.name, group: g.group, leastRuleOn: leastRuleOn(g.key), ...soloRuleView(g.key) }));
}

/** Reads the stored rules; anything unknown or out of range is left out (that game keeps its default). */
export function parseSoloRules(raw: string | null | undefined): Partial<Record<SoloGame, SoloRuleSetting>> | undefined {
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object") return undefined;
  const out: Partial<Record<SoloGame, SoloRuleSetting>> = {};
  for (const key of SOLO_GAME_KEYS) {
    const r = (parsed as Record<string, unknown>)[key] as { mode?: unknown; houseChance?: unknown } | undefined;
    if (!r || (r.mode !== "RANDOM" && r.mode !== "LEAST")) continue;
    const houseChance = Number(r.houseChance);
    if (!Number.isFinite(houseChance) || houseChance < 0 || houseChance > 1) continue;
    out[key] = { mode: r.mode, houseChance };
  }
  return out;
}

/** Saves the admin's choices for the games given (the others keep theirs) and applies them at once on this server. */
export async function setSoloRules(input: Partial<Record<SoloGame, { mode: SoloMode; houseChancePercent: number }>>) {
  const next: Partial<Record<SoloGame, SoloRuleSetting>> = { ...(runtimeSettings.soloRules ?? {}) };
  for (const key of SOLO_GAME_KEYS) {
    const r = input[key];
    if (!r) continue;
    next[key] = { mode: r.mode, houseChance: r.mode === "LEAST" ? 1 : Math.round(r.houseChancePercent * 100) / 10000 };
  }
  const value = JSON.stringify(next);
  await prisma.setting.upsert({ where: { key: SOLO_RULES_KEY }, update: { value }, create: { key: SOLO_RULES_KEY, value } });
  runtimeSettings.soloRules = next;
  return listSoloRules();
}
