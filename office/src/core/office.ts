// The office floor plan: furniture, solid footprints and the named spots characters walk to. Pure data.
import { Grid, type Tile } from './grid';
import type { Role } from './events';

export const TILE = 32;
export const COLS = 28;
export const ROWS = 21;
/** rows 0..WALL_ROWS-1 are the back wall */
export const WALL_ROWS = 3;
export const MAP_W = COLS * TILE;
export const MAP_H = ROWS * TILE;

export type Facing = 'down' | 'up' | 'left' | 'right';

export interface Spot extends Tile {
  face: Facing;
}

export interface Furniture {
  sprite: string;
  /** footprint (tiles): solid unless `walkable` */
  x: number;
  y: number;
  w: number;
  h: number;
  /** display width in world px; height follows the texture's aspect */
  width: number;
  /** hung on the back wall: drawn behind everything, no footprint */
  wall?: boolean;
  walkable?: boolean;
  /** lying on the floor (rugs): drawn under everything, walkable */
  floor?: boolean;
  /** extra px to lift the sprite above the footprint bottom (also lowers its depth) */
  lift?: number;
}

export const FURNITURE: readonly Furniture[] = [
  // back wall
  { sprite: 'window', x: 9, y: 2, w: 2, h: 1, width: 66, wall: true, lift: 6 },
  { sprite: 'window', x: 16, y: 2, w: 2, h: 1, width: 66, wall: true, lift: 6 },
  { sprite: 'window', x: 23, y: 2, w: 2, h: 1, width: 66, wall: true, lift: 6 },
  { sprite: 'clock', x: 15, y: 1, w: 1, h: 1, width: 34, wall: true, lift: -4 },
  { sprite: 'cork_board', x: 2, y: 2, w: 3, h: 1, width: 76, wall: true, lift: 10 },
  { sprite: 'painting', x: 19, y: 2, w: 3, h: 1, width: 62, wall: true, lift: 14 },
  // 總編室
  { sprite: 'certificate', x: 5, y: 2, w: 1, h: 1, width: 30, wall: true, lift: 20 },
  { sprite: 'chair_editor', x: 4, y: 4, w: 1, h: 1, width: 34, walkable: true, lift: 20 },
  { sprite: 'desk_exec', x: 2, y: 5, w: 4, h: 1, width: 128 },
  { sprite: 'filing_cabinet', x: 1, y: 3, w: 1, h: 1, width: 32 },
  { sprite: 'manuscript_shelf', x: 6, y: 3, w: 3, h: 1, width: 96 },
  { sprite: 'plant', x: 7, y: 8, w: 1, h: 1, width: 40 },
  // center: whiteboard + meeting table
  { sprite: 'whiteboard', x: 12, y: 3, w: 3, h: 1, width: 104 },
  { sprite: 'meeting_table_rect', x: 11, y: 9, w: 5, h: 3, width: 164, lift: -4 },
  { sprite: 'succulent', x: 18, y: 3, w: 1, h: 1, width: 22 },
  // 寫作區
  { sprite: 'chair_front', x: 22, y: 4, w: 1, h: 1, width: 36, walkable: true, lift: 20 },
  { sprite: 'desk_writer', x: 20, y: 5, w: 4, h: 1, width: 124 },
  { sprite: 'trash_bin', x: 24, y: 6, w: 1, h: 1, width: 24 },
  { sprite: 'coat_rack', x: 26, y: 3, w: 1, h: 1, width: 34 },
  { sprite: 'fern', x: 26, y: 8, w: 1, h: 1, width: 40 },
  // 世界觀圖書館
  { sprite: 'bookshelf_b', x: 19, y: 12, w: 2, h: 1, width: 64 },
  { sprite: 'tall_bookcase', x: 22, y: 12, w: 2, h: 1, width: 64 },
  { sprite: 'bookshelf_c', x: 25, y: 12, w: 2, h: 1, width: 64 },
  { sprite: 'chair_world', x: 22, y: 15, w: 1, h: 1, width: 32, walkable: true, lift: 20 },
  { sprite: 'desk_library', x: 20, y: 16, w: 4, h: 1, width: 124 },
  { sprite: 'scroll_crate', x: 25, y: 17, w: 1, h: 1, width: 36 },
  { sprite: 'book_stack', x: 26, y: 15, w: 1, h: 1, width: 28 },
  // 閱讀角
  { sprite: 'rug_round', x: 2, y: 14, w: 4, h: 4, width: 120, floor: true },
  { sprite: 'tall_bookcase', x: 1, y: 12, w: 2, h: 1, width: 62 },
  { sprite: 'floor_lamp', x: 1, y: 15, w: 1, h: 1, width: 30 },
  { sprite: 'armchair', x: 2, y: 15, w: 2, h: 2, width: 64 },
  { sprite: 'side_table', x: 4, y: 16, w: 1, h: 1, width: 34 },
  { sprite: 'record_player', x: 6, y: 13, w: 1, h: 1, width: 38 },
  { sprite: 'sofa', x: 2, y: 19, w: 3, h: 1, width: 92 },
  { sprite: 'dog_bed', x: 7, y: 18, w: 2, h: 1, width: 58 },
  // 茶水間
  { sprite: 'coffee_counter', x: 12, y: 18, w: 3, h: 2, width: 100 },
  { sprite: 'water_cooler', x: 15, y: 18, w: 1, h: 2, width: 32 },
  { sprite: 'plant', x: 10, y: 18, w: 1, h: 2, width: 40 },
];

export interface Rug {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  label: string;
}

export const RUGS: readonly Rug[] = [
  { x: 1, y: 3, w: 7, h: 5, color: 0x8e3b33, label: '總編室' },
  { x: 19, y: 3, w: 7, h: 5, color: 0xa8742c, label: '寫作區' },
  { x: 10, y: 8, w: 7, h: 5, color: 0x4f6a8c, label: '會議桌' },
  { x: 19, y: 14, w: 7, h: 5, color: 0x3f6f4a, label: '世界觀圖書館' },
  { x: 4, y: 14, w: 0, h: 0, color: 0x6a548f, label: '閱讀角' },
];

export interface RoleSpots {
  work: Spot;
  meeting: Spot;
  /** animation used while working at the spot */
  workAnim: 'work' | 'action';
}

export const SPOTS: Record<Role, RoleSpots> = {
  editor: { work: { x: 4, y: 4, face: 'down' }, meeting: { x: 10, y: 10, face: 'right' }, workAnim: 'work' },
  writer: { work: { x: 22, y: 4, face: 'down' }, meeting: { x: 12, y: 8, face: 'down' }, workAnim: 'work' },
  world: { work: { x: 22, y: 15, face: 'down' }, meeting: { x: 14, y: 8, face: 'down' }, workAnim: 'work' },
  reader: { work: { x: 5, y: 17, face: 'down' }, meeting: { x: 16, y: 10, face: 'left' }, workAnim: 'action' },
};

/** where an announcement to everyone is made */
export const ANNOUNCE: Spot = { x: 13, y: 6, face: 'down' };

/** ambient idle destinations; `anim` plays on arrival */
export const AMBIENT: readonly (Spot & { name: string; anim: 'sip' | 'cheer' | 'idle' })[] = [
  { name: '倒杯咖啡', x: 13, y: 17, face: 'down', anim: 'sip' },
  { name: '看看窗外', x: 10, y: 3, face: 'up', anim: 'idle' },
  { name: '看看窗外', x: 17, y: 3, face: 'up', anim: 'idle' },
  { name: '摸摸柴犬', x: 9, y: 18, face: 'left', anim: 'idle' },
  { name: '伸個懶腰', x: -1, y: -1, face: 'down', anim: 'cheer' },
  { name: '找本參考書', x: 23, y: 13, face: 'up', anim: 'idle' },
  { name: '翻翻稿件', x: 7, y: 4, face: 'up', anim: 'idle' },
  { name: '看看白板', x: 13, y: 4, face: 'up', anim: 'idle' },
];

/** where to stand to read from the manuscript shelf, the library shelves or the whiteboard */
export const PLACES: Record<'shelf' | 'library' | 'board', readonly Spot[]> = {
  shelf: [{ x: 7, y: 4, face: 'up' }, { x: 6, y: 4, face: 'up' }, { x: 8, y: 4, face: 'up' }],
  library: [{ x: 20, y: 13, face: 'up' }, { x: 23, y: 13, face: 'up' }, { x: 26, y: 13, face: 'up' }, { x: 19, y: 13, face: 'up' }],
  board: [{ x: 13, y: 4, face: 'up' }, { x: 12, y: 4, face: 'up' }, { x: 14, y: 4, face: 'up' }],
};

/** fly targets for paper FX, world px */
export const SHELF = { x: 7.5 * TILE, y: 3 * TILE };
export const LIBRARY = { x: 23 * TILE, y: 12 * TILE };
export const BOARD = { x: 13.5 * TILE, y: 2.6 * TILE };

export function buildGrid(): Grid {
  const g = new Grid(COLS, ROWS);
  g.block(0, 0, COLS, WALL_ROWS);
  g.block(0, 0, 1, ROWS);
  g.block(COLS - 1, 0, 1, ROWS);
  for (const f of FURNITURE) if (!f.wall && !f.walkable && !f.floor) g.block(f.x, f.y, f.w, f.h);
  return g;
}

export const tileCenter = (t: Tile) => ({ x: (t.x + 0.5) * TILE, y: (t.y + 0.5) * TILE });
export const tileOf = (x: number, y: number): Tile => ({ x: Math.floor(x / TILE), y: Math.floor(y / TILE) });
