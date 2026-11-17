// The kinds of sound a game can have. A pack (see packs.ts) holds the ones that fit its game.
export type SoundEvent =
  | 'start' // a bet is placed / a round or spin begins
  | 'step' // one safe step, pick, flip or card
  | 'tick' // a small beat: countdown, peg, ball, burst
  | 'land' // the board / reels / dice settle
  | 'reveal' // the result is being drawn (cards dealt, dice shaken, wheel spun)
  | 'launch' // a crash game takes off
  | 'loop' // a crash game's flight (repeats)
  | 'cashout' // money taken out safely
  | 'special' // a blow-up, crash, mine, or other hazard
  | 'win'
  | 'bigwin'
  | 'lose';
