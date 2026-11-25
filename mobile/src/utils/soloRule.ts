import type { SoloRule } from '../api/backend';

/**
 * The rules line for a round with only one player in a least-rule game (Admin → Result Rules on the server): under LEAST
 * the least rule applies to a player alone too (a bet on its own loses), under RANDOM the round keeps its own random
 * result except for the House's share. `result` names what the round shows ("result", "dice", "five digits"…),
 * `round` what a round is called ("round", "period"). Null when the server does not say (an older server).
 */
export function soloRuleText(rule: SoloRule | undefined | null, result: string, round = 'round'): string | null {
  if (!rule) return null;
  const plural = result === 'dice' || /s$/.test(result);
  const be = plural ? 'are' : 'is';
  const theOne = plural ? 'the ones that pay' : 'the one that pays';
  if (rule.mode === 'LEAST') {
    return `Playing alone: when you are the only player on a ${round}, the same rule applies — the ${result} ${be} ${theOne} you the least, so a bet on its own loses.`;
  }
  const house = rule.houseChancePercent;
  const draw = `there is nobody to compare with, so the ${result} ${be} a normal random draw`;
  return house > 0
    ? `Playing alone: when you are the only player on a ${round}, ${draw} — but the House takes ${house}% of such ${round}s: the ${result} ${be} then ${theOne} you the least.`
    : `Playing alone: when you are the only player on a ${round}, ${draw}.`;
}
