// Speech bubble text wrapping and non-overlapping placement. Pure, unit-tested.

const NO_LINE_START = '，。、；：！？」』）》…,.!?;:)';

/** Visual width of a character in "full-width" units: CJK = 1, ASCII ~ 0.55. */
const unit = (ch: string) => (ch.charCodeAt(0) < 0x100 ? 0.55 : 1);

/**
 * Wrap text into at most `maxLines` lines of `maxUnits` full-width characters.
 * Overflow ends with "…". Newlines and runs of spaces collapse to one space.
 */
export function wrapText(text: string, maxUnits: number, maxLines: number): string[] {
  const chars = [...text.replace(/\s+/g, ' ').trim()];
  const lines: string[] = [];
  let line = '';
  let used = 0;
  for (let i = 0; i < chars.length; i++) {
    const w = unit(chars[i]);
    // never start a line with closing punctuation: let it hang past the edge instead
    if (used + w > maxUnits && !NO_LINE_START.includes(chars[i])) {
      lines.push(line);
      if (lines.length === maxLines) {
        lines[maxLines - 1] = [...line].slice(0, -1).join('') + '…';
        return lines;
      }
      line = '';
      used = 0;
      if (chars[i] === ' ') continue;
    }
    line += chars[i];
    used += w;
  }
  if (line) lines.push(line);
  return lines;
}

export interface BubbleBox {
  id: number;
  /** anchor: where the tail points (above the speaker's head) */
  ax: number;
  ay: number;
  w: number;
  h: number;
}

export interface Placed {
  id: number;
  x: number;
  y: number;
}

const GAP = 4;

/**
 * Place bubbles centred above their anchors; when that spot is taken, use the free candidate spot
 * (above / beside an existing bubble, never lower) closest to the natural one.
 * Older bubbles (lower id) keep their spot, so a bubble never jumps while it is being read.
 */
export function layoutBubbles(
  boxes: readonly BubbleBox[],
  bounds: { w: number; h: number },
  /** areas to keep clear, e.g. the other characters' heads */
  avoid: readonly { x: number; y: number; w: number; h: number }[] = [],
): Placed[] {
  const placed: (Placed & { w: number; h: number })[] = avoid.map((r) => ({ id: -1, ...r }));
  const clampX = (x: number, w: number) => Math.min(Math.max(GAP, x), bounds.w - w - GAP);
  const clampY = (y: number, h: number) => Math.min(Math.max(GAP, y), bounds.h - h - GAP);
  for (const b of [...boxes].sort((p, q) => p.id - q.id)) {
    const nx = clampX(b.ax - b.w / 2, b.w);
    const ny = clampY(b.ay - b.h, b.h);
    const free = (x: number, y: number) =>
      !placed.some((p) => x < p.x + p.w + GAP && p.x < x + b.w + GAP && y < p.y + p.h + GAP && p.y < y + b.h + GAP);
    const candidates: [number, number][] = [[nx, ny]];
    for (const p of placed) {
      // never below the natural spot: that would cover the speakers' faces
      for (const y of [p.y - b.h - GAP, p.y + p.h + GAP, ny].filter((y) => y <= ny)) {
        candidates.push([nx, y], [p.x - b.w - GAP, y], [p.x + p.w + GAP, y]);
      }
    }
    let best: [number, number] = [nx, ny];
    let bestD = Infinity;
    for (const [cx, cy] of candidates) {
      const x = clampX(cx, b.w);
      const y = clampY(cy, b.h);
      const d = Math.hypot(x - nx, (y - ny) * 1.2);
      if (d < bestD && free(x, y)) {
        best = [x, y];
        bestD = d;
      }
    }
    placed.push({ id: b.id, x: best[0], y: best[1], w: b.w, h: b.h });
  }
  return placed.filter((p) => p.id !== -1).map(({ id, x, y }) => ({ id, x, y }));
}
