/** Design 7.4: wpm = (chars / 5) / minutes. Null before the first character or without elapsed time. */
export function wpm(chars: number, elapsedMs: number): number | null {
  if (chars <= 0 || elapsedMs <= 0) return null;
  return Math.round(chars / 5 / (elapsedMs / 60000));
}

/** Time-weighted: total chars / 5 over total minutes, not a mean of per-card values. */
export function averageWpm(cards: { chars: number; elapsedMs: number }[]): number | null {
  let chars = 0;
  let elapsedMs = 0;
  for (const card of cards) {
    chars += card.chars;
    elapsedMs += card.elapsedMs;
  }
  return wpm(chars, elapsedMs);
}
