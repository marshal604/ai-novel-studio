// Headless office simulation: executes director cues with walking, talking and ambient idling.
// No Phaser here: the scene only reads `actors`, `bubbles` and drained FX each frame.
import { ROLES, type Role } from './events';
import type { Action, Cue, Mode, Target } from './director';
import { findPath, type Grid, type Tile } from './grid';
import {
  AMBIENT, ANNOUNCE, BOARD, LIBRARY, PLACES, SHELF, SPOTS,
  buildGrid, tileCenter, tileOf, type Facing, type Spot,
} from './office';

export type Anim = 'idle' | 'walk' | 'work' | 'talk' | 'cheer' | 'action';

interface Running {
  action: Action;
  t: number;
  /** created by the mode / ambient logic, cancelled as soon as a real cue arrives */
  internal: boolean;
}

export interface Actor {
  role: Role;
  x: number;
  y: number;
  facing: Facing;
  anim: Anim;
  mode: Mode;
  queue: Running[];
  current: Running | null;
  path: { x: number; y: number }[];
  dest: Tile | null;
  arriveFace: Facing;
  /** face this point while it is valid (listening to someone) */
  lookAt: { x: number; y: number; until: number } | null;
  nextAmbient: number;
  /** someone is coming to talk: stay put (no ambient trips, no walking home) until then */
  holdUntil: number;
  rng: number;
}

export interface Bubble {
  id: number;
  role: Role;
  text: string;
  think: boolean;
  born: number;
  until: number;
}

export type FxEvent =
  | { kind: 'stamp'; x: number; y: number; label: string }
  | { kind: 'paper'; from: { x: number; y: number }; to: { x: number; y: number } }
  | { kind: 'confetti'; x: number; y: number };

export const WALK_SPEED = 92; // world px per second at walkScale 1

const FLY_TO = { shelf: SHELF, library: LIBRARY, board: BOARD };

const internal = (action: Action): Running => ({ action, t: 0, internal: true });

// mulberry32: tiny seeded RNG so ambient behaviour replays identically
function nextRandom(a: Actor): number {
  a.rng = (a.rng + 0x6d2b79f5) | 0;
  let t = a.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const facingTo = (dx: number, dy: number, fallback: Facing): Facing => {
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return fallback;
  // diagonals use the side view: it reads best for 3/4 characters
  if (Math.abs(dx) >= Math.abs(dy) * 0.5) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
};

export class World {
  t = 0;
  readonly grid: Grid = buildGrid();
  readonly actors: Record<Role, Actor>;
  bubbles: Bubble[] = [];
  /** work is going on: idle people type at their desks and run errands more often */
  busy = false;
  /** time-lapse replays walk briskly; talking and reading keep their normal pace */
  walkScale = 1;
  private fx: FxEvent[] = [];
  private bubbleId = 0;

  constructor(seed = 7) {
    const make = (role: Role, i: number): Actor => {
      const p = tileCenter(SPOTS[role].work);
      return {
        role, x: p.x, y: p.y, facing: SPOTS[role].work.face, anim: 'idle', mode: { kind: 'idle' },
        queue: [], current: null, path: [], dest: null, arriveFace: SPOTS[role].work.face, lookAt: null, holdUntil: 0, nextAmbient: 3 + i * 2.5, rng: seed * 97 + i * 1013,
      };
    };
    this.actors = { editor: make('editor', 0), writer: make('writer', 1), world: make('world', 2), reader: make('reader', 3) };
  }

  apply(cues: readonly Cue[]) {
    for (const c of cues) {
      const a = this.actors[c.who];
      if (c.mode) a.mode = c.mode;
      if (!c.actions.length && !c.mode) continue;
      if (c.optional && this.pending(c.who) > 0) continue;
      // real work pre-empts ambient wandering
      a.queue = a.queue.filter((r) => !r.internal);
      if (a.current?.internal) this.stop(a);
      // already behind on errands: call the message out from here instead of walking over (time-lapse pace)
      const behind = this.pending(c.who) > 0;
      const walkOver = (x: Action) => x.kind === 'goto' && ('near' in x.target || ('spot' in x.target && x.target.spot === 'announce'));
      for (const action of c.actions) if (!(behind && walkOver(action))) a.queue.push({ action, t: 0, internal: false });
    }
  }

  /** queued + running cue actions (ambient behaviour does not count) */
  pending(role?: Role): number {
    const count = (a: Actor) => a.queue.length + (a.current && !a.current.internal ? 1 : 0);
    return role ? count(this.actors[role]) : ROLES.reduce((n, r) => n + count(this.actors[r]), 0);
  }

  drainFx(): FxEvent[] {
    const out = this.fx;
    this.fx = [];
    return out;
  }

  step(dt: number) {
    this.t += dt;
    for (const r of ROLES) this.stepActor(this.actors[r], dt);
    this.bubbles = this.bubbles.filter((b) => b.until > this.t);
  }

  private stop(a: Actor) {
    a.current = null;
    a.path = [];
    a.dest = null;
  }

  private stepActor(a: Actor, dt: number) {
    if (!a.current) {
      a.current = a.queue.shift() ?? null;
      if (!a.current) this.planMode(a);
      if (a.current) this.begin(a, a.current);
    }
    const cur = a.current;
    if (!cur) return this.rest(a);
    cur.t += dt;
    if (cur.action.kind === 'goto') {
      if (this.walk(a, dt)) a.current = null;
    } else if (cur.t >= this.duration(cur.action)) a.current = null;
  }

  private duration(action: Action): number {
    if (action.kind === 'say') return action.think ? 0 : action.secs;
    if (action.kind === 'anim') return action.secs;
    return 0;
  }

  private begin(a: Actor, run: Running) {
    const act = run.action;
    if (act.kind === 'goto') {
      const spot = this.resolve(a, act.target);
      if (!spot) {
        a.current = null;
        return;
      }
      this.routeTo(a, spot);
    } else if (act.kind === 'say') {
      this.bubbles = this.bubbles.filter((b) => b.role !== a.role);
      this.bubbles.push({ id: ++this.bubbleId, role: a.role, text: act.text, think: !!act.think, born: this.t, until: this.t + act.secs });
      if (!act.think) {
        a.anim = 'talk';
        const listeners = act.to === 'all' ? ROLES.filter((r) => r !== a.role) : act.to;
        for (const r of listeners) {
          this.actors[r].lookAt = { x: a.x, y: a.y, until: this.t + act.secs };
          this.actors[r].holdUntil = Math.max(this.actors[r].holdUntil, this.t + act.secs);
        }
        const first = listeners.length === 1 ? this.actors[listeners[0]] : null;
        if (first) a.facing = facingTo(first.x - a.x, first.y - a.y, a.facing);
      }
    } else if (act.kind === 'anim') {
      a.anim = act.anim;
    } else {
      this.emit(a, act.fx);
    }
  }

  private emit(a: Actor, fx: Extract<Action, { kind: 'fx' }>['fx']) {
    if (fx.kind === 'stamp') this.fx.push({ kind: 'stamp', x: a.x, y: a.y + 26, label: fx.label });
    else if (fx.kind === 'paper') this.fx.push({ kind: 'paper', from: { x: a.x, y: a.y - 20 }, to: FLY_TO[fx.to] });
    else for (const r of ROLES) this.fx.push({ kind: 'confetti', x: this.actors[r].x, y: this.actors[r].y - 56 });
  }

  /** Idle at the current spot: face whoever is talking, otherwise the mode's pose. */
  private rest(a: Actor) {
    if (a.lookAt && a.lookAt.until > this.t) {
      a.facing = facingTo(a.lookAt.x - a.x, a.lookAt.y - a.y, a.facing);
      a.anim = 'idle';
      return;
    }
    a.lookAt = null;
    const spot = this.modeSpot(a);
    const t = tileOf(a.x, a.y);
    const home = t.x === spot.x && t.y === spot.y;
    if (home) a.facing = spot.face;
    const working = a.mode.kind === 'work' || (this.busy && a.mode.kind === 'idle');
    a.anim = home && working ? SPOTS[a.role].workAnim : 'idle';
  }

  private modeSpot(a: Actor): Spot {
    return a.mode.kind === 'meeting' ? SPOTS[a.role].meeting : SPOTS[a.role].work;
  }

  /** Freeze an actor's ambient wandering so a visitor can reach them. */
  private hold(b: Actor, secs: number) {
    b.holdUntil = this.t + secs;
    b.queue = b.queue.filter((r) => !r.internal);
    if (b.current?.internal) this.stop(b);
  }

  /** Nothing queued: go where the mode wants, or (idle) wander a little now and then. */
  private planMode(a: Actor) {
    if (this.t < a.holdUntil) return;
    const spot = this.modeSpot(a);
    const t = tileOf(a.x, a.y);
    if (a.mode.kind !== 'idle' || this.t < a.nextAmbient) {
      if (t.x !== spot.x || t.y !== spot.y) a.current = internal({ kind: 'goto', target: { at: spot } });
      return;
    }
    a.nextAmbient = this.t + (this.busy ? 5 : 6) + nextRandom(a) * 8;
    const pick = AMBIENT[Math.floor(nextRandom(a) * AMBIENT.length)];
    if (pick.x >= 0 && this.reserved(pick, a.role)) return;
    const anim = pick.anim === 'sip' ? (a.role === 'writer' ? 'action' : 'idle') : pick.anim;
    if (pick.x >= 0) a.queue.push(internal({ kind: 'goto', target: { at: pick } }));
    a.queue.push(internal({ kind: 'anim', anim, secs: 2.4 }));
    a.queue.push(internal({ kind: 'goto', target: { at: spot } }));
  }

  private resolve(a: Actor, target: Target): Spot | null {
    if ('at' in target) return target.at;
    if ('near' in target) {
      const b = this.actors[target.near];
      this.hold(b, 8);
      return this.near(a, b);
    }
    if ('place' in target) return PLACES[target.place].find((p) => !this.reserved(p, a.role)) ?? null;
    if (target.spot === 'announce') return this.free(ANNOUNCE, a);
    return target.spot === 'meeting' ? SPOTS[a.role].meeting : SPOTS[a.role].work;
  }

  /** `spot` itself, or the closest free tile beside it when someone else is already there. */
  private free(spot: Spot, a: Actor): Spot | null {
    if (!this.reserved(spot, a.role)) return spot;
    const from = tileOf(a.x, a.y);
    for (const [dx, dy] of [[-1, 0], [1, 0], [-2, 0], [2, 0], [-1, 1], [1, 1], [0, 1], [-2, 1], [2, 1]]) {
      const t = { x: spot.x + dx, y: spot.y + dy };
      if (this.grid.walkable(t.x, t.y) && !this.reserved(t, a.role) && findPath(this.grid, from, t)) return { ...t, face: spot.face };
    }
    return null;
  }

  /** A free tile next to `b` (side-by-side preferred), reachable from `a`. */
  private near(a: Actor, b: Actor): Spot | null {
    const base = b.dest ?? tileOf(b.x, b.y);
    const side = a.x <= b.x ? -1 : 1;
    const offsets: [number, number][] = [
      [side, 0], [-side, 0], [side * 2, 0], [-side * 2, 0], [0, 1], [0, -1],
      [side, 1], [-side, 1], [side, -1], [-side, -1], [0, 2], [side * 2, 1], [-side * 2, 1],
    ];
    const from = tileOf(a.x, a.y);
    for (const [dx, dy] of offsets) {
      const t = { x: base.x + dx, y: base.y + dy };
      if (!this.grid.walkable(t.x, t.y) || this.reserved(t, a.role)) continue;
      if (!findPath(this.grid, from, t)) continue;
      const face: Facing = dx === 0 ? (dy > 0 ? 'up' : 'down') : dx < 0 ? 'right' : 'left';
      return { ...t, face };
    }
    return null;
  }

  private reserved(t: Tile, self: Role) {
    return ROLES.some((r) => {
      if (r === self) return false;
      const o = this.actors[r];
      const at = o.dest ?? tileOf(o.x, o.y);
      return at.x === t.x && at.y === t.y;
    });
  }

  private routeTo(a: Actor, spot: Spot) {
    const path = findPath(this.grid, tileOf(a.x, a.y), spot);
    a.path = (path ?? []).map(tileCenter);
    a.dest = { x: spot.x, y: spot.y };
    a.arriveFace = spot.face;
  }

  /** Advance along the path at constant speed; true when arrived. */
  private walk(a: Actor, dt: number): boolean {
    let budget = WALK_SPEED * this.walkScale * dt;
    while (budget > 0 && a.path.length) {
      const wp = a.path[0];
      const dx = wp.x - a.x;
      const dy = wp.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01) a.facing = facingTo(dx, dy, a.facing);
      if (d <= budget) {
        a.x = wp.x;
        a.y = wp.y;
        budget -= d;
        a.path.shift();
      } else {
        a.x += (dx / d) * budget;
        a.y += (dy / d) * budget;
        budget = 0;
      }
    }
    if (a.path.length) {
      a.anim = 'walk';
      return false;
    }
    a.facing = a.arriveFace;
    a.dest = null;
    a.anim = 'idle';
    return true;
  }
}
