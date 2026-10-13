// Feeds events into the director + world at a watchable pace. Pure (no DOM), driven by tick(dt).
import { direct, initialDirector, type BoardUpdate, type DirectorState, type Phase } from './director';
import { ROLES, type ActivityEvent } from './events';
import { World } from './world';

export interface Board {
  chapter: number | null;
  phase: Phase;
  approved: number[];
  /** chapter file currently shown in the manuscript view */
  manuscript: string | null;
}

/** Live mode: minimum spacing between bursts of events written at the same moment. */
export const LIVE_GAP = 1.6;

export function applyBoard(b: Board, u: BoardUpdate): Board {
  // chapters only move forward on the board: messages often look back at earlier chapters
  const chapter = u.chapter && (b.chapter === null || u.chapter > b.chapter) ? u.chapter : b.chapter;
  const moved = chapter !== b.chapter;
  return {
    chapter,
    phase: u.phase ?? (moved && b.phase === '已定稿' ? '籌備中' : b.phase),
    approved: u.approved && !b.approved.includes(u.approved) ? [...b.approved, u.approved] : b.approved,
    manuscript: u.manuscript ?? b.manuscript,
  };
}

export class Player {
  readonly world: World;
  board: Board = { chapter: null, phase: '籌備中', approved: [], manuscript: null };
  readonly released: ActivityEvent[] = [];
  private director: DirectorState = initialDirector();
  private pendingEvents: ActivityEvent[] = [];
  private gaps: number[] = [];
  private since = 0;
  /** when the last event was released (sim seconds) */
  lastReleaseAt = 0;
  /** run time being shown (ms since epoch), interpolated between event timestamps; null before the first */
  clock: number | null = null;
  private lastTs: number | null = null;
  /** timestamp of the first released event: "how long the team has been working" */
  startTs: number | null = null;

  /**
   * @param rate how fast the office moves relative to real time (replay speed-ups walk a bit faster
   *   too, but never so fast that it looks frantic)
   */
  constructor(
    seed = 7,
    private readonly rate = 1,
  ) {
    this.world = new World(seed);
  }

  /** Queue events; `gaps[i]` = seconds to wait after the previous release (defaults to LIVE_GAP). */
  enqueue(events: readonly ActivityEvent[], gaps?: readonly number[]) {
    this.pendingEvents.push(...events);
    this.gaps.push(...events.map((_, i) => gaps?.[i] ?? LIVE_GAP));
  }

  /** Catch up on history instantly (live mode start): modes and board only, no animation. */
  prime(history: readonly ActivityEvent[]) {
    this.director = initialDirector();
    this.board = { chapter: null, phase: '籌備中', approved: [], manuscript: null };
    for (const e of history) {
      const d = direct(this.director, e);
      this.director = d.state;
      this.board = applyBoard(this.board, d.board);
    }
    for (const r of ROLES) this.world.actors[r].mode = this.director.modes[r];
  }

  get remaining() {
    return this.pendingEvents.length;
  }

  /** Advance the office by dt seconds; returns the events released during this tick. */
  tick(dt: number): ActivityEvent[] {
    this.since += dt;
    const out: ActivityEvent[] = [];
    while (this.pendingEvents.length && this.canRelease()) {
      const e = this.pendingEvents.shift()!;
      this.gaps.shift();
      this.since = 0;
      this.lastReleaseAt = this.world.t;
      const ts = Date.parse(e.timestamp);
      if (Number.isFinite(ts) && (this.lastTs === null || ts > this.lastTs)) this.lastTs = ts;
      if (Number.isFinite(ts) && this.startTs === null) this.startTs = ts;
      const d = direct(this.director, e);
      this.director = d.state;
      this.board = applyBoard(this.board, d.board);
      this.world.apply(d.cues);
      this.released.push(e);
      out.push(e);
    }
    // a team with work left keeps busy between events (typing, fetching references) instead of idling
    this.world.busy = this.pendingEvents.length > 0 || this.world.t - this.lastReleaseAt < 20;
    this.world.step(dt * this.rate);
    this.clock = this.interpolateClock();
    return out;
  }

  /** The run's clock ticks smoothly from one event's timestamp towards the next one's. */
  private interpolateClock(): number | null {
    if (this.lastTs === null) return null;
    const next = this.pendingEvents.length ? Date.parse(this.pendingEvents[0].timestamp) : NaN;
    if (!Number.isFinite(next) || next <= this.lastTs) return this.lastTs;
    return this.lastTs + (next - this.lastTs) * Math.min(1, this.since / Math.max(0.01, this.gaps[0]));
  }

  private canRelease(): boolean {
    const e = this.pendingEvents[0];
    // reads and file saves are quick, optional flourishes: they never hold up the story
    if (/^(查閱|檔案更新)[:：]/.test(e.content)) return this.since >= this.gaps[0];
    // let the office catch up instead of piling up bubbles: the speaker must be nearly free
    return this.since >= this.gaps[0] && this.world.pending(e.agent) <= 3 && this.world.pending() <= 10;
  }
}
