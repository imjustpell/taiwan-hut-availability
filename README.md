# 台灣國家公園山屋／營地 未來週末空位彙整 (`taiwan-hut-availability`)

一個專為台灣山友打造的純靜態山屋／營地空位查詢網站。  
官方「[臺灣登山申請一站式服務網](https://hike.taiwan.gov.tw/)」每個山屋的床位狀況分散在各自頁面且一次僅顯示單月；本工具自動禮貌彙整 **太魯閣、雪霸、玉山** 三大國家公園共 **76 處山屋與營地** 在 **未來 8 個週末（含國定連假住宿夜）** 的剩餘床位／營位，一眼看出哪裡還有位子，並支援點擊直達官方申請頁面。

---

## ✨ 功能特色

- **三大國家公園完整涵蓋（共 76 處）**：
  - **太魯閣國家公園**（`bed_4.aspx`）：15 處山屋／避難小屋／營地
  - **雪霸國家公園**（`bed_1.aspx`）：34 處山屋／營地
  - **玉山國家公園**（`bed_6.aspx`）：27 處山屋／營地
- **未來 8 個週末 × 國定連假住宿夜矩陣**：
  - 自動整合行政院人事行政總處 2026–2027 國定假日與連假清單（例如 2026/12/25 行憲紀念日連假自動納入 `12/24 週四夜`、`12/25 週五夜`、`12/26 週六夜`；2027 元旦連假自動納入 `12/31 週四跨年夜`、`01/01 週五夜`、`01/02 週六夜`）。
- **精準狀態區分**：
  - 🟢 `available`（有空位）：顯示剩餘床位／營位數及已核准人數
  - 🟡 `名額不足`：有空位但小於目前設定的「最少需要人數」
  - 🔴 `full`（額滿）：剩餘名額為 0，顯示排隊預約／候補人數
  - 🟣 `lottery`（抽籤制）：如玉山**排雲山莊**，獨立標示為抽籤制（並顯示待抽／預約或備取人數），不混入一般先搶先贏空位
  - ⚪ `not_open`（未開放／已截止）：如入園前 5 日內已截止申請、或超過太魯閣 2 個月開放窗口、或非雪季開放期間
  - ⚫ `closed`（封閉）：如八通關越嶺線杜鵑營地、南營地或太魯閣天空營地
- **多維度即時篩選**：國家公園、只看有空位、只看床位／只看營位、最少需要人數（1+ / 2+ / 4+ / 6+ / 8+ 或自訂）、山屋名稱關鍵字搜尋。
- **空位稜線與單一表格**：主視覺把未來八個週末畫成一排山，山高＝當晚睡得下你們這團的山屋數，點山峰切換週末；下方表格用「墨暈」深淺表示剩多少位。手機上表格只顯示選中的週末。設計診斷與設計系統見 [`docs/ui-redesign.md`](docs/ui-redesign.md)。

---

## 🛠️ 安裝與環境需求

- **作業系統**：Windows / macOS / Linux
- **Python 版本**：Python 3.11+（建議使用 `uv` 或 `venv`）
- **無需安裝前端框架或打包工具**：前端為零依賴純靜態 HTML + CSS + 原生 ES 模組（依原子設計拆成 `web/css/` 五層與 `web/js/` 模組），需經 HTTP 伺服器開啟，不能直接雙擊 index.html。

### 安裝步驟（Windows PowerShell）

```powershell
cd C:\D\Project\taiwan-hut-availability

# 建立 Python 3.11 虛擬環境並安裝依賴
uv venv --python 3.11 .venv
uv pip install --python .venv httpx beautifulsoup4 selectolax pytest
```

（若未使用 `uv`，亦可使用標準 `py -3.11 -m venv .venv` 與 `.\.venv\Scripts\pip install httpx beautifulsoup4 selectolax pytest`。）

---

## 🚀 執行方式

### 1. 本機一鍵執行（爬蟲 ＋ 啟動本機網頁預覽）

```powershell
# 執行完整禮貌爬蟲並自動啟動 http://127.0.0.1:8080 預覽
.\run_scrape.ps1 -Serve
```

若資料已經抓好、只想立刻啟動本機預覽伺服器（不重跑爬蟲）：

```powershell
.\run_scrape.ps1 -ServeOnly
# 或使用快捷腳本：
.\start_local.ps1 -SkipScrape
```

### 2. 單獨執行爬蟲 (`run_scrape`)

```powershell
# PowerShell:
.\run_scrape.ps1

# CMD 或跨平台 Python:
.\run_scrape.cmd
.\.venv\Scripts\python.exe run_scrape.py --months-ahead 2 --interval 1.5
```

執行後會輸出並同步更新以下檔案：
- `data/huts.json`（76 處山屋／營地基本資料與承載量）
- `data/availability.json`（當月＋往後 2 個月所有日期之餘額與狀態）
- `data/meta.json`（抓取時間 `fetched_at`、各公園支援狀態與成功／失敗統計）
- `data/holidays.json`（台灣 2026–2027 國定假日與連假清單）
- 同時自動同步一份至 `web/data/*.json` 供靜態網頁直接讀取。

### 3. 執行單元測試 (`pytest`)

```powershell
.\.venv\Scripts\pytest.exe -v
```

---

## ☁️ 自動更新與 GitHub Pages 部署設定說明

專案已內建 `.github/workflows/scrape-and-deploy.yml`，設定為**每 2 小時自動執行一次禮貌爬蟲 → 將更新後的 `data/*.json` commit 回 repo → 自動部署純靜態網站至 GitHub Pages**。

### 手動啟用步驟（首次部署）
1. **建立 GitHub Repository 並推送程式碼**：
   ```powershell
   git remote add origin https://github.com/<你的帳號>/taiwan-hut-availability.git
   git branch -M main
   git push -u origin main
   ```
2. **開啟 GitHub Actions 寫入權限**：
   - 進入 GitHub Repo → **Settings** → **Actions** → **General** → **Workflow permissions**
   - 選擇 **Read and write permissions**，點擊 **Save**。
3. **啟用 GitHub Pages（使用 GitHub Actions 來源）**：
   - 進入 GitHub Repo → **Settings** → **Pages**
   - 在 **Build and deployment** 下的 **Source** 選擇 **GitHub Actions**。
4. **手動觸發首次部署（或等待排程）**：
   - 進入 **Actions** 頁籤 → 點選左側 **Scrape Hut Availability & Deploy GitHub Pages** → 點擊 **Run workflow**。
   - 執行完成後（約 6 分鐘），即可於 `https://<你的帳號>.github.io/taiwan-hut-availability/` 瀏覽網站。

---

## ⚠️ 已知限制與注意事項

1. **非即時同步（每 2 小時批次更新）**：為遵守禮貌爬蟲原則（單一併發、每次請求間隔 1.5 秒），完整抓取 76 處山屋 × 3 個月需約 229 次請求（耗時約 5.8 分鐘），因此採用定時批次更新，頂部會清楚顯示「資料更新於 X 前」。
2. **各國家公園開放查詢窗口不同**：
   - **太魯閣**：開放當日起至 **往後 2 個月內**（超過 2 個月之日期官方日曆不顯示，本網站標為 `未開放`）。
   - **雪霸、玉山**：入園前 **5 日內**已截止申請（官方日曆僅顯示日期數字無名額，本網站標為 `未開放`）；遠期日曆可查詢至 2～4 個月。
3. **玉山抽籤制與排隊預約說明**：
   - **排雲山莊（`node_id=3`）** 全年為抽籤制，狀態統一標示為 `lottery`（抽籤制），不會在開啟「只看有空位」時被當作一般空位。
   - 玉山部分其他山屋（如圓峰、瓦拉米、庫哈諾辛）在入園前 1 個月以上亦屬於抽籤登記期（官方頁面於抽籤前會顯示完整承載量餘額與排隊預約人數），格子副標與 Tooltip 皆會完整列出「排隊／審核／已過」人數，申請前請點擊格子至官方頁面確認最新狀態。
4. **資料來源與免責聲明**：
   - 資料來源：[內政部國家公園署 臺灣登山申請一站式服務網](https://hike.taiwan.gov.tw/)（依政府網站資料開放宣告加值利用）。
   - **實際床位／營位餘額、抽籤結果、颱風警報與路線開放狀態，一律以官方網站即時公告為準。**

---

## 🗺️ Roadmap（未來規劃／目前不做範圍）

以下功能不在本階段交付範圍，列為後續 Roadmap：
- [ ] **林業及自然保育署（林保署）山屋整合**（`bed_0.aspx`，如嘉明湖向陽／嘉明湖山屋、天池山莊、檜谷山莊、九九山莊林保署路線等）
- [ ] **登山路線級查詢**（`bed_5.aspx` 太魯閣路線、`bed_10.aspx` 雪霸路線與路線開放狀態 `open.aspx` 連動）
- [ ] **單日往返（單攻）名額查詢**（如玉山單日往返 `bed_7.aspx`）
- [ ] **路線級多晚連續空位查詢**（例如「D1 雲稜山屋 ＋ D2 南湖山屋」連續兩晚皆有位之行程組合搜尋）
- [ ] **空位釋出通知功能**（Line Notify / Telegram / Email 訂閱特定週末與山屋空位釋出推播）
