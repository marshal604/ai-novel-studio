// The Phaser scene: draws the room and mirrors the headless Player each frame.
import Phaser from 'phaser';
import { chapterLabel } from '../core/events';
import { FURNITURE, MAP_H, MAP_W, TILE } from '../core/office';
import type { Board, Player } from '../core/player';
import { ActorViews, preloadActors, type Anchors } from './actors';
import { BubbleViews } from './bubbles';
import { Effects } from './fx';
import { FONT, drawRoom } from './room';

export const dprOf = () => Math.min(window.devicePixelRatio || 1, 2);


export interface SceneHost {
  player: Player;
  title: () => string;
  totalChapters: () => number;
  /** called every frame with the sim dt; return the dt actually simulated (0 when paused / manual) */
  advance: (dt: number) => number;
}

export class OfficeScene extends Phaser.Scene {
  private actors!: ActorViews;
  private bubbles!: BubbleViews;
  private fx!: Effects;
  private boardText!: Phaser.GameObjects.Text;
  private boardKey = '';
  private hands!: Phaser.GameObjects.Graphics;
  private clockCenter = { x: 0, y: 0, r: 0 };

  constructor(private readonly host: SceneHost) {
    super('office');
  }

  preload() {
    preloadActors(this);
    for (const f of new Set([...FURNITURE.map((x) => x.sprite), 'paper', 'stamp'])) this.load.image(`prop_${f}`, `assets/props/${f}.png`);
  }

  create() {
    const res = this.fit();
    drawRoom(this);
    this.actors = new ActorViews(this, this.cache.json.get('anchors') as Anchors, res);
    this.bubbles = new BubbleViews(this, res);
    this.fx = new Effects(this, res);
    const wb = FURNITURE.find((f) => f.sprite === 'whiteboard')!;
    this.boardText = this.add
      .text((wb.x + wb.w / 2) * TILE, (wb.y + wb.h) * TILE - 52, '', {
        fontFamily: FONT, fontSize: '9px', color: '#2b3a55', align: 'center', lineSpacing: 1, fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5)
      .setResolution(res)
      .setDepth((wb.y + wb.h) * TILE + 1);
    const ck = FURNITURE.find((f) => f.sprite === 'clock')!;
    const r = ck.width / 2;
    this.clockCenter = { x: (ck.x + ck.w / 2) * TILE, y: (ck.y + ck.h) * TILE - (ck.lift ?? 0) - r, r };
    this.hands = this.add.graphics().setDepth(-1400);
    this.scale.on('resize', () => this.fit());
    this.redraw(0);
  }

  /** Crisp on retina: backing store at dpr, camera zoom = dpr * fit (see the game-feel skill). */
  private fit(): number {
    const cam = this.cameras.main;
    const dpr = dprOf();
    const w = this.scale.width / dpr;
    const h = this.scale.height / dpr;
    const zoom = dpr * Math.min(w / MAP_W, h / MAP_H);
    cam.setZoom(zoom);
    cam.centerOn(MAP_W / 2, MAP_H / 2);
    return zoom;
  }

  update(_time: number, delta: number) {
    const dt = this.host.advance(Math.min(delta / 1000, 0.1));
    this.redraw(dt);
  }

  /** Mirror the sim; `dt` drives effects (0 = just redraw). */
  redraw(dt: number) {
    const p = this.host.player;
    for (const fx of p.world.drainFx()) this.fx.spawn(fx);
    this.fx.update(dt);
    this.actors.sync(p.world.actors, p.world.t);
    this.bubbles.sync(p.world, (r) => this.actors.head(r));
    this.drawBoard(p.board);
    this.drawClock(p.clock);
  }

  /** The wall clock shows the run's real time, so a time-lapse visibly races. */
  private drawClock(ms: number | null) {
    if (ms === null) return;
    const d = new Date(ms + 8 * 3600 * 1000); // Asia/Taipei, no DST
    const min = d.getUTCMinutes() + d.getUTCSeconds() / 60;
    const hour = (d.getUTCHours() % 12) + min / 60;
    const { x, y, r } = this.clockCenter;
    const hand = (turns: number, len: number, w: number, color: number) => {
      const a = turns * Math.PI * 2 - Math.PI / 2;
      this.hands.lineStyle(w, color, 1).lineBetween(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len);
    };
    // paint over the sprite's fixed hands with a fresh face, then draw live ones
    this.hands.clear().fillStyle(0xf4e8cc, 1).fillCircle(x, y, r * 0.74);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.hands.fillStyle(0x5a3a26, 1).fillRect(x + Math.cos(a) * r * 0.62 - 0.6, y + Math.sin(a) * r * 0.62 - 0.6, 1.2, 1.2);
    }
    hand(hour / 12, r * 0.45, 2, 0x3b2418);
    hand(min / 60, r * 0.68, 1.5, 0x3b2418);
    hand(d.getUTCSeconds() / 60, r * 0.66, 1, 0xc8372d);
    this.hands.fillStyle(0x3b2418, 1).fillCircle(x, y, 1.5);
  }

  private drawBoard(b: Board) {
    const total = Math.max(this.host.totalChapters(), b.chapter ?? 0, ...b.approved);
    const pips = Array.from({ length: Math.min(total, 10) }, (_, i) => (b.approved.includes(i + 1) ? '●' : '○')).join(' ');
    const title = this.host.title();
    const text = [`《${title.length > 9 ? `${title.slice(0, 8)}…` : title}》`, `${chapterLabel(b.chapter)} · ${b.phase}`, pips].filter(Boolean).join('\n');
    if (text === this.boardKey) return;
    this.boardKey = text;
    this.boardText.setText(text);
  }
}
