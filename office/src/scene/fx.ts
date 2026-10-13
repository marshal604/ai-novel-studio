// One-shot effects (flying paper, stamp, confetti), advanced by sim dt so recordings are deterministic.
import Phaser from 'phaser';
import type { FxEvent } from '../core/world';
import { FONT } from './room';

interface Live {
  t: number;
  dur: number;
  update: (k: number, t: number) => void;
  objs: Phaser.GameObjects.GameObject[];
}

const CONFETTI = [0xe0604f, 0xe8a33a, 0x5fae6a, 0x9c82d6, 0x5aa9e6, 0xffe08a];

export class Effects {
  private live: Live[] = [];
  private seed = 12345;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly resolution: number,
  ) {}

  private rand() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  spawn(fx: FxEvent) {
    if (fx.kind === 'paper') this.paper(fx.from, fx.to);
    else if (fx.kind === 'stamp') this.stamp(fx.x, fx.y, fx.label);
    else this.confetti(fx.x, fx.y);
  }

  update(dt: number) {
    for (const l of this.live) {
      l.t += dt;
      l.update(Math.min(1, l.t / l.dur), l.t);
    }
    for (const l of this.live.filter((q) => q.t >= q.dur)) for (const o of l.objs) o.destroy();
    this.live = this.live.filter((q) => q.t < q.dur);
  }

  private paper(from: { x: number; y: number }, to: { x: number; y: number }) {
    const img = this.scene.add.image(from.x, from.y, 'prop_paper').setDepth(9e5);
    img.setScale(16 / img.width);
    const sparkle = this.scene.add.star(to.x, to.y, 5, 2, 7, 0xfff3b0).setDepth(9e5).setAlpha(0);
    const lift = Math.min(90, 40 + Math.abs(to.x - from.x) * 0.15);
    const fly = 0.85;
    this.live.push({
      t: 0, dur: fly + 0.35, objs: [img, sparkle],
      update: (_k, t) => {
        const k = Math.min(1, t / fly);
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        img.setPosition(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e - Math.sin(Math.PI * e) * lift);
        img.setRotation(e * Math.PI * 2).setAlpha(k < 1 ? 1 : 0);
        const s = Math.max(0, (t - fly) / 0.35);
        sparkle.setAlpha(t > fly ? 1 - s : 0).setScale(0.6 + s * 1.2).setRotation(s * 2);
      },
    });
  }

  private stamp(x: number, y: number, label: string) {
    const red = label === '退件' ? '#c0392b' : '#c8372d';
    const seal = this.scene.add
      .text(x, y, label, { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: red, backgroundColor: '#fff4e8cc', padding: { x: 5, y: 2 } })
      .setOrigin(0.5)
      .setResolution(this.resolution)
      .setDepth(9e5)
      .setAngle(-8)
      .setAlpha(0);
    const ring = this.scene.add.rectangle(x, y, seal.width + 6, seal.height + 6).setStrokeStyle(2, 0xc8372d).setDepth(9e5).setAngle(-8).setAlpha(0);
    const tool = this.scene.add.image(x, y - 40, 'prop_stamp').setDepth(9e5 + 1);
    tool.setScale(26 / tool.width);
    this.live.push({
      t: 0, dur: 1.9, objs: [seal, ring, tool],
      update: (_k, t) => {
        const down = Math.min(1, t / 0.18);
        const up = Math.max(0, (t - 0.32) / 0.3);
        tool.setPosition(x, y - 40 * (1 - down) - 40 * up).setAlpha(1 - up);
        const shown = t > 0.18 ? 1 : 0;
        const fade = Math.max(0, (t - 1.4) / 0.5);
        const thump = t > 0.18 && t < 0.3 ? 1.25 - (t - 0.18) * 2 : 1;
        seal.setAlpha(shown * (1 - fade)).setScale(thump);
        ring.setAlpha(shown * (1 - fade)).setScale(thump);
      },
    });
  }

  private confetti(x: number, y: number) {
    const parts = Array.from({ length: 26 }, () => {
      const r = this.scene.add.rectangle(x, y, 6, 3.5, CONFETTI[Math.floor(this.rand() * CONFETTI.length)]).setDepth(9e5);
      return { r, vx: (this.rand() - 0.5) * 150, vy: -90 - this.rand() * 110, spin: (this.rand() - 0.5) * 20 };
    });
    this.live.push({
      t: 0, dur: 1.6, objs: parts.map((p) => p.r),
      update: (k, t) => {
        for (const p of parts) {
          p.r.setPosition(x + p.vx * t, y + p.vy * t + 160 * t * t).setRotation(p.spin * t).setAlpha(1 - k * k);
        }
      },
    });
  }
}
