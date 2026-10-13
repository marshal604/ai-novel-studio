# AI Novel Studio

[English](#english) | [繁體中文](#繁體中文)

## English

### How it works
A four-role "editorial office" writes Traditional Chinese novels inside Claude Code.
The main session is the editor-in-chief; the other three roles are one-shot custom subagents in `.claude/agents/`.
LLMs only write and judge. Logging, registry updates, chapter checks and acceptance are done by a zero-dependency Node CLI (`bin/studio.mjs`).

Per chapter:
```
editor brief ──> writer draft (+ self-check) ──> studio check / sha
                                                     │
                          ┌──────────── parallel ────┴────────────┐
                          critic (reader experience)   worldbuilder (consistency)
                          reviews/chNN.critic.r1.json  reviews/chNN.world.r1.json
                          └──────────────────┬────────────────────┘
       writer revision + resolution.json <── issues?
       round 2 by the reviewer who raised a major/blocker (max 2 rounds, then editor waives or holds)
                                             │
                                  studio accept (gated, idempotent)
```

### Roles and models
| Role | Agent | Model | Does |
|------|-------|-------|------|
| H總編 editor | main session | Sonnet (`--model sonnet`) | outline, briefs, routing, adjudication, accept |
| H作家 writer | `writer` | Sonnet | drafts and revises chapters, answers review issues |
| H世觀 worldbuilder | `worldbuilder` | Sonnet | world/character setup once; consistency review + continuity delta |
| H讀者 critic | `critic` | Sonnet | reader-experience review |

No Opus anywhere. Haiku for the critic is an opt-in experiment only (change `model:` in `.claude/agents/critic.md` and compare on the same chapters).

### Cost profile
Baseline: the old workflow on the novel "羽球人生" (outline + worldbuilding + chapter 1, ~2,500 Han chars, Sonnet):

| | Old (measured) | New (estimate, not yet measured) |
|---|---|---|
| Cost | $1.54 | ~$0.85 first chapter incl. setup, ~$0.65 per later chapter |
| Wall clock | 6m07s | ~3.5-4.5 min |
| Editor re-entries | 11 (each ~70k context) | 0 (foreground calls) |
| Subagent runs | 12 (608k tokens, ~35% ceremony) | 5-7 |
| Hand-written log calls | 18 of 67 tool calls | 0 |
| Prompt docs (CLAUDE.md + roles) | 22 KB | 10 KB |

Where the old money went: editor orchestration 37%, worldbuilder 29%, writer 21%, critic 14%.
The savings come from removing coordination (standby agents, ack messages, polling, re-entries, manual logs), not from cheaper models.
Verify with `node bin/studio.mjs metrics <run.jsonl>` after a real run. Details: [docs/workflow-review.md](docs/workflow-review.md).

### Run a novel
```bash
cd ai-novel-studio
claude -p "開一本新小說《羽球人生》slug=badminton-life：現代台灣、溫暖熱血帶幽默的羽球故事。完成大綱、設定與第一章。" \
  --model sonnet --output-format stream-json --verbose > /tmp/novel-run.jsonl
node bin/studio.mjs metrics /tmp/novel-run.jsonl
```
Next chapter: `claude -p "badminton-life 寫第二章" --model sonnet`. Interactive `claude --model sonnet` works the same way.

### CLI
```
node bin/studio.mjs new <slug> <title>      scaffold novel + registry row
node bin/studio.mjs use <slug>              switch current novel
node bin/studio.mjs log <agent> <type> <content> [--to X]
node bin/studio.mjs meeting <topic>         meeting-room event for all roles
node bin/studio.mjs check|sha <chapter.md>
node bin/studio.mjs review <file.json>
node bin/studio.mjs accept <slug> <n> [--waive C1 --reason ...] [--canon-verified]
node bin/studio.mjs metrics <stream.jsonl>
npm test                                     node:test suite
```

### Activity log (for the office visualization)
`logs/activity.jsonl`, one JSON per line: `{timestamp, agent, type, content, to?, novel?}`,
`type` is `task | message | status | decision | meeting`, `agent` is the Chinese role name.
Hooks write file updates (`task`) and subagent `status` working/idle; scripts write meetings and decisions.
The pixel-office app will live in `office/`.

---

## 繁體中文

### 運作方式
四個角色的「編輯辦公室」在 Claude Code 裡寫繁體中文小說。
主 session 是 H總編，其他三位是 `.claude/agents/` 的一次性 subagent。
LLM 只負責寫作與判斷；log、registry、章節檢查、定稿交給零依賴的 Node CLI（`bin/studio.mjs`）。

每章流程：H總編 寫 brief → H作家 寫稿並自我檢查 → `studio check` / `sha` →
H讀者 與 H世觀 **並行**審查，各寫一個 JSON → 有 issue 時 H作家 修改並寫 resolution →
有 major / blocker 由提出的審查者做 round 2（最多 2 輪，之後 H總編 豁免或擱置）→ `studio accept` 定稿。

### 角色與模型
| 角色 | Agent | 模型 | 工作 |
|------|-------|------|------|
| H總編 | 主 session | Sonnet | 大綱、brief、分派、裁決、定稿 |
| H作家 | `writer` | Sonnet | 寫稿、改稿、回覆審查 |
| H世觀 | `worldbuilder` | Sonnet | 開書時建設定；設定一致性審查與 continuity 變更 |
| H讀者 | `critic` | Sonnet | 讀者體驗審查 |

不使用 Opus。H讀者 改 Haiku 只當實驗（改 `.claude/agents/critic.md` 的 `model:`，用同樣章節比較）。

### 成本
基準：舊流程寫《羽球人生》大綱 + 設定 + 第一章（約 2500 字，Sonnet）。

| | 舊（實測） | 新（估計，尚未實測） |
|---|---|---|
| 花費 | US$1.54 | 第一章含設定約 $0.85，之後每章約 $0.65 |
| 時間 | 6 分 07 秒 | 約 3.5-4.5 分 |
| H總編 被喚醒 | 11 次（每次約 70k context） | 0（前景呼叫） |
| subagent 執行 | 12 次（608k tokens，約 35% 是儀式） | 5-7 次 |
| 手寫 log | 67 次工具呼叫中 18 次 | 0 |
| 流程文件 | 22 KB | 10 KB |

舊流程花費分布：H總編 協調 37%、H世觀 29%、H作家 21%、H讀者 14%。
省下的錢來自砍掉協調成本（待命 agent、回覆「收到」、輪詢、重入、手寫 log），不是換便宜模型。
實際跑一次後用 `node bin/studio.mjs metrics <run.jsonl>` 驗證。完整分析見 [docs/workflow-review.md](docs/workflow-review.md)。

### 寫一本小說
```bash
cd ai-novel-studio
claude -p "開一本新小說《羽球人生》slug=badminton-life：現代台灣、溫暖熱血帶幽默的羽球故事。完成大綱、設定與第一章。" \
  --model sonnet --output-format stream-json --verbose > /tmp/novel-run.jsonl
node bin/studio.mjs metrics /tmp/novel-run.jsonl
```
下一章：`claude -p "badminton-life 寫第二章" --model sonnet`。互動模式 `claude --model sonnet` 也一樣。

### 活動日誌
`logs/activity.jsonl` 每行一筆：`{timestamp, agent, type, content, to?, novel?}`，
type 為 `task | message | status | decision | meeting`，agent 用中文角色名。
hook 自動記錄檔案更新與 subagent 的 working / idle，腳本記錄會議與裁決。像素辦公室 app 之後放在 `office/`。
