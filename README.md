# AI Novel Studio

## How it works
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

## Roles and models
| Role | Agent | Model | Does |
|------|-------|-------|------|
| H總編 editor | main session | Sonnet (`--model sonnet`) | outline, briefs, routing, adjudication, accept |
| H作家 writer | `writer` | Sonnet | drafts and revises chapters, answers review issues |
| H世觀 worldbuilder | `worldbuilder` | Sonnet | world/character setup once; consistency review + continuity delta |
| H讀者 critic | `critic` | Sonnet | reader-experience review |

No Opus anywhere. Haiku for the critic is an opt-in experiment only (change `model:` in `.claude/agents/critic.md` and compare on the same chapters).

## Cost profile
Measured with `node bin/studio.mjs metrics` on two headless Sonnet runs of the sample novel "羽球人生" (`novels/badminton-life`):

| | Old workflow (outline + worldbuilding + ch1) | New workflow (outline update + ch2) |
|---|---|---|
| Cost | $1.54 | **$0.87** (-43%) |
| Wall clock | 6m07s | **4m18s** (-30%) |
| Output tokens | 52.6k | 26.6k |
| Cache read / write | 3.04M / 238k | 1.04M / 174k |
| Editor re-entries | 11 | 7 (fixed since, see below) |
| Subagent runs / tokens | 12 / 608k | 6 / 150k |
| Tool calls | 67 | 50 |
| Hand-written log calls | 18 | 0 |
| Review rounds | 1 | 2 (both reviewers raised a major issue) |

The runs are not identical: the old one included a one-time worldbuilding setup, the new one did an extra review round.
Old cost split: editor orchestration 37%, worldbuilder 29%, writer 21%, critic 14%; the savings come from removing coordination
(standby agents, ack messages, polling, manual logging), not from cheaper models.

The validation run exposed that subagents were still backgrounded (7 editor re-entries). `.claude/settings.json` now sets
`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` (verified foreground) and the role agents set `omitClaudeMd: true`.
The remaining large cost is the main session's ~50k base context from Claude Code itself and user-level plugins.
Details: [docs/workflow-review.md](docs/workflow-review.md).

## Run a novel
```bash
cd ai-novel-studio
claude -p "開一本新小說《<書名>》slug=<slug>：<premise>。完成大綱、設定與第一章。" \
  --model sonnet --permission-mode acceptEdits \
  --allowedTools "Bash Read Write Edit Glob Grep Task" \
  --output-format stream-json --verbose > /tmp/novel-run.jsonl
node bin/studio.mjs metrics /tmp/novel-run.jsonl
```
Next chapter: same command with a prompt like `badminton-life 寫第三章`. Interactive `claude --model sonnet` works the same way.
If an invalid `ANTHROPIC_API_KEY` is set in your shell, prefix the command with `env -u ANTHROPIC_API_KEY`.

The sample novel `novels/badminton-life` has ch01 (imported from the old workflow with `studio import`) and ch02 (written by this workflow).

## CLI
```
node bin/studio.mjs new <slug> <title>      scaffold novel + registry row
node bin/studio.mjs use <slug>              switch current novel
node bin/studio.mjs log <agent> <type> <content> [--to X]
node bin/studio.mjs meeting <topic>         meeting-room event for all roles
node bin/studio.mjs check|sha <chapter.md>
node bin/studio.mjs review <file.json>
node bin/studio.mjs accept <slug> <n> [--waive C1 --reason ...] [--canon-verified]
node bin/studio.mjs import <slug> <n> --reason ...   chapter accepted by an earlier workflow
node bin/studio.mjs metrics <stream.jsonl>
npm test                                     node:test suite
```

## Activity log (for the office visualization)
`logs/activity.jsonl`, one JSON per line: `{timestamp, agent, type, content, to?, novel?}`,
`type` is `task | message | status | decision | meeting`, `agent` is the Chinese role name.
Hooks write file updates (`task`) and subagent `status` working/idle; scripts write meetings and decisions.
The pixel-office app will live in `office/`.

