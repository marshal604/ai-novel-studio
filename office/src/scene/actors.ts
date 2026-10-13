// Character sprites: frames chosen from sim time (not Phaser's clock) so frame-stepped recording is exact.
import Phaser from 'phaser';
import { ROLES, ROLE_COLOR, ROLE_NAME, type Role } from '../core/events';
import type { Actor } from '../core/world';
import { FONT } from './room';

export type Anchors = Record<Role, Record<string, { ox: number; oy: number }>>;

export const ROWS = ['walk_down', 'walk_up', 'walk_side', 'work', 'talk_down', 'talk_side', 'cheer', 'action'] as const;

/** Frames are authored at 2x the display size. */
const SCALE = 0.5;
const FPS: Record<string, number> = { walk: 8, work: 6, talk: 5, cheer: 7, action: 4 };

export function preloadActors(scene: Phaser.Scene) {
  for (const r of ROLES) for (const row of ROWS) for (let i = 0; i < 4; i++) scene.load.image(`${r}_${row}_${i}`, `assets/chars/${r}_${row}_${i}.png`);
  scene.load.json('anchors', 'assets/sprites.json');
}

interface View {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  tag: Phaser.GameObjects.Text;
  key: string;
  since: number;
}

/** Row and frame for the actor's current animation; static poses return a fixed frame. */
export function pose(a: Actor): { row: string; frame: number | null; flip: boolean } {
  const side = a.facing === 'left' || a.facing === 'right';
  const flip = a.facing === 'left';
  switch (a.anim) {
    case 'walk':
      return { row: side ? 'walk_side' : `walk_${a.facing}`, frame: null, flip };
    case 'talk':
      if (a.facing === 'up') return { row: 'walk_up', frame: 1, flip };
      return { row: side ? 'talk_side' : 'talk_down', frame: null, flip };
    case 'work':
    case 'cheer':
    case 'action':
      return { row: a.anim, frame: null, flip: false };
    default:
      if (a.facing === 'up') return { row: 'walk_up', frame: 1, flip };
      return { row: side ? 'talk_side' : 'talk_down', frame: 0, flip };
  }
}

export class ActorViews {
  private readonly views = new Map<Role, View>();

  constructor(
    scene: Phaser.Scene,
    private readonly anchors: Anchors,
    resolution: number,
  ) {
    for (const r of ROLES) {
      const shadow = scene.add.ellipse(0, 0, 30, 9, 0x2a160b, 0.28);
      const sprite = scene.add.image(0, 0, `${r}_talk_down_0`).setScale(SCALE);
      const tag = scene.add
        .text(0, 0, ROLE_NAME[r], {
          fontFamily: FONT, fontSize: '10px', fontStyle: 'bold', color: '#ffffff', backgroundColor: ROLE_COLOR[r], padding: { x: 4, y: 1 },
        })
        .setOrigin(0.5, 0)
        .setResolution(resolution)
        .setAlpha(0.92);
      this.views.set(r, { sprite, shadow, tag, key: '', since: 0 });
    }
  }

  sync(actors: Record<Role, Actor>, t: number) {
    for (const r of ROLES) {
      const a = actors[r];
      const v = this.views.get(r)!;
      const p = pose(a);
      const key = `${a.anim}:${p.row}`;
      if (key !== v.key) {
        v.key = key;
        v.since = t;
      }
      const fps = FPS[a.anim] ?? 0;
      const frame = p.frame ?? Math.floor((t - v.since) * fps) % 4;
      const tex = `${r}_${p.row}_${frame}`;
      const anchor = this.anchors[r]?.[p.row] ?? { ox: 0.5, oy: 1 };
      v.sprite.setTexture(tex).setOrigin(anchor.ox, anchor.oy).setFlipX(p.flip);
      // cheering hops a little (the frames do too, but a tiny bounce sells it)
      const hop = a.anim === 'cheer' ? Math.abs(Math.sin((t - v.since) * 9)) * 3 : 0;
      v.sprite.setPosition(a.x, a.y - hop).setDepth(a.y);
      v.shadow.setPosition(a.x, a.y - 1).setDepth(a.y - 0.5);
      v.tag.setPosition(a.x, a.y + 3).setDepth(1e5 + a.y);
    }
  }

  head(r: Role) {
    const v = this.views.get(r)!;
    return { x: v.sprite.x, y: v.sprite.y - 60 };
  }
}
