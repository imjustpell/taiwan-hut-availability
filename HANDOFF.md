---
id: taiwan-hut-availability-handoff
kind: state
doc_type: handoff
title: 山屋空位網站 收工交接
cue: 山屋空位交接/taiwan-hut-availability 現況/Firebase 部署現況/每30分鐘排程驗證/空位稜線網站
status: active
evidence: HANDOFF 內各列 ✅ 指令實測
updated: 2026-11-28
export: shareable
---

# 交接 — taiwan-hut-availability（山屋空位）

> 最後更新：2026-11-28 00:40 +07:00 · 寫入：Claude Code（Opus 5.5）· 分支 `main` @ `3b9e5fc`（交接 commit 另計）
> 接手先讀 README.md 與 docs/ui-redesign.md，再照下面「真實狀態」逐項對帳。專案沒有 AGENTS.md／CLAUDE.md。

## 一、真實狀態
| 項目 | 值 | 標記 |
|---|---|---|
| 最新 commit | `3b9e5fc` ci: run scraper in Asia/Taipei timezone | ✅ |
| 工作目錄 | 乾淨（交接檔除外） | ✅ |
| 與遠端 | `main...origin/main` 一致 | ✅ |
| GitHub 倉 | https://github.com/imjustpell/taiwan-hut-availability ，**PUBLIC**，Actions 已開 | ✅ |
| 線上網站 | https://taiwan-hut-availability.web.app （Firebase Hosting，GCP 專案 `taiwan-hut-availability`） | ✅ |
| 線上資料時間 | `meta.json` fetched_at `2026-11-28T01:37:08+08:00`，failed_count 0 | ✅ |
| 手動觸發執行 | run 46041506105 workflow_dispatch → success（6m19s，8 步全過） | ✅ |
| 推送觸發執行 | run 46042461087 push → success | ✅ |
| **排程（每 30 分）自己啟動** | **截至 00:39 還沒出現任何 schedule 事件的 run，未驗證** | ✅ |
| 帳單 | GCP 專案 `billingEnabled=False`（Spark 免費方案，無法被收費） | ✅ |
| Hosting 保留版本 | `maxVersions: 100`（API 讀回確認） | ✅ |
| 本機 git 身分 | 本倉 local config：imjustpell ／ 165575736+imjustpell@users.noreply.github.com | ✅ |

## 二、這次做了什麼
- 前端整體改版：侘寂風、主視覺「空位稜線」、墨暈格子、原子設計拆成 `web/css/` 六檔＋`web/js/` 七個 ES 模組（`5dc8f43`）✅
- 設計診斷與設計系統文件 `docs/ui-redesign.md`（`5dc8f43`）✅
- 部署到 Firebase Hosting：`firebase.json`、`.firebaserc`（`61c67e1`）✅
- CI 改為每 30 分鐘爬取並部署到 Firebase，用 Workload Identity 免金鑰登入；不再把資料 commit 回倉（`dde04e5`）✅
- 第三方 action 釘 SHA、firebase-tools 釘 15.37.0、pip 套件釘版（`c59b35e`、`0f18475`）✅
- 爬蟲改用台灣時區跑（`3b9e5fc`），已見線上 fetched_at 變成 +08:00 ✅
- 全部 commit 作者改寫為 GitHub 代理信箱後強推（lease 對 `1148364`），倉庫改公開 ✅
- GCP 端：服務帳號 `github-deployer`（firebasehosting.admin、serviceUsageConsumer），身分池 `github`／provider `github-oidc`，條件只認 `imjustpell/taiwan-hut-availability` ✅

## 三、下一步（依優先序）
1. **確認排程真的會自己跑** — 這是「網站活著」唯一還沒被證明的一環。做法：`gh run list -R imjustpell/taiwan-hut-availability --event schedule --limit 3`，看到 schedule 的 run 成功、且線上 `meta.json` 時間再次前進，才算完成。GitHub 新開的排程常延遲，超過 2 小時仍沒有 schedule run 再查原因。
2. **在真瀏覽器實際點一次新版頁面（含手機）** — 截圖只驗過桌面日夜兩版的靜態畫面；點山峰切換週末、點格子開明細、人數變化、手機版表格都還沒實際操作過。
3. **決定舊檔 `web/app.js`、`web/styles.css` 要不要刪** — 新版已不引用，部署時已被 firebase.json 排除；刪檔要擁有者同意。
4. **（不急）把三個 action 升到 Node 24 的新主版本並重新釘 SHA** — GitHub 目前強制以 Node 24 跑，有棄用警告但不影響運作。

## 四、卡住、待決定
| 問題 | 卡在誰 | 影響什麼 |
|---|---|---|
| 舊檔 `web/app.js`、`web/styles.css` 是否刪除 | 擁有者 | 倉庫整潔；不影響線上 |
| 本機舊分支 `backup/before-author-rewrite`（含舊信箱 commit）是否刪除 | 擁有者 | 只在本機，未推；留著可退回 |
| 每 30 分鐘對官方網站約 1.1 萬請求／日，若被擋 IP 網站會停在舊資料 | 外部 | 資料新鮮度；Actions 頁會顯示失敗 |

## 五、走不通的路（不要再試）
- 無頭 Edge `--window-size=390` 截手機版 — 版面仍以較寬視窗排版，只是裁圖，判不出溢出（2026-11-27）
- 390px iframe 包頁面截圖 — 寬度對了，但 `--virtual-time-budget` 9／30／60 秒與 `--timeout=60000` 四次都在 3.5MB 資料載完前就截圖（單核且 CPU 滿載時）（2026-11-27）
- `cmd start /affinity 1` 綁核 — 這台回「存取被拒」，改用 PowerShell 綁自己讓子程序繼承（2026-11-27）
- 抓 Figma 社群檔 `community/file/1587748760565632360` — HTTP 403，讀不到（2026-11-27）

## 六、給下一位的提醒
- 私人倉的 Actions 額度（每月 2,000 分）撐不起每 30 分鐘一次（約 1.1 萬分／月），所以倉庫刻意改公開；不要改回私人，除非同時降頻或改到 GCP 排程。
- Firebase 沒綁帳單：超過免費額度只會被停用，不會扣款。每日流量上限約 360 MB，實量一次造訪壓縮後約 25 KB。
- 前端用 ES 模組，必須經 HTTP 開，不能雙擊 index.html。本機預覽：`.\run_scrape.ps1 -ServeOnly`。
- 設計 token 紀律：`web/css/tokens.css` 以外不准寫死色碼、rgb、數字字級（grep 驗收法見 docs/ui-redesign.md 第五節）。
