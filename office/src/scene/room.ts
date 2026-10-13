// Static room: procedural floor and wall textures (drawn at 2x like the sprites), rugs, furniture, signs.
import Phaser from 'phaser';
import { FURNITURE, MAP_H, MAP_W, RUGS, TILE, WALL_ROWS } from '../core/office';

export const FONT = '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.getContext());
  tex.refresh();
}

/** 2x textures: one 64x64 floor tile of warm planks, one wall strip with wainscot. */
function makeTextures(scene: Phaser.Scene) {
  canvasTexture(scene, 'floor', 64, 64, (c) => {
    const planks = ['#b98656', '#b07d4e', '#bf8c5b', '#ad7a4b'];
    for (let i = 0; i < 4; i++) {
      c.fillStyle = planks[i];
      c.fillRect(0, i * 16, 64, 16);
      c.fillStyle = 'rgba(80,45,20,0.55)';
      c.fillRect(0, i * 16 + 15, 64, 1);
      // staggered plank joints
      c.fillRect(((i * 37) % 64) | 0, i * 16, 1, 15);
      c.fillStyle = 'rgba(255,230,190,0.18)';
      c.fillRect(0, i * 16, 64, 1);
      c.fillStyle = 'rgba(90,50,20,0.12)';
      for (let k = 0; k < 6; k++) c.fillRect((i * 13 + k * 11) % 64, i * 16 + 4 + (k % 3) * 3, 6, 1);
    }
  });
  const wallH = WALL_ROWS * TILE * 2;
  canvasTexture(scene, 'wall', 64, wallH, (c) => {
    c.fillStyle = '#efe0c4';
    c.fillRect(0, 0, 64, wallH);
    c.fillStyle = '#e6d3b2';
    for (let x = 0; x < 64; x += 16) c.fillRect(x, 0, 8, wallH);
    c.fillStyle = '#9a6a42';
    c.fillRect(0, wallH - 58, 64, 58);
    c.fillStyle = '#86593a';
    for (let x = 0; x < 64; x += 32) c.fillRect(x + 4, wallH - 50, 24, 38);
    c.fillStyle = '#6b4329';
    c.fillRect(0, wallH - 60, 64, 4);
    c.fillRect(0, wallH - 8, 64, 8);
    c.fillStyle = '#c99e72';
    c.fillRect(0, 0, 64, 6);
  });
}

export function drawRoom(scene: Phaser.Scene) {
  makeTextures(scene);
  // outside the room (visible on wide windows): dim dark wood
  scene.add.rectangle(MAP_W / 2, MAP_H / 2, MAP_W + 2000, MAP_H + 2000, 0x2b1f1a).setDepth(-3000);
  scene.add.tileSprite(0, WALL_ROWS * TILE, MAP_W, MAP_H - WALL_ROWS * TILE, 'floor').setOrigin(0, 0).setTileScale(0.5).setDepth(-2000);
  scene.add.tileSprite(0, 0, MAP_W, WALL_ROWS * TILE, 'wall').setOrigin(0, 0).setTileScale(0.5).setDepth(-1900);
  // side and bottom walls: thin dark trim so the room reads as a box
  const trim = scene.add.graphics().setDepth(1e5 - 10);
  trim.fillStyle(0x5a3a26).fillRect(0, 0, TILE * 0.5, MAP_H).fillRect(MAP_W - TILE * 0.5, 0, TILE * 0.5, MAP_H);
  trim.fillStyle(0x6b4329).fillRect(0, MAP_H - 10, MAP_W, 10);
  // soft shadow where floor meets wall
  scene.add.rectangle(MAP_W / 2, WALL_ROWS * TILE + 4, MAP_W, 8, 0x3a2414, 0.25).setDepth(-1800);

  for (const r of RUGS) drawRug(scene, r.x, r.y, r.w, r.h, r.color, r.label);
  for (const f of FURNITURE) {
    const key = `prop_${f.sprite}`;
    if (!scene.textures.exists(key)) continue;
    const bottom = (f.y + f.h) * TILE - (f.lift ?? 0);
    const img = scene.add.image((f.x + f.w / 2) * TILE, bottom, key).setOrigin(0.5, 1);
    img.setScale(f.width / img.width);
    img.setDepth(f.wall ? -1500 + f.x : f.floor ? -1200 : bottom);
  }
}

function drawRug(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color: number, label: string) {
  const px = x * TILE + 4;
  const py = y * TILE + 4;
  const pw = w * TILE - 8;
  const ph = h * TILE - 8;
  if (w && h) {
    const g = scene.add.graphics().setDepth(-1300);
    const light = Phaser.Display.Color.IntegerToColor(color).lighten(18).color;
    g.fillStyle(0x2a160b, 0.25).fillRect(px + 2, py + 3, pw, ph);
    g.fillStyle(color, 1).fillRect(px, py, pw, ph);
    g.lineStyle(2, light, 1).strokeRect(px + 5, py + 5, pw - 10, ph - 10);
    g.fillStyle(light, 0.55);
    for (let i = px + 14; i < px + pw - 12; i += 12) for (let j = py + 14; j < py + ph - 12; j += 12) g.fillRect(i, j, 2, 2);
    // fringe on the short sides
    g.fillStyle(0xefe0c4, 0.9);
    for (let j = py + 2; j < py + ph - 2; j += 4) g.fillRect(px - 3, j, 3, 2).fillRect(px + pw, j, 3, 2);
  }
  scene.add
    .text(px + 6, py + ph - 6, label, { fontFamily: FONT, fontSize: '11px', color: '#fff6e6', backgroundColor: '#3a2416cc', padding: { x: 5, y: 2 } })
    .setOrigin(0, 1)
    .setDepth(-1250);
}
