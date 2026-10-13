// Side panel (HTML overlay): novel, chapter, a typewriter manuscript view and the activity feed.
import { ROLE_COLOR, ROLE_NAME, chapterLabel, chapterOf, type ActivityEvent } from '../core/events';
import type { Board } from '../core/player';
import type { Chapter } from '../../server/data';

const TYPE_CPS = 42;
const FEED_MAX = 40;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = '') => {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  return e;
};

const TYPE_LABEL: Record<string, string> = { task: '任務', message: '對話', status: '狀態', decision: '裁決', meeting: '會議', reject: '退件' };

const STATUS_WORD: Record<string, string> = { working: '工作中', reviewing: '審稿中', idle: '待命', meeting: '開會' };

/** "working — 撰寫第一章" -> "工作中：撰寫第一章" (the log's status keywords are English) */
function statusText(content: string) {
  const m = /^\s*(working|reviewing|idle|meeting)\b\s*(?:[—–-]+\s*(.*))?$/is.exec(content);
  if (!m) return content;
  const word = STATUS_WORD[m[1].toLowerCase()];
  return m[2] ? `${word}：${m[2]}` : word;
}

function timeOf(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' });
}

export class Panel {
  private readonly mode = el('div', 'mode');
  private readonly title = el('h1', 'title');
  private readonly sub = el('div', 'sub');
  private readonly time = el('div', 'clock');
  private timeShown = '';
  private readonly bar = el('div', 'bar');
  private readonly msName = el('div', 'ms-name');
  private readonly msText = el('div', 'ms-text');
  private readonly feed = el('ol', 'feed');
  private chapters: Chapter[] = [];
  private shown: Chapter | null = null;
  private typed = 0;
  private typedShown = -1;

  constructor(root: HTMLElement) {
    const head = el('header', 'head');
    const progress = el('div', 'progress');
    progress.append(this.bar);
    head.append(this.mode, this.title, this.sub, this.time, progress);
    const ms = el('section', 'ms');
    const msHead = el('h2', '', '稿件');
    msHead.append(this.msName);
    const paper = el('div', 'paper');
    paper.append(this.msText);
    ms.append(msHead, paper);
    const fs = el('section', 'activity');
    fs.append(el('h2', '', '辦公室動態'), this.feed);
    root.append(head, ms, fs);
    this.msText.textContent = '（尚未有章節，團隊正在籌備大綱與設定…）';
  }

  setMode(text: string, live: boolean) {
    this.mode.textContent = text;
    this.mode.classList.toggle('live', live);
  }

  setNovel(title: string, chapters: Chapter[]) {
    const switched = this.title.textContent !== `《${title}》`;
    this.title.textContent = `《${title}》`;
    this.chapters = chapters;
    if (switched) {
      this.shown = null;
      this.typedShown = -1;
      this.msName.textContent = '';
      this.msText.textContent = '（尚未有章節，團隊正在籌備大綱與設定…）';
    } else if (this.shown) this.shown = chapters.find((c) => c.file === this.shown!.file) ?? this.shown;
  }

  setProgress(done: number, total: number) {
    this.bar.style.width = total ? `${(100 * done) / total}%` : '0';
  }

  board(b: Board) {
    const ch = b.manuscript ? this.chapters.find((c) => c.file === b.manuscript) : null;
    const current = this.chapters.find((c) => chapterOf(c.file) === b.chapter);
    const name = current?.title ? `${chapterLabel(b.chapter)}「${current.title}」` : chapterLabel(b.chapter);
    this.sub.textContent = `${name} · ${b.phase}${b.approved.length ? ` · 已定稿 ${b.approved.length} 章` : ''}`;
    if (ch && ch.file !== this.shown?.file) {
      this.shown = ch;
      this.typed = 0;
      this.msName.textContent = ch.file;
    }
  }

  /** The run's own clock (when the team actually did this) and how long they have been at it. */
  clock(now: number | null, start: number | null) {
    if (now === null || start === null) return;
    const hms = new Date(now).toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' });
    const secs = Math.max(0, Math.floor((now - start) / 1000));
    const text = `${hms}  ·  已工作 ${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    if (text === this.timeShown) return;
    this.timeShown = text;
    this.time.textContent = text;
  }

  push(events: readonly ActivityEvent[]) {
    // reads are shown as walks to the shelf; listing each one would drown the conversation
    for (const e of events.filter((x) => !/^查閱[:：]/.test(x.content))) {
      const li = el('li', `item t-${e.type}`);
      const chip = el('span', 'chip', ROLE_NAME[e.agent]);
      chip.style.background = ROLE_COLOR[e.agent];
      const meta = el('span', 'meta', `${TYPE_LABEL[e.type] ?? e.type}${timeOf(e.timestamp) ? ` · ${timeOf(e.timestamp)}` : ''}`);
      const shown = e.type === 'status' ? statusText(e.content) : e.content;
      const text = el('div', 'text', shown.length > 90 ? `${shown.slice(0, 89)}…` : shown);
      li.append(chip, meta, text);
      this.feed.prepend(li);
    }
    while (this.feed.children.length > FEED_MAX) this.feed.lastElementChild?.remove();
  }

  /** Typewriter for the manuscript, driven by sim dt. */
  tick(dt: number) {
    if (!this.shown) return;
    this.typed = Math.min(this.shown.text.length, this.typed + dt * TYPE_CPS);
    const n = Math.floor(this.typed);
    if (n === this.typedShown) return;
    this.typedShown = n;
    // ponytail: only the last ~1600 chars are kept in the DOM; the view is a "live writing" peek, not a reader
    const start = Math.max(0, n - 1600);
    this.msText.textContent = (start ? '…' : '') + this.shown.text.slice(start, n).replace(/^#+\s*/gm, '');
    this.msText.classList.toggle('done', n >= this.shown.text.length);
    this.msText.parentElement!.scrollTop = this.msText.parentElement!.scrollHeight;
  }
}
