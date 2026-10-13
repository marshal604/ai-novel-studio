# 重構規格：ai-novel-studio 流程

決策背景見 [workflow-review.md](workflow-review.md)。

## 目標
- 每個通過章節的花費與時間明顯下降（目標：章節成本比基準少 40% 以上）。
- 審查品質不退步：保留兩位獨立審查，全部 Sonnet。
- LLM 只做創作與判斷；log、registry、定稿、檢查交給腳本。
- `logs/activity.jsonl` 事件格式不變：`{timestamp, agent, type, content, to?, novel?}`，
  type ∈ `task | message | status | decision | meeting`，agent 用中文角色名。

## 不做
- 外部狀態機逐階段呼叫 `claude -p`（延後，先量測）。
- log run id / 去重（延後，維持 viewer 相容）。
- 像素辦公室 app（另一位 agent 製作，之後放 `office/`）。

## 每本小說的檔案
```
novels/{slug}/
  outline.md
  worldbuilding/world.md characters.md continuity.md
  briefs/chNN.md                     H總編 寫
  chapters/chNN.md                   H作家 寫（含 frontmatter）
  reviews/chNN.{critic|world}.rK.json  每位審查每輪一個
  reviews/chNN.resolution.json       H作家 修改回覆
  accepted.json                      studio accept 寫入（權威定稿紀錄）
```

## Tickets

### T1 事件 log 模組 + `studio log` / `studio meeting`
- 驗收：產生的事件只含 schema 欄位；非法 type 被拒；timestamp 帶本地時區；
  `meeting` 為每位出席者寫 `status: "meeting — {議題}"` 再加一筆 `meeting` 事件。

### T2 Hook：`studio hook`
- PostToolUse(Write|Edit)：依 `agent_type`（優先）或路徑判斷角色，寫 `task: 檔案更新: <name>`；略過 logs/ 內檔案。
- SubagentStart/SubagentStop：寫 `status: working` / `status: idle`，novel 取 `novels/.current`。
- 驗收：任何錯誤（含 stdin 讀取）都不讓 hook 失敗（exit 0）；檔案寫入找不到角色時歸 H總編；非辦公室 subagent（Explore 等）的 start/stop 不記錄。

### T3 章節檢查：`studio check <chapter>` 與 `studio sha <chapter>`
- frontmatter 必填：chapter、title、version、status（審查中|條件通過修改中|退件修改中|通過）、last_modified、changelog。
- 中文字數 1500-3000 以外只警告。sha 只計正文（frontmatter 改動不影響）。

### T4 審查驗證：`studio review <file>`
- 驗證審查 JSON：reviewer、chapter、round、chapter_sha、verdict、issues[id, severity, location, suggestion]、
  highlights、continuity_delta（world）、questions。驗證 resolution JSON。

### T5 開書：`studio new <slug> <title>` / `studio use <slug>`
- 建目錄與空白檔、registry 新增一列、寫 `novels/.current`、log task。重跑不重複 registry。

### T6 定稿：`studio accept <slug> <n> [--waive ids --reason 文字] [--canon-verified]`
- 擋下：check 錯誤；缺任一審查；審查檔的 reviewer / chapter / round 與檔名不符；round > 2；
  resolution 的 chapter 不符；最新輪仍有未豁免的 blocker / major（作家 fixed 不算，要 round 2 複核或豁免）；
  reject 但沒有可豁免的 issue；world 審查 sha 與正文不符且有 continuity_delta 卻沒 `--canon-verified`；`--waive` 沒附 `--reason`。
- 警告：minor 未修或被 declined（作家的創作判斷）、審查 sha 過期、豁免了不存在的 id。
- 成功：章節 status→通過、continuity.md 以 `<!-- chNN:start/end -->` 區段取代（delta 為空時移除舊區段）、
  registry 進度取已定稿的最大章、log decision、最後寫 accepted.json。同 sha 重跑直接 no-op（不再檢查 gate）。

### T7 量測：`studio metrics <stream.jsonl>`
- 從 stream-json 算：花費、tokens、主 session 重入次數、工具呼叫分佈、subagent 次數與 tokens、手寫 log 次數。

### T8 流程文件
- CLAUDE.md < 3KB，只寫 H總編 的流程與規則。
- `.claude/agents/{writer,worldbuilder,critic}.md`：frontmatter `model: sonnet`、tools 白名單、token 預算、輸入/輸出契約。
- `templates/brief.md`。settings.json：移除 agent-teams 與 debug hooks，改用 `studio hook`。

### T9 README（EN + 繁中）：運作方式、角色、模型、成本前後比較、如何跑一本小說。
