# 小說流程檢討（2026-10-14）

對象：agent-team-lab 的「小說編輯辦公室」流程（CLAUDE.md + agents/*.md + hooks），
以《羽球人生》（badminton-life）第一次執行為基準量測。

## 1. 基準量測（baseline）

執行：`claude -p ... --model sonnet`，產出 大綱 + 世界觀 4 檔 + 第一章（約 2500 字，v2 通過）。
資料來源：stream-json transcript + session/subagent jsonl。

| 指標 | 數值 |
|------|------|
| 牆鐘時間 | 6 分 07 秒 |
| 總花費 | US$1.54（全部 Sonnet） |
| output tokens | 52.6k（章節本身約 3-4k，約 7%） |
| cache read / cache write | 3.04M / 238k |
| H總編 被背景通知喚醒次數 | 11 次（每次重讀約 70k context） |
| subagent 執行次數 | 12 次，共 608k tokens（每次喚醒基本成本約 36k） |
| 工具呼叫 | 67 次：手寫 log 18 次（27%）、SendMessage 18 次、sleep 輪詢 2 次 |
| 修改迴圈 | 1 輪（兩位審查都條件通過，無重審） |

花費分攤（依 token 推估）：H總編 37%、H世觀 29%、H作家 21%、H讀者 14%。

### 浪費在哪
- **儀式性喚醒**：「待命、讀大綱、記一筆 idle」、「收到」、「謝謝，已記錄」這類 run 約 5 次、210k tokens（subagent 的 35%），對成品零貢獻。
- **H總編 重入**：背景 subagent 每完成一次就喚醒主 session，11 次重讀整個 context。協調成本比任何一位創作者都高。
- **手寫 log**：每個角色每一步都自己組 JSON 寫 activity.jsonl，佔 27% 工具呼叫，且時間格式不一。
- **輪詢**：H作家 用 `sleep 20` 迴圈等審查檔出現。
- **模擬會議**：kickoff 會議是 H總編 自己寫 log 演出來的，沒有實際討論。
- **規則不可執行**：CLAUDE.md 強制 teammate 模式，但 headless 模式沒有這個能力，實際退回 Agent + SendMessage。

### 有價值、要保留的
- 兩位審查都抓到真問題：H讀者 5 點具體建議；H世觀 逐分推演比分，抓到「球從網底飛起來」物理錯誤與道具來源矛盾。
- 條件通過不重審的規則讓迴圈只跑一輪。
- 世界觀 + continuity.md 的分工。

## 2. 與 Codex 討論

用 `codex exec -s read-only` 兩輪。

### 第一輪：我的提案
1. 改成 H總編 驅動的固定流程：前景、一次性的 custom subagent（`.claude/agents/*.md` 帶 `model:`），不用 SendMessage、不留待命 agent、兩個審查並行。
2. 模型：H總編 / H作家 / H世觀設定 用 Sonnet；兩個審查用 Haiku；不用 Opus。
3. log 交給腳本與 hook（PostToolUse、SubagentStart/Stop），會議改成一筆腳本事件。
4. context 紀律：約 300 字的章節 brief，H作家 只讀 brief + 角色語氣表 + continuity + 前章結尾。
5. 結構化審查：JSON verdict + issues，取消三明治回饋。
6. 停止規則：最多 1 輪修改；第二次退件由 H總編 直接放行。
7. 零依賴 Node 腳本：new / check / review / metrics。

### 第一輪：Codex 批評（重點）
- 刪儀式是對的，但**證據不支持換便宜的審查模型**。H讀者 只佔約 $0.22，全砍也只省 14%；H世觀 逐分推演證明需要推理能力。先改協調、再改模型，才知道品質退步是誰造成的。
- 不要完全取消對話：保留一個有上限的「問題回報」管道（worker 回報問題、證據、選項，H總編 裁決）。
- 300 字 brief 是目標不是上限；要包含 POV、情緒轉折、必要情節、禁止揭露、相關設定。前章 800 字只保證銜接，不保證記憶。
- H讀者 應先讀章節再讀 brief，否則會把意圖當成文字已達成。
- 每位審查一個 JSON 檔，避免並行追加互相覆蓋；issue 要有 id、位置、證據。
- 「第二次退件就放行」不行：改成 H總編 裁決（接受 / 明確豁免 / 擱置並回報人類）。
- 定稿要「交易式」：章節、continuity、registry 一起提交，且可重跑。
- CLAUDE.md 會被 subagent 一起載入，要縮短。
- 量測要看「每個通過章節的成本」，分開設定成本與章節成本。

### 第二輪：我的回應
接受：三位創作角色都用 Sonnet（Haiku 只當 opt-in 實驗）；問題回報管道；brief 模板；H讀者 先讀章節；作家自我檢查；每位審查每輪一個 JSON；最多 2 輪審查 + H總編 裁決；`studio accept` 腳本；字數只警告；CLAUDE.md < 3KB。
延後：外部 Node 狀態機逐階段呼叫 `claude -p`（前景並行 Agent 已解決重入成本，外部 orchestrator 讓零件加倍）；log 加 run id；設定/章節分開量測（改成分開執行）。
保留：每章一筆「brief 交接」meeting 事件（辦公室畫面有會議室，而 brief 是真實步驟）。

### 第二輪：Codex 回覆（重點）
- 判定：**核准，但定稿路徑要補強**。
- 條件通過依嚴重度處理：minor 由 H總編 抽查即可；major（動機、節奏、語氣、交錯的設定）要原審查者做針對性複核（算第 2 輪）。條件通過裡有 blocker 不能走捷徑。
- `continuity_delta` 會過期：作家修稿可能改變事實。要綁 `chapter_sha`，定稿前對照最終稿確認。
- 要擋下：metadata / schema 錯誤、章節或輪次不符、缺審查、未解 blocker、未裁決的退件、required fix 沒有處理或豁免。只警告：字數、風格、明確延後的 minor。作家 `declined` 只是提案，要 H總編 接受或豁免。
- 定稿要冪等：重跑不能重複寫 canon、不能重複推進進度。可視化 log 與權威狀態分開。
- 三件要盯的事：證據過期、H總編 工作量回漲、上限掩蓋品質問題。

## 3. 最終決定

| 項目 | 決定 | 理由 |
|------|------|------|
| 協調方式 | 前景 custom subagent，審查並行，無 SendMessage | 去掉 35% 儀式 token 與 11 次重入 |
| 模型 | 全部 Sonnet，沒有 Opus；Haiku 審查列為實驗 | 用戶要省錢；審查證明需要推理，只佔 14% |
| log | hook + 腳本，LLM 不手寫 log | 27% 工具呼叫歸零，格式一致 |
| 審查格式 | 每人每輪一個 JSON，issue 有 id / severity | 修改可對焦，腳本可驗證 |
| 停止規則 | 最多 2 輪審查；之後 H總編 裁決（接受/豁免/擱置） | 有上限又不硬放行 |
| 條件通過 | minor：作家修 + H總編 抽查；major：原審查者複核 | 採納 Codex 嚴重度分流 |
| blocker | 一律要重審或明確豁免 | 不允許條件通過繞過 |
| continuity | H世觀 審查附 delta 提案，`studio accept` 寫入，sha 不符要 `--canon-verified` | 防止過期 canon |
| 定稿 | `studio accept` 冪等：accepted.json 紀錄、continuity 用 marker 區段取代 | 可重跑、可修正 |
| 外部狀態機 | 延後 | 先量測新流程再決定 |
| log run id | 延後 | 維持 viewer 相容 |
| 三明治回饋 / 慶祝 / 關懷 / 模擬會議 | 刪除（慶祝與會議保留成腳本事件） | 對成品沒有貢獻 |
