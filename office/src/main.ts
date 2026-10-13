// Entry: picks LIVE / REPLAY / DEMO from the URL and wires Player + Phaser scene + HTML panel.
//   (no params)                 LIVE: tails logs/activity.jsonl through the dev server
//   ?replay=<slug>&speed=N      REPLAY one novel with compressed pacing
//   ?demo[&replay=<slug>]       frame-stepped replay for recording (window.__demo.advance)
import Phaser from 'phaser';
import './ui/style.css';
import { collapseBursts, currentNovel, forNovel, type ActivityEvent } from './core/events';
import { replayGaps, worldRate } from './core/pacing';
import { Player } from './core/player';
import { OfficeScene, dprOf } from './scene/OfficeScene';
import { Panel } from './ui/panel';
import { installDemo } from './demo/hook';
import type { NovelBundle, NovelInfo } from '../server/data';

const params = new URLSearchParams(location.search);
const demo = params.has('demo');
const speed = Math.max(0.25, Number(params.get('speed')) || 1);
// seconds the whole replay should last (a time-lapse of the real run)
const target = Math.max(10, Number(params.get('target')) || 80);

const panel = new Panel(document.getElementById('panel')!);
let novel: NovelBundle | null = null;
let player = new Player(7, worldRate(speed));
let replayTotal = 0;
let manual = false;
let live = false;

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return (await r.json()) as T;
}

const loadNovel = (slug: string) => getJson<NovelBundle>(`data/novel/${slug}.json`);

function showNovel(b: NovelBundle) {
  novel = b;
  panel.setNovel(b.title, b.chapters);
}

/** One sim step: release events, move the office, type the manuscript. */
function tick(dt: number) {
  const fresh = player.tick(dt);
  if (fresh.length) {
    panel.push(fresh);
    if (live && fresh.some((e) => /^檔案更新[:：]\s*ch/i.test(e.content)) && novel) void loadNovel(novel.slug).then(showNovel);
  }
  panel.board(player.board);
  panel.clock(player.clock, player.startTs);
  panel.tick(dt * worldRate(speed));
  if (replayTotal) panel.setProgress(replayTotal - player.remaining, replayTotal);
}

async function startReplay(slug: string) {
  const b = await loadNovel(slug);
  showNovel(b);
  const events = collapseBursts(b.events);
  replayTotal = events.length;
  // a time-lapse: people hurry between desks, but talking and reading keep their normal pace
  player.world.walkScale = 1.5;
  player.enqueue(events, replayGaps(events, { speed, target }));
  panel.setMode(`▶ 回放 ×${speed}`, false);
}

function startLive() {
  live = true;
  panel.setMode('● LIVE 即時', true);
  const src = new EventSource('data/stream');
  let slug: string | null = null;
  let history: ActivityEvent[] = [];
  // messages are handled strictly in order, even while a novel bundle is loading
  let chain = Promise.resolve();
  const later = (fn: () => Promise<void>) => {
    chain = chain.then(fn).catch((err: unknown) => panel.setMode(`○ LIVE 錯誤：${String(err)}`, true));
  };
  /** Follow the novel the team is on; a switch rebuilds the whiteboard from that novel's history. */
  const follow = async (fresh: ActivityEvent[]) => {
    const next = currentNovel(fresh);
    if (!next || next === slug) return;
    slug = next;
    showNovel(await loadNovel(next));
    player.prime(forNovel(history, next));
  };
  src.addEventListener('init', (m) => {
    const all = JSON.parse((m as MessageEvent<string>).data) as ActivityEvent[];
    later(async () => {
      player = new Player(7, 1);
      slug = null;
      history = all;
      await follow(all);
      panel.push((slug ? forNovel(all, slug) : all).slice(-25));
    });
  });
  src.addEventListener('events', (m) => {
    const fresh = JSON.parse((m as MessageEvent<string>).data) as ActivityEvent[];
    later(async () => {
      await follow(fresh);
      // collapse save bursts against recent history too: they arrive spread over several SSE messages
      const kept = new Set(collapseBursts([...history.slice(-50), ...fresh]));
      history = [...history, ...fresh];
      const mine = fresh.filter((e) => slug && e.novels.includes(slug) && kept.has(e));
      if (mine.length) player.enqueue(mine);
    });
  });
  src.onerror = () => panel.setMode('○ LIVE 連線中斷，重試中…', true);
  src.onopen = () => panel.setMode('● LIVE 即時', true);
}

async function boot() {
  const stage = document.getElementById('stage')!;
  // demo and the static build replay the newest novel unless ?replay= names one
  const newest = async () => (await getJson<NovelInfo[]>('data/novels.json')).at(-1)?.slug ?? null;
  const replay = params.get('replay') ?? (demo || !import.meta.env.DEV ? await newest() : null);
  if (replay) await startReplay(replay);
  else if (import.meta.env.DEV && !demo) startLive();
  else throw new Error('找不到小說：novels/ 是空的');

  const scene = new OfficeScene({
    get player() {
      return player;
    },
    title: () => novel?.title ?? '',
    totalChapters: () => novel?.chapters.length ?? 0,
    advance: (dt) => {
      if (manual) return 0;
      tick(dt);
      return dt * worldRate(speed);
    },
  });
  const dpr = dprOf();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: stage,
    backgroundColor: '#2b1f1a',
    antialias: true,
    scale: { mode: Phaser.Scale.NONE, width: stage.clientWidth * dpr, height: stage.clientHeight * dpr, zoom: 1 / dpr },
    scene,
  });
  addEventListener('resize', () => game.scale.resize(stage.clientWidth * dpr, stage.clientHeight * dpr));

  if (demo) {
    manual = true;
    // CSS animations run on the wall clock, not on stepped frames: switch them off for recording
    document.body.classList.add('demo');
    installDemo({
      game,
      step: (dt) => {
        tick(dt);
        scene.redraw(dt * worldRate(speed));
      },
      done: () => player.remaining === 0 && player.world.pending() === 0 && player.world.t - player.lastReleaseAt > 5,
    });
  }
}

void boot().catch((err: unknown) => {
  panel.setMode(`載入失敗：${err instanceof Error ? err.message : String(err)}`, false);
});
