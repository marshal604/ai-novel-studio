// Replay pacing: a time-lapse of the real run. Pure and deterministic.
//   gap_i = beat(previous event) + k * squashed real gap
// `beat` keeps every event visible; k stretches real time so the whole replay lasts ~`target` seconds.
// Different people may talk at once (bubbles overlap in time), which is what makes the office feel busy.
import { updatedFile, type ActivityEvent } from './events';

/** Real gaps longer than this (waiting for a reviewer, a coffee break) are squashed to it. */
export const MAX_REAL_GAP = 40;
export const MIN_BEAT = 0.55;
export const MAX_BEAT = 1.6;

/** Minimum on-screen time of an event before the next may start (speech needs a bit longer). */
export function beat(e: ActivityEvent): number {
  if (updatedFile(e) || /^查閱[:：]/.test(e.content)) return MIN_BEAT;
  return Math.min(MAX_BEAT, Math.max(MIN_BEAT, 0.5 + e.content.length * 0.014));
}

/** Seconds between two log lines; out-of-order or unparsable timestamps count as simultaneous. */
export function realGap(prevTs: string, ts: string): number {
  const dt = (Date.parse(ts) - Date.parse(prevTs)) / 1000;
  return Number.isFinite(dt) && dt > 0 ? Math.min(MAX_REAL_GAP, dt) : 0;
}

export interface PaceOptions {
  /** wall-clock seconds the whole replay should take at speed 1 (never shorter than the beats) */
  target?: number;
  speed?: number;
  leadIn?: number;
}

/** gaps[i] = seconds between releasing event i-1 and event i (gaps[0] is the lead-in). */
export function replayGaps(events: readonly ActivityEvent[], opts: PaceOptions = {}): number[] {
  const { target = 90, speed = 1, leadIn = 1.2 } = opts;
  const k0 = speed > 0 ? speed : 1;
  const beats = events.map((_, i) => (i === 0 ? 0 : beat(events[i - 1])));
  const reals = events.map((e, i) => (i === 0 ? 0 : realGap(events[i - 1].timestamp, e.timestamp)));
  const sumBeats = beats.reduce((a, b) => a + b, 0);
  const sumReal = reals.reduce((a, b) => a + b, 0);
  const k = sumReal > 0 ? Math.max(0, target - leadIn - sumBeats) / sumReal : 0;
  return events.map((_, i) => (i === 0 ? leadIn : beats[i] + k * reals[i]) / k0);
}

/** World speed for a replay speed: sqrt keeps walking natural at 2-4x. */
export const worldRate = (speed: number) => Math.min(2, Math.max(1, Math.sqrt(speed)));
