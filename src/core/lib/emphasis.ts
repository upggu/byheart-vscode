// Copied from ../byheart src/lib/emphasis.ts at commit 0ee9eaa78e40d6aded17d1d27913c13ed0492339 (2026-11-08). Do not edit; re-copy and update this line.
export interface EmphasisRange { start: number; end: number; kind: 'bold' | 'italic' }
export interface EmphasisMatch extends EmphasisRange { sourceStart: number; sourceEnd: number; marker: string }

// Intentionally the same limited, single-line syntax for annotations and dialogue.
// Unsupported markup remains literal text; never interpret HTML.
export function emphasisMatches(source: string): EmphasisMatch[] {
  const pattern = /(?<!\*)\*\*([^*\n\r]+)\*\*(?!\*)|(?<!\*)\*([^*\n\r]+)\*(?!\*)/g;
  let removed = 0;
  return [...source.matchAll(pattern)].map(match => {
    const marker = match[1] !== undefined ? '**' : '*';
    const start = match.index - removed;
    const end = start + (match[1] ?? match[2]).length;
    removed += marker.length * 2;
    return {start,end,kind:marker === '**' ? 'bold' : 'italic',sourceStart:match.index,sourceEnd:match.index+match[0].length,marker};
  });
}
export function parseEmphasis(source: string): {text: string; ranges: EmphasisRange[]} {
  let text = '', offset = 0;
  const matches = emphasisMatches(source);
  for (const m of matches) {
    text += source.slice(offset,m.sourceStart) + source.slice(m.sourceStart+m.marker.length,m.sourceEnd-m.marker.length);
    offset = m.sourceEnd;
  }
  text += source.slice(offset);
  return {text,ranges:matches.map(({start,end,kind})=>({start,end,kind}))};
}
export function sliceEmphasis(ranges: EmphasisRange[] | undefined, start: number, end: number): EmphasisRange[] {
  return (ranges ?? []).filter(r=>r.start<end && r.end>start).map(r=>({...r,start:Math.max(r.start,start)-start,end:Math.min(r.end,end)-start}));
}
