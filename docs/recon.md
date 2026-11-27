# Step 1 偵察報告與關卡 1 驗證記錄 (`recon.md`)

> 偵察時間：`2026-11-27`  
> 目標網站：內政部國家公園署「臺灣登山申請一站式服務網」（`https://hike.taiwan.gov.tw/`）  
> 涵蓋範圍：太魯閣國家公園（`bed_4.aspx`）、雪霸國家公園（`bed_1.aspx`）、玉山國家公園（`bed_6.aspx`）

---

## 一、取得策略決策

- **最終採用策略**：**策略 B — 純 HTTP（`httpx`）GET 初始頁 + 重放 ASP.NET WebForms PostBack**（【已確認】）
  - **為何不採策略 A（直接打 XHR/JSON）**：【已確認】檢視三座國家公園頁面載入之所有 `<script>`（`system.js`、`jimmy.js`、頁面內嵌 script）與 DOM，頁面並無透過 XHR / Fetch 請求 JSON API 取得每日床位；所有日曆格子均由伺服器端 ASP.NET WebForms 於 HTML 回應中直接渲染。
  - **為何不需策略 C（Playwright 渲染）**：【已確認】只需以 `httpx.Client` 對 `bed_{4,1,6}.aspx?node_id={N}` 發送 `GET` 即可取得當月日曆 HTML 及該山屋專屬之 `__VIEWSTATE`、`__VIEWSTATEGENERATOR`、`__EVENTVALIDATION`；接著以同一表單欄位帶入 `__EVENTTARGET=ctl00$con$lbDownMonth` 發送 `POST`，伺服器即直接回傳下個月的完整日曆 HTML，無需啟動無頭瀏覽器。

---

## 二、核心機制偵察發現（每條標註「已確認」或「推測」並附證據）

### 1. 總表頁 vs 個別山屋頁與每日數值來源
1. **總表頁僅含固定承載量，無每日餘額**（【已確認】）
   - **證據**：`scraper/fixtures/taroko_main.html`、`sheipa_main.html`、`yushan_main.html` 中的 `<table class="table ... table_bed">` 僅列出各宿營地的「平日／假日山屋床位、營地營位（或人數）」與備註說明。
   - **各公園山屋／營地總數**（【已確認】）：
     - 太魯閣（`bed_4.aspx`）：總表共 **15 處**（下拉選單 `#con_rooms` 有 14 處；`node_id=697`「天空營地」平日/假日承載量皆為 `0`，僅出現在總表，不在下拉選單中）。
     - 雪霸（`bed_1.aspx`）：總表與下拉選單皆為 **34 處**。
     - 玉山（`bed_6.aspx`）：總表與下拉選單皆為 **27 處**（其中 `node_id=226`「杜鵑營地」與 `node_id=227`「南營地」承載量為 `0`）。
2. **直接 `GET bed_X.aspx?node_id=N` 即可選中該山屋並取得當月日曆**（【已確認】）
   - **證據**：
     - `GET https://hike.taiwan.gov.tw/bed_4.aspx?node_id=124`（見 `scraper/fixtures/taroko_get_node_124.html`）：回應中 `<select name="ctl00$con$rooms" id="con_rooms">` 的 `<option selected="selected" value="124">黑水塘山屋</option>` 已自動選中，且下方直接渲染 `#con_CalendarDiv` 當月（2026 年 11 月）日曆。
     - `GET https://hike.taiwan.gov.tw/bed_1.aspx?node_id=10`（見 `scraper/fixtures/sheipa_get_node_10.html`）：`<option selected="selected" value="10">七卡山莊</option>` 已自動選中。先前之所以測試 `bed_1.aspx?node_id=1` 未選中山屋，是因為雪霸沒有 `node_id=1` 的山屋（雪霸有效 `node_id` 為 `675, 10, 386, 13, 17, 387, 58...`）。
     - `GET https://hike.taiwan.gov.tw/bed_6.aspx?node_id=3`（見 `scraper/fixtures/yushan_get_node_3.html`）：`<option selected="selected" value="3">排雲山莊</option>` 已自動選中。
3. **為何直接 GET 當月（2026/11）時，雪霸與玉山日曆格看似「只剩日期數字」？**（【已確認】）
   - **證據**：偵察當日為 `2026-11-27`（月底最後一個週五）。
     - 太魯閣（`bed_4.aspx`）顯示當日及之後的餘額（`11/27`～`11/30` 共 4 格有 `<a>` 明細與餘額，`11/1`～`11/26` 已過期故為空白 `&nbsp;`）。
     - 雪霸（`bed_1.aspx`）與玉山（`bed_6.aspx`）因入園申請規定須於入園前至少 5 日提出，故 `2026-11-27` 至 `2026-12-01`（共 5 天）已截止申請，日曆格僅輸出 `<p class="text-right bg-light text-primary pr-2">27</p>` 日期數字而無申請數據；從 **`2026-12-02` 起**，每一格皆有完整的餘額、待處理／排隊預約、審核中、已通過／核准入園數據（見 `sheipa_node_10_2026_12.html`、`yushan_node_3_2026_12.html`）。

### 2. 選山屋與切月份機制（ASP.NET WebForms PostBack）
1. **切換下個月機制**（【已確認】）
   - **URL**：`POST https://hike.taiwan.gov.tw/bed_{4|1|6}.aspx?node_id={node_id}`
   - **Form Payload 必要欄位**：
     - `__VIEWSTATE`：取自前一次回應 HTML 的 `<input type="hidden" id="__VIEWSTATE">`
     - `__VIEWSTATEGENERATOR`：取自前一次回應 HTML 的 `<input type="hidden" id="__VIEWSTATEGENERATOR">`
     - `__EVENTVALIDATION`：取自前一次回應 HTML 的 `<input type="hidden" id="__EVENTVALIDATION">`
     - `__EVENTTARGET`：設為 `"ctl00$con$lbDownMonth"`（對應頁面上「下個月」按鈕 `id="con_lbDownMonth"`）
     - `__EVENTARGUMENT`：`""`
     - `ctl00$con$rooms`：`"{node_id}"`
     - `ctl00$con$ddlYear`：當前頁面選中之年份（如 `"2026"`）
     - `ctl00$con$ddlMonth`：當前頁面選中之月份（如 `"11"`）
     - `ctl00$con$hidYear`：當前頁面隱藏欄位年份（如 `"2026"`）
     - `ctl00$con$hidMonth`：當前頁面隱藏欄位月份（如 `"11"`）
     - `ctl00$con$hidIsad`（玉山專屬隱藏欄位）：`""`
     - `ctl00$googletxt`：`""`
   - **注意事項**：每次跨月 PostBack 必須以上一個月回應中的最新 `__VIEWSTATE`、`__EVENTVALIDATION`、`ctl00$con$hidYear`、`ctl00$con$hidMonth` 依序遞進（例如 `2026/11` → `2026/12` → `2027/01`）。直接修改 `ddlYear`/`ddlMonth` 而不透過 `lbDownMonth` 並不會切換 `hidYear`/`hidMonth`（【已確認】）。

### 3. 可查詢的日期窗口（以基準日 `2026-11-27` 實測）
1. **太魯閣國家公園（`bed_4.aspx`）**（【已確認】）
   - **起始日**：當日（`2026-11-27`）。
   - **截止日**：往後 2 個月（`2027-01-27`）。實測 `taroko_node_124_2027_01.html` 與 `taroko_node_149_2027_01.html` 中，`2027-01-01` 至 `2027-01-27` 共 27 天有數據，`2027-01-28` 至 `2027-01-31` 及整個 `2027-02`（`taroko_node_124_2027_02.html`）皆為空白（`not_open`）。
2. **雪霸國家公園（`bed_1.aspx`）**（【已確認】）
   - **起始日**：當日 + 5 天（`2026-12-02`）。`2026-11-01`～`2026-12-01` 僅顯示日期數字，無餘額連結。
   - **截止日**：一般申請開放至 2 個月內，外籍提前保留名額開放至 4 個月內（實測至 `2027-03-27` 有日曆數據，之後無數據）。
3. **玉山國家公園（`bed_6.aspx`）**（【已確認】）
   - **起始日**：當日 + 5 天（`2026-12-02`）。`2026-11-01`～`2026-12-01` 僅顯示日期數字，無餘額連結。
   - **截止日**：日曆可查詢至 4 個月內（實測 `2027-03-31` 仍有日曆格；其中入園日前 1 個月內為已抽籤／一般遞補階段，入園日前 1 個月以上為抽籤排隊預約／外籍提前階段）。

### 4. 各公園 HTML 結構與各狀態在回應中的樣子

#### A. 太魯閣（`bed_4.aspx`）日曆格結構（【已確認】）
- 每個 `<td>` 包含兩個 `<span>`：
  - 日期數字：`<span id="con_cb_XX"><p class='text-right bg-light text-primary pr-2'>1</p></span>`
  - 狀態內容：`<span id="con_cc_XX">...</span>`
- **有空（`available`）**：
  ```html
  <span id="con_cc_03"><a href='bed_4main.aspx?orgid=105e956f-d8da-49f7-a9b7-3aefdda88a12&node_id=124&sdate=2026-12-01' title='查看明細'>餘額<span class=''>&nbsp;3&nbsp;</span><br/>待處理<span class='pnumber'>&nbsp;1&nbsp;</span><br/>已通過<span class='pnumber'>&nbsp;2&nbsp;</span></a></span>
  ```
- **額滿（`full`）**：格式相同，其中 `餘額` 後方的數值為 `0`（例如 `2026-12-03`：`餘額 0 / 待處理 0 / 已通過 6`；或 `2026-12-29`：`餘額 0 / 待處理 6 / 已通過 0`）。
- **未開放（`not_open`）**：已過期或超過 2 個月窗口之日期，`con_cb_XX` 與 `con_cc_XX` 均為 `&nbsp;`（但需區分月曆月初/月末非當月空白格與當月有效日期無資料格）。
- **封閉（`closed`）**：`天空營地 (node_id=697)` 在總表承載量為 `0 / 0`，且不在 `#con_rooms` 選單中，點擊總表連結會觸發 `NotWorking()` (`ShowSwal(-1, "", "功能調整中")`)。
- **床位 vs 營位區分**：太魯閣總表欄位雖統一標為「山屋床位」，但 `雲稜營地 (666)`、`南湖營地 (667)`、`天空營地 (697)` 名稱結尾為「營地」且備註載明「住宿營地者，請自備過夜帳棚」，故歸類為 `kind: "camp"`（其餘額計入 `remaining_tents`），其餘 12 座山屋／避難小屋歸類為 `kind: "hut"`（其餘額計入 `remaining_beds`）。

#### B. 雪霸（`bed_1.aspx`）日曆格結構（【已確認】）
- 頁面頂部明確列出官方公式（`sheipa_post_node_10.html` 第 229 行）：
  > `【餘額】=【承載量】-【已通過】-【待處理】(等待審核)-【補件】(審核中) (不包含「待系統排定」與「候補」的隊伍)。`
- **有空（`available`）**：
  ```html
  <span id="con_cb_05"><p class='text-right bg-light text-primary pr-2'>3</p></span>
  <span id="con_cc_05"><div class="table-responsive" style=""><a href="bed_1main.aspx?orgid=e6dd4652-2d37-4346-8f5d-6e538353e0c2&amp;node_id=10&amp;sdate=2026-12-03" title="查看明細"><font color="#BB5500">餘額</font><span class="pnumber">&nbsp;71&nbsp;</span><br/><font color="blue">待處理</font><span class="pnumber">&nbsp;0&nbsp;</span><br/><font color="blue">補件</font><span class="pnumber">&nbsp;1&nbsp;</span><br/><font color="blue">已通過</font><span class="pnumber">&nbsp;34&nbsp;</span><br/><font color="green">待系統排定</font><span class="pnumber">&nbsp;1&nbsp;</span><br/><font color="green">宿營地不足候補</font><span class="pnumber">&nbsp;0&nbsp;</span><br/><font color="#5500FF">外籍提前(</font><span class="pnumber">&nbsp;0+0&nbsp;</span>)</a></div></span>
  ```
- **額滿（`full`）**：`<font color="#BB5500">餘額</font><span class="pnumber">&nbsp;0&nbsp;</span>`（例如七卡山莊 `2026-12-26`：`餘額 0 / 已通過 106 / 宿營地不足候補 10`；桃山山屋 `2026-12-04`、`12-05`：`餘額 0 / 已通過 19`）。
- **未開放（`not_open`）**：`<span id="con_cb_XX">` 有日期數字 `<p ...>1</p>`，但 `<span id="con_cc_XX"></span>` 為空字串（例如近 5 日內 `2026-12-01`，或季節性開放之 `雪山圈谷營地 node_id=382` 於 12 月份整月皆無 `con_cc` 內容，見 `sheipa_node_382_2026_12.html`）。
- **欄位映射**：
  - `approved` = `已通過`
  - `reviewing` = `待處理 + 補件`（兩者皆為審核中且已佔用承載量之名額）
  - `queue` = `待系統排定 + 宿營地不足候補`

#### C. 玉山（`bed_6.aspx`）日曆格結構（【已確認】）
- 每個 `<td>` 包含兩個 `<p>`：第一個 `<p>` 為日期數字，第二個 `<p>` 為明細連結。
- 玉山在同一個 `node_id` 下可能同時包含「床位（橘色 `#FF9933`）」與「營帳（綠色 `#009933`）」（例如 `圓峰山屋/營地 node_id=4` 為床位 15、營位 9）。
- **有空（`available`）**：
  ```html
  <td data-th="星期五">
      <p class="text-right bg-light text-primary pr-2">4</p>
      <p>
          <a href="bed_6main.aspx?orgid=C951CDCD-B75A-46B9-8002-8EF952EC95FD&amp;node_id=4&amp;sdate=2026-12-04" title="查看明細">
              <span class="text-primary">餘額</span>&nbsp;(<span style="color:#FF9933;">0</span>,<span style="color:#009933;">1</span>)<br/>
              <span class="text-primary">排隊預約</span>&nbsp;<span class="text-info">5</span><br/>
              <span class="text-primary">審核中</span>&nbsp;<span class="text-info">0</span><br/>
              <span class="text-primary">核准入園</span>&nbsp;<span class="text-info">23</span><br/>
              <span class="text-primary">(<span style="color:#FF9933;">15</span>,<span style="color:#009933;">8</span>)</span>
          </a>
      </p>
  </td>
  ```
  - 其中 `餘額 (B, T)` 第一個數字為 `remaining_beds`，第二個數字為 `remaining_tents`。
- **額滿（`full`）**：不顯示 `餘額 (0, 0)`，而是直接顯示 `<span class="text-danger">額滿</span>`（見 `yushan_node_4_2026_12.html` 的 `2026-12-03`、`12-11`、`12-12`）：
  ```html
  <span class="text-danger">額滿</span><br/>
  <span class="text-primary">排隊預約</span>&nbsp;<span class="text-info">0</span><br/>
  <span class="text-primary">審核中</span>&nbsp;<span class="text-info">0</span><br/>
  <span class="text-primary">核准入園</span>&nbsp;<span class="text-info">24</span><br/>
  <span class="text-primary">(<span style="color:#FF9933;">15</span>,<span style="color:#009933;">9</span>)</span>
  ```
- **抽籤制（`lottery`）**：
  - 依任務規範第 6 點：「排雲山莊為抽籤制，狀態應標為 `lottery`，不顯示為一般空位」。
  - 實測 `yushan_node_3_2026_12.html` 與 `yushan_node_3_2027_01.html`：排雲山莊（`node_id=3`）在尚未抽籤的日期（如 `2026-12-28` 起至 `2027-01-31`，參考 `bed_8.aspx` 玉山抽籤日期查詢，`12/28` 於 `11/30` 才抽籤）頁面上會顯示 `餘額 (136, 0)` 與大量的 `排隊預約`（如元旦 `223` 人排隊）；即使在已抽籤日期若有釋出名額（如 `12/18` 顯示 `餘額 (9, 0)`），後面也有 `排隊預約 11` 等候備取遞補。因此將 `排雲山莊 (node_id=3)` 設為 `booking_mode: "lottery"`，其所有開放查詢日期之 `status` 統一標為 `"lottery"`（同時保留真實的 `remaining_beds`、`queue`、`reviewing`、`approved` 數值供前端顯示明細），避免混入一般先搶先贏空位。
- **封閉（`closed`）**：
  - 實測 `杜鵑營地 (node_id=226)`（見 `yushan_node_226_2026_12.html`）：總表承載量為 `0`，日曆格內顯示：
    ```html
    <a id='stopdate' class='fancybox fancybox.iframe' href='apply_1_3nodestop.aspx?id=&mid=&node_id=226&sdate=2026-12-02&edate=2026-12-02'>相關訊息</a>
    ```
  - 當日曆格出現 `id="stopdate"` 或 `apply_1_3nodestop.aspx`（「相關訊息」）時，狀態明確判定為 `"closed"`。
- **未開放（`not_open`）**：第一個 `<p>` 有日期數字（如 `2026-12-01`），但第二個 `<p>` 內空白無 `<a>`。

### 5. Rate Limit、Session 與 Captcha 檢查
- **Captcha / 封鎖**（【已確認】）：三個公園之宿營地查詢頁（`bed_4.aspx`、`bed_1.aspx`、`bed_6.aspx`）均為公開查詢頁面，**完全無 Captcha、無須登入、無 WAF 阻擋**。
- **Cookie / Session**（【已確認】）：伺服器會回傳 `TS01d06e67` Cookie，但單次 `POST` 只要帶齊當頁 HTML 內的 `__VIEWSTATE`、`__VIEWSTATEGENERATOR`、`__EVENTVALIDATION` 與表單欄位即可成功切換月份。
- **禮貌抓取策略**（【已確認】）：實測以單一併發、每次請求間隔 `1.5` 秒以上、附帶明確專案 `User-Agent` 進行請求，回應穩定在 `200 OK`（耗時約 0.2～0.5 秒/次）。

---

## 三、🚧 關卡 1：人工比對驗證表（每公園至少 1 個山屋、5 個日期以上完全一致）

以下比對資料皆直接對照 `scraper/fixtures/` 中保存之官方原始 HTML 回應與解析結果：

### 1. 太魯閣國家公園（`bed_4.aspx`）
- 比對山屋：**黑水塘山屋（`node_id=124`）**（平日床位 6 / 假日床位 6）與 **雲稜山屋（`node_id=149`）**（平日床位 65 / 假日床位 65）
- 證據檔案：`scraper/fixtures/taroko_get_node_124.html`、`taroko_node_124_2026_12.html`、`taroko_node_124_2027_01.html`、`taroko_node_149_2026_12.html`

| 山屋名稱 (`node_id`) | 日期 | 官方頁面原始顯示文字 | 解析器輸出 (`remaining_beds`, `reviewing`, `approved`, `status`) | 官方公式驗證 (`承載量 - 已通過 - 待處理 = 餘額`) | 比對結果 |
| :--- | :--- | :--- | :--- | :--- | :---: |
| 黑水塘山屋 (`124`) | `2026-11-27` (五) | `餘額 1 / 待處理 0 / 已通過 5` | `beds=1, reviewing=0, approved=5, status="available"` | `6 - 5 - 0 = 1` | ✅ 完全一致 |
| 黑水塘山屋 (`124`) | `2026-11-28` (六) | `餘額 5 / 待處理 0 / 已通過 1` | `beds=5, reviewing=0, approved=1, status="available"` | `6 - 1 - 0 = 5` | ✅ 完全一致 |
| 黑水塘山屋 (`124`) | `2026-12-01` (二) | `餘額 3 / 待處理 1 / 已通過 2` | `beds=3, reviewing=1, approved=2, status="available"` | `6 - 2 - 1 = 3` | ✅ 完全一致 |
| 黑水塘山屋 (`124`) | `2026-12-03` (四) | `餘額 0 / 待處理 0 / 已通過 6` | `beds=0, reviewing=0, approved=6, status="full"` | `6 - 6 - 0 = 0` | ✅ 完全一致 |
| 黑水塘山屋 (`124`) | `2026-12-05` (六) | `餘額 5 / 待處理 1 / 已通過 0` | `beds=5, reviewing=1, approved=0, status="available"` | `6 - 0 - 1 = 5` | ✅ 完全一致 |
| 黑水塘山屋 (`124`) | `2026-12-29` (二) | `餘額 0 / 待處理 6 / 已通過 0` | `beds=0, reviewing=6, approved=0, status="full"` | `6 - 0 - 6 = 0` | ✅ 完全一致 |
| 黑水塘山屋 (`124`) | `2027-01-28` (四) | `&nbsp;`（超過 2 個月窗口） | `beds=0, reviewing=0, approved=0, status="not_open"` | 尚未開放申請 | ✅ 完全一致 |
| 雲稜山屋 (`149`) | `2026-12-05` (六) | `餘額 29 / 待處理 0 / 已通過 36` | `beds=29, reviewing=0, approved=36, status="available"` | `65 - 36 - 0 = 29` | ✅ 完全一致 |
| 雲稜山屋 (`149`) | `2026-12-30` (三) | `餘額 26 / 待處理 33 / 已通過 6` | `beds=26, reviewing=33, approved=6, status="available"` | `65 - 6 - 33 = 26` | ✅ 完全一致 |

### 2. 雪霸國家公園（`bed_1.aspx`）
- 比對山屋：**七卡山莊（`node_id=10`）**（平日床位 106 / 假日床位 106）與 **桃山山屋（`node_id=58`）**（平日床位 19 / 假日床位 19）
- 證據檔案：`scraper/fixtures/sheipa_node_10_2026_12.html`、`sheipa_node_10_2027_01.html`、`sheipa_node_58_2026_12.html`

| 山屋名稱 (`node_id`) | 日期 | 官方頁面原始顯示文字 | 解析器輸出 (`remaining_beds`, `queue`, `reviewing`, `approved`, `status`) | 官方公式驗證 (`承載量 - 已通過 - 待處理 - 補件 = 餘額`) | 比對結果 |
| :--- | :--- | :--- | :--- | :--- | :---: |
| 七卡山莊 (`10`) | `2026-12-01` (二) | 僅日期 `1`（5 日內截止） | `beds=0, queue=0, reviewing=0, approved=0, status="not_open"` | 已截止申請 | ✅ 完全一致 |
| 七卡山莊 (`10`) | `2026-12-02` (三) | `餘額 100 / 待處理 0 / 補件 0 / 已通過 6 / 待系統排定 2 / 候補 0` | `beds=100, queue=2, reviewing=0, approved=6, status="available"` | `106 - 6 - 0 - 0 = 100` | ✅ 完全一致 |
| 七卡山莊 (`10`) | `2026-12-03` (四) | `餘額 71 / 待處理 0 / 補件 1 / 已通過 34 / 待系統排定 1 / 候補 0` | `beds=71, queue=1, reviewing=1, approved=34, status="available"` | `106 - 34 - 0 - 1 = 71` | ✅ 完全一致 |
| 七卡山莊 (`10`) | `2026-12-04` (五) | `餘額 53 / 待處理 0 / 補件 0 / 已通過 53 / 待系統排定 1 / 候補 5` | `beds=53, queue=6, reviewing=0, approved=53, status="available"` | `106 - 53 - 0 - 0 = 53` | ✅ 完全一致 |
| 七卡山莊 (`10`) | `2026-12-05` (六) | `餘額 1 / 待處理 0 / 補件 0 / 已通過 105 / 待系統排定 0 / 候補 0` | `beds=1, queue=0, reviewing=0, approved=105, status="available"` | `106 - 105 - 0 - 0 = 1` | ✅ 完全一致 |
| 七卡山莊 (`10`) | `2026-12-26` (六) | `餘額 0 / 待處理 0 / 補件 0 / 已通過 106 / 待系統排定 0 / 候補 10` | `beds=0, queue=10, reviewing=0, approved=106, status="full"` | `106 - 106 - 0 - 0 = 0` | ✅ 完全一致 |
| 七卡山莊 (`10`) | `2026-12-29` (二) | `餘額 68 / 待處理 27 / 補件 0 / 已通過 11 / 待系統排定 0 / 候補 0` | `beds=68, queue=0, reviewing=27, approved=11, status="available"` | `106 - 11 - 27 - 0 = 68` | ✅ 完全一致 |
| 七卡山莊 (`10`) | `2027-01-02` (六) | `餘額 81 / 待處理 0 / 補件 6 / 已通過 19 / 待系統排定 0 / 候補 0` | `beds=81, queue=0, reviewing=6, approved=19, status="available"` | `106 - 19 - 0 - 6 = 81` | ✅ 完全一致 |
| 桃山山屋 (`58`) | `2026-12-05` (六) | `餘額 0 / 待處理 0 / 補件 0 / 已通過 19 / 待系統排定 0 / 候補 22` | `beds=0, queue=22, reviewing=0, approved=19, status="full"` | `19 - 19 - 0 - 0 = 0` | ✅ 完全一致 |

### 3. 玉山國家公園（`bed_6.aspx`）
- 比對山屋：**圓峰山屋/營地（`node_id=4`）**（床位 15 / 營位 9）、**排雲山莊（`node_id=3`）**（抽籤制，床位 136）、**杜鵑營地（`node_id=226`）**（封閉）
- 證據檔案：`scraper/fixtures/yushan_node_4_2026_12.html`、`yushan_node_3_2026_12.html`、`yushan_node_3_2027_01.html`、`yushan_node_226_2026_12.html`

| 山屋名稱 (`node_id`) | 日期 | 官方頁面原始顯示文字 | 解析器輸出 (`remaining_beds`, `remaining_tents`, `queue`, `reviewing`, `approved`, `status`) | 狀態與數值核對 | 比對結果 |
| :--- | :--- | :--- | :--- | :--- | :---: |
| 圓峰山屋/營地 (`4`) | `2026-12-01` (二) | 僅日期 `1`（5 日內截止） | `beds=0, tents=0, queue=0, reviewing=0, approved=0, status="not_open"` | 已截止申請 | ✅ 完全一致 |
| 圓峰山屋/營地 (`4`) | `2026-12-02` (三) | `餘額 (1,0) / 排隊預約 1 / 審核中 0 / 核准入園 23 (14,9)` | `beds=1, tents=0, queue=1, reviewing=0, approved=23, status="available"` | 床位餘 1、營位餘 0 | ✅ 完全一致 |
| 圓峰山屋/營地 (`4`) | `2026-12-03` (四) | `額滿 / 排隊預約 0 / 審核中 0 / 核准入園 24 (15,9)` | `beds=0, tents=0, queue=0, reviewing=0, approved=24, status="full"` | 床位與營位皆額滿 | ✅ 完全一致 |
| 圓峰山屋/營地 (`4`) | `2026-12-04` (五) | `餘額 (0,1) / 排隊預約 5 / 審核中 0 / 核准入園 23 (15,8)` | `beds=0, tents=1, queue=5, reviewing=0, approved=23, status="available"` | 床位餘 0、營位餘 1 | ✅ 完全一致 |
| 圓峰山屋/營地 (`4`) | `2026-12-05` (六) | `餘額 (0,1) / 排隊預約 4 / 審核中 0 / 核准入園 19 (15,8)` | `beds=0, tents=1, queue=4, reviewing=0, approved=19, status="available"` | 床位餘 0、營位餘 1 | ✅ 完全一致 |
| 圓峰山屋/營地 (`4`) | `2026-12-20` (日) | `餘額 (0,2) / 排隊預約 0 / 審核中 0 / 核准入園 22 (15,7)` | `beds=0, tents=2, queue=0, reviewing=0, approved=22, status="available"` | 床位餘 0、營位餘 2 | ✅ 完全一致 |
| 排雲山莊 (`3`) | `2026-12-04` (五) | `額滿 / 排隊預約 20 / 審核中 11 / 核准入園 111 (136,0)` | `beds=0, tents=0, queue=20, reviewing=11, approved=111, status="lottery"` | 抽籤制山屋（已滿） | ✅ 完全一致 |
| 排雲山莊 (`3`) | `2026-12-18` (五) | `餘額 (9,0) / 排隊預約 11 / 審核中 4 / 核准入園 112 (127,0)` | `beds=9, tents=0, queue=11, reviewing=4, approved=112, status="lottery"` | 抽籤制山屋（備取遞補中） | ✅ 完全一致 |
| 排雲山莊 (`3`) | `2027-01-01` (五) | `餘額 (136,0) / 排隊預約 223 / 審核中 0 / 核准入園 0 (0,0)` | `beds=136, tents=0, queue=223, reviewing=0, approved=0, status="lottery"` | 抽籤制山屋（登記待抽中） | ✅ 完全一致 |
| 杜鵑營地 (`226`) | `2026-12-02` (三) | `相關訊息 (apply_1_3nodestop.aspx)` | `beds=0, tents=0, queue=0, reviewing=0, approved=0, status="closed"` | 路線/營地封閉 | ✅ 完全一致 |

> **關卡 1 結論**：三座國家公園（太魯閣、雪霸、玉山）皆可透過純 HTTP + ASP.NET WebForms PostBack 穩定取得每日餘額，且人工比對超過 25 組日期（每公園 8～10 組）100% 完全一致，無任何 `unsupported` 公園。**關卡 1 正式通過！**
