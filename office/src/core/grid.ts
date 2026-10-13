// Walkable tile grid + 8-direction A* (no corner cutting). Pure, deterministic.

export interface Tile {
  x: number;
  y: number;
}

export class Grid {
  private readonly blocked: Uint8Array;

  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    this.blocked = new Uint8Array(cols * rows);
  }

  inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  walkable(x: number, y: number) {
    return this.inside(x, y) && !this.blocked[y * this.cols + x];
  }

  block(x: number, y: number, w = 1, h = 1) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (this.inside(i, j)) this.blocked[j * this.cols + i] = 1;
  }
}

const DIRS: readonly [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

const octile = (ax: number, ay: number, bx: number, by: number) => {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
};

/**
 * Shortest path from `from` to `to` (both included), or null when unreachable.
 * Diagonal steps never cut a blocked corner, so characters never clip furniture edges.
 */
export function findPath(g: Grid, from: Tile, to: Tile): Tile[] | null {
  if (!g.walkable(to.x, to.y)) return null;
  const n = g.cols * g.rows;
  const gScore = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const start = from.y * g.cols + from.x;
  const goal = to.y * g.cols + to.x;
  gScore[start] = 0;
  // ponytail: linear-scan open list, fine for a 28x21 office; use a binary heap for big maps
  const open: number[] = [start];
  while (open.length) {
    let best = 0;
    let bestF = Infinity;
    for (let k = 0; k < open.length; k++) {
      const id = open[k];
      const f = gScore[id] + octile(id % g.cols, (id / g.cols) | 0, to.x, to.y);
      // tie-break on lower id keeps paths deterministic
      if (f < bestF - 1e-9 || (Math.abs(f - bestF) < 1e-9 && id < open[best])) {
        bestF = f;
        best = k;
      }
    }
    const cur = open.splice(best, 1)[0];
    if (cur === goal) break;
    closed[cur] = 1;
    const cx = cur % g.cols;
    const cy = (cur / g.cols) | 0;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!g.walkable(nx, ny)) continue;
      if (dx && dy && (!g.walkable(cx + dx, cy) || !g.walkable(cx, cy + dy))) continue;
      const id = ny * g.cols + nx;
      if (closed[id]) continue;
      const tentative = gScore[cur] + cost;
      if (tentative < gScore[id] - 1e-9) {
        gScore[id] = tentative;
        parent[id] = cur;
        if (!open.includes(id)) open.push(id);
      }
    }
  }
  if (start !== goal && parent[goal] === -1) return null;
  const path: Tile[] = [];
  for (let id = goal; id !== -1; id = id === start ? -1 : parent[id]) path.push({ x: id % g.cols, y: (id / g.cols) | 0 });
  return path.reverse();
}
