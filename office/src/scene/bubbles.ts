// Speech / thought bubbles: auto-sized, stacked so they never overlap, popped in and faded by sim time.
import Phaser from 'phaser';
import { layoutBubbles, wrapText } from '../core/bubbles';
import { ROLE_COLOR, ROLES } from '../core/events';
import { MAP_H, MAP_W } from '../core/office';
import type { Bubble, World } from '../core/world';
import { FONT } from './room';

const PAD_X = 7;
const PAD_Y = 5;
const TAIL = 7;
const MAX_UNITS = 13;
const MAX_LINES = 3;

interface View {
  box: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
  w: number;
  h: number;
}

const hex = (css: string) => Number.parseInt(css.slice(1), 16);

export class BubbleViews {
  private readonly views = new Map<number, View>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly resolution: number,
  ) {}

  private create(b: Bubble): View {
    const text = this.scene.add
      .text(PAD_X, PAD_Y, wrapText(b.text, MAX_UNITS, MAX_LINES).join('\n'), {
        fontFamily: FONT, fontSize: '12px', color: b.think ? '#5b5470' : '#2b2118', lineSpacing: 2,
      })
      .setResolution(this.resolution);
    const w = Math.ceil(text.width) + PAD_X * 2;
    const h = Math.ceil(text.height) + PAD_Y * 2;
    const bg = this.scene.add.graphics();
    const box = this.scene.add.container(0, 0, [bg, text]).setDepth(1e6 + b.id);
    return { box, bg, text, w, h };
  }

  private draw(v: View, b: Bubble, tailX: number) {
    const g = v.bg.clear();
    const border = hex(ROLE_COLOR[b.role]);
    g.fillStyle(0x000000, 0.18).fillRoundedRect(2, 3, v.w, v.h, 7);
    g.fillStyle(b.think ? 0xf6f3ff : 0xfffdf6, 1).fillRoundedRect(0, 0, v.w, v.h, 7);
    g.lineStyle(2, border, 1).strokeRoundedRect(0, 0, v.w, v.h, 7);
    if (b.think) {
      g.fillStyle(0xf6f3ff, 1).lineStyle(1.5, border, 1);
      g.fillCircle(tailX, v.h + 5, 3.2).strokeCircle(tailX, v.h + 5, 3.2);
      g.fillCircle(tailX - 2, v.h + 11, 2).strokeCircle(tailX - 2, v.h + 11, 2);
    } else {
      g.fillStyle(0xfffdf6, 1).fillTriangle(tailX - 5, v.h - 1, tailX + 5, v.h - 1, tailX, v.h + TAIL);
      g.lineStyle(2, border, 1).lineBetween(tailX - 5, v.h, tailX, v.h + TAIL).lineBetween(tailX + 5, v.h, tailX, v.h + TAIL);
    }
  }

  sync(world: World, head: (r: Bubble['role']) => { x: number; y: number }) {
    const live = new Set(world.bubbles.map((b) => b.id));
    for (const [id, v] of this.views) {
      if (!live.has(id)) {
        v.box.destroy();
        this.views.delete(id);
      }
    }
    for (const b of world.bubbles) if (!this.views.has(b.id)) this.views.set(b.id, this.create(b));
    const boxes = world.bubbles.map((b) => {
      const v = this.views.get(b.id)!;
      const p = head(b.role);
      return { id: b.id, ax: p.x, ay: p.y - TAIL - 4, w: v.w, h: v.h };
    });
    // keep faces visible: every character's head is an obstacle
    const heads = ROLES.map((r) => head(r)).map((p) => ({ x: p.x - 16, y: p.y - 2, w: 32, h: 34 }));
    const placed = layoutBubbles(boxes, { w: MAP_W, h: MAP_H }, heads);
    for (const p of placed) {
      const b = world.bubbles.find((q) => q.id === p.id)!;
      const v = this.views.get(p.id)!;
      const anchor = boxes.find((q) => q.id === p.id)!;
      this.draw(v, b, Math.min(v.w - 10, Math.max(10, anchor.ax - p.x)));
      const age = world.t - b.born;
      const left = b.until - world.t;
      const pop = Math.min(1, age / 0.14);
      v.box.setPosition(p.x, p.y).setAlpha(Math.min(1, left / 0.25, pop * 1.5)).setScale(0.85 + 0.15 * pop);
    }
  }
}
