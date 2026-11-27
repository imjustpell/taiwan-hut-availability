/**
 * 台灣國家公園山屋／營地 未來週末空位彙整 前端應用程式 (v2 Dark Mode + Manual Refresh + RWD)
 * 純靜態讀取 data/*.json，並支援向本機伺服器發送 POST /api/refresh 手動更新要求。
 */

const PARK_NAMES = {
  taroko: "太魯閣國家公園",
  sheipa: "雪霸國家公園",
  yushan: "玉山國家公園",
};

const PARK_SHORT_NAMES = {
  taroko: "太魯閣",
  sheipa: "雪霸",
  yushan: "玉山",
};

const PARK_URLS = {
  taroko: "https://hike.taiwan.gov.tw/bed_4.aspx",
  sheipa: "https://hike.taiwan.gov.tw/bed_1.aspx",
  yushan: "https://hike.taiwan.gov.tw/bed_6.aspx",
};

const WEEKDAY_NAMES = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

// Built-in 2026–2027 Taiwan National Holidays fallback (行政院人事行政總處辦公日曆表)
const FALLBACK_HOLIDAYS_DATA = {
  source: "行政院人事行政總處 政府行政機關辦公日曆表（2026–2027 國定假日與連假）",
  holidays: {
    "2026-01-01": { name: "元旦", is_holiday: true },
    "2026-02-15": { name: "小年夜", is_holiday: true },
    "2026-02-16": { name: "除夕", is_holiday: true },
    "2026-02-17": { name: "春節初一", is_holiday: true },
    "2026-02-18": { name: "春節初二", is_holiday: true },
    "2026-02-19": { name: "春節初三", is_holiday: true },
    "2026-02-20": { name: "春節補假", is_holiday: true },
    "2026-02-27": { name: "和平紀念日補假", is_holiday: true },
    "2026-02-28": { name: "和平紀念日", is_holiday: true },
    "2026-04-03": { name: "兒童節補假", is_holiday: true },
    "2026-04-04": { name: "兒童節", is_holiday: true },
    "2026-04-05": { name: "清明節", is_holiday: true },
    "2026-04-06": { name: "清明節補假", is_holiday: true },
    "2026-05-01": { name: "勞動節", is_holiday: true },
    "2026-06-19": { name: "端午節", is_holiday: true },
    "2026-09-25": { name: "中秋節", is_holiday: true },
    "2026-09-28": { name: "教師節", is_holiday: true },
    "2026-10-09": { name: "國慶日補假", is_holiday: true },
    "2026-10-10": { name: "國慶日", is_holiday: true },
    "2026-10-25": { name: "臺灣光復節", is_holiday: true },
    "2026-10-26": { name: "臺灣光復節補假", is_holiday: true },
    "2026-12-25": { name: "行憲紀念日", is_holiday: true },
    "2027-01-01": { name: "元旦", is_holiday: true },
    "2027-02-05": { name: "小年夜", is_holiday: true },
    "2027-02-06": { name: "除夕", is_holiday: true },
    "2027-02-07": { name: "春節初一", is_holiday: true },
    "2027-02-08": { name: "春節初二", is_holiday: true },
    "2027-02-09": { name: "春節初三", is_holiday: true },
    "2027-02-10": { name: "春節補假", is_holiday: true },
    "2027-02-28": { name: "和平紀念日", is_holiday: true },
    "2027-03-01": { name: "和平紀念日補假", is_holiday: true },
    "2027-04-04": { name: "兒童節", is_holiday: true },
    "2027-04-05": { name: "清明節", is_holiday: true },
    "2027-04-06": { name: "兒童節補假", is_holiday: true },
    "2027-04-30": { name: "勞動節補假", is_holiday: true },
    "2027-05-01": { name: "勞動節", is_holiday: true },
    "2027-06-09": { name: "端午節", is_holiday: true },
    "2027-09-15": { name: "中秋節", is_holiday: true },
    "2027-09-28": { name: "教師節", is_holiday: true },
    "2027-10-10": { name: "國慶日", is_holiday: true },
    "2027-10-11": { name: "國慶日補假", is_holiday: true },
    "2027-10-25": { name: "臺灣光復節", is_holiday: true },
    "2027-12-24": { name: "行憲紀念日補假", is_holiday: true },
    "2027-12-25": { name: "行憲紀念日", is_holiday: true },
  },
  makeup_workdays: {},
};

const state = {
  theme: "dark",
  huts: [],
  hutsById: new Map(),
  availabilityMap: new Map(), // key: `${hut_id}__${date}` -> Availability
  meta: null,
  holidaysData: FALLBACK_HOLIDAYS_DATA,
  weekendBlocks: [],
  pollTimer: null,
  filters: {
    park: "all",
    type: "all", // 'all' | 'beds' | 'tents'
    minSpots: 1,
    onlyAvailable: false,
    search: "",
    viewMode: window.innerWidth <= 640 ? "cards" : "matrix", // mobile defaults to cards view for best UX
    activeWeekendIndex: 0,
  },
};

function showToast(message, durationMs = 4000) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const item = document.createElement("div");
  item.className = "toast-item";
  item.textContent = message;
  container.appendChild(item);
  setTimeout(() => {
    item.remove();
  }, durationMs);
}

function initTheme() {
  const saved = localStorage.getItem("tw_hut_theme") || "dark";
  applyTheme(saved);
}

function applyTheme(theme) {
  state.theme = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", state.theme);
  localStorage.setItem("tw_hut_theme", state.theme);

  const iconEl = document.getElementById("theme-toggle-icon");
  const textEl = document.getElementById("theme-toggle-text");
  if (iconEl && textEl) {
    if (state.theme === "dark") {
      iconEl.textContent = "☀️";
      textEl.textContent = "淺色模式";
    } else {
      iconEl.textContent = "🌙";
      textEl.textContent = "深色模式";
    }
  }
}

function parseLocalDate(isoStr) {
  const [y, m, d] = isoStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatIsoDate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(dateObj, days) {
  const next = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function isOffDay(dateObj, holidaysData) {
  const iso = formatIsoDate(dateObj);
  const hMap = (holidaysData && holidaysData.holidays) || {};
  const mMap = (holidaysData && holidaysData.makeup_workdays) || {};
  if (mMap[iso]) return false;
  if (hMap[iso] && hMap[iso].is_holiday !== false) return true;
  const day = dateObj.getDay();
  return day === 0 || day === 6;
}

function computeUpcomingWeekendBlocks(startDateObj, numWeekends, holidaysData) {
  const hMap = (holidaysData && holidaysData.holidays) || {};
  const blocks = [];
  let cursor = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate());
  const endScan = addDays(cursor, 120);

  while (cursor <= endScan && blocks.length < numWeekends) {
    if (isOffDay(cursor, holidaysData)) {
      let blockStart = cursor;
      while (isOffDay(addDays(blockStart, -1), holidaysData)) {
        blockStart = addDays(blockStart, -1);
      }
      let blockEnd = cursor;
      while (isOffDay(addDays(blockEnd, 1), holidaysData)) {
        blockEnd = addDays(blockEnd, 1);
      }

      const offDaysCount = Math.round((blockEnd - blockStart) / 86400000) + 1;
      if (offDaysCount >= 2) {
        const firstNight = addDays(blockStart, -1);
        const lastNight = addDays(blockEnd, -1);

        const holidayNames = [];
        let dIter = blockStart;
        while (dIter <= blockEnd) {
          const info = hMap[formatIsoDate(dIter)];
          if (info && info.name) {
            const cleanName = info.name.replace("補假", "");
            if (!holidayNames.includes(cleanName)) {
              holidayNames.push(cleanName);
            }
          }
          dIter = addDays(dIter, 1);
        }

        const nights = [];
        let nIter = firstNight;
        while (nIter <= lastNight) {
          if (nIter >= startDateObj) {
            const nIso = formatIsoDate(nIter);
            const hInfo = hMap[nIso];
            const nextInfo = hMap[formatIsoDate(addDays(nIter, 1))];
            const wd = nIter.getDay();
            nights.push({
              date: nIso,
              shortDate: `${String(nIter.getMonth() + 1).padStart(2, "0")}/${String(nIter.getDate()).padStart(2, "0")}`,
              weekdayName: `${WEEKDAY_NAMES[wd]}夜`,
              isHolidayNight: true,
              holidayTag: hInfo ? hInfo.name : nextInfo ? `${nextInfo.name}前夜` : null,
            });
          }
          nIter = addDays(nIter, 1);
        }

        if (nights.length > 0) {
          const idx = blocks.length + 1;
          const firstShort = nights[0].shortDate;
          const lastShort = nights[nights.length - 1].shortDate;
          const rangeLabel = firstShort === lastShort ? firstShort : `${firstShort}–${lastShort}`;
          const holidayTitle = holidayNames.length > 0 ? holidayNames.join(" / ") : null;

          blocks.push({
            index: idx - 1,
            label: holidayTitle ? `W${idx} 🎌 ${holidayTitle} (${rangeLabel})` : `第 ${idx} 週末 (${rangeLabel})`,
            shortLabel: holidayTitle ? `🎌 ${holidayTitle} (${rangeLabel})` : `W${idx} (${rangeLabel})`,
            rangeLabel,
            isLongWeekend: offDaysCount > 2 || holidayNames.length > 0,
            holidayTitle,
            nights,
          });
        }
      }
      cursor = addDays(blockEnd, 1);
    } else {
      cursor = addDays(cursor, 1);
    }
  }
  return blocks;
}

async function fetchJsonWithFallback(filename, bustCache = false) {
  const qs = bustCache ? `?t=${Date.now()}` : "";
  const candidates = [`./data/${filename}${qs}`, `../data/${filename}${qs}`];
  let lastErr = null;
  for (const url of candidates) {
    try {
      const resp = await fetch(url, { cache: "no-store" });
      if (resp.ok) {
        return await resp.json();
      }
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error(`無法載入 ${filename}`);
}

function formatRelativeTime(isoTimestamp) {
  if (!isoTimestamp) return "未知時間";
  const fetchedDate = new Date(isoTimestamp);
  if (Number.isNaN(fetchedDate.getTime())) return isoTimestamp;

  const diffMs = Date.now() - fetchedDate.getTime();
  const diffMin = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMin < 1) return "剛剛";
  if (diffMin < 60) return `${diffMin} 分鐘前`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    const remMin = diffMin % 60;
    return remMin > 0 ? `${diffHours} 小時 ${remMin} 分鐘前` : `${diffHours} 小時前`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} 天前`;
}

function getEffectiveRemaining(hut, avail, typeFilter) {
  if (!avail) return 0;
  if (typeFilter === "beds") return avail.remaining_beds || 0;
  if (typeFilter === "tents") return avail.remaining_tents || 0;
  return (avail.remaining_beds || 0) + (avail.remaining_tents || 0);
}

function getEffectiveCapacity(hut, typeFilter) {
  const c = hut.capacity || {};
  if (typeFilter === "beds") return c.holiday_beds || 0;
  if (typeFilter === "tents") return c.holiday_tents || 0;
  return (c.holiday_beds || 0) + (c.holiday_tents || 0);
}

function hutMatchesTypeFilter(hut, typeFilter) {
  if (typeFilter === "beds") {
    return hut.kind === "hut" || hut.kind === "both";
  }
  if (typeFilter === "tents") {
    return hut.kind === "camp" || hut.kind === "both";
  }
  return true;
}

function hutHasAvailableNightInBlock(hut, block, typeFilter, minSpots) {
  for (const night of block.nights) {
    const avail = state.availabilityMap.get(`${hut.id}__${night.date}`);
    if (avail && avail.status === "available") {
      if (getEffectiveRemaining(hut, avail, typeFilter) >= minSpots) {
        return true;
      }
    }
  }
  return false;
}

function hutHasAvailableWeekendNight(hut, weekendBlocks, typeFilter, minSpots) {
  return weekendBlocks.some((b) => hutHasAvailableNightInBlock(hut, b, typeFilter, minSpots));
}

function formatHutCapacityText(hut) {
  const c = hut.capacity || {};
  const parts = [];
  if (hut.kind === "hut" || hut.kind === "both") {
    const bedStr = c.weekday_beds === c.holiday_beds ? `${c.holiday_beds}` : `平${c.weekday_beds}/假${c.holiday_beds}`;
    parts.push(`床 ${bedStr}`);
  }
  if (hut.kind === "camp" || hut.kind === "both") {
    const tentStr = c.weekday_tents === c.holiday_tents ? `${c.holiday_tents}` : `平${c.weekday_tents}/假${c.holiday_tents}`;
    parts.push(`營 ${tentStr}`);
  }
  if (parts.length === 0) return "承載 0";
  return parts.join(" · ");
}

function buildCellViewModel(hut, night) {
  const avail = state.availabilityMap.get(`${hut.id}__${night.date}`);
  const typeFilter = state.filters.type;
  const minSpots = state.filters.minSpots;

  if (!avail) {
    return {
      cssStatus: "status-not_open",
      mainText: "—",
      subText: "未開放",
      pct: 0,
      tooltip: `${hut.name} (${night.date} ${night.weekdayName})：尚未開放或無資料`,
    };
  }

  const beds = avail.remaining_beds || 0;
  const tents = avail.remaining_tents || 0;
  const effSpots = getEffectiveRemaining(hut, avail, typeFilter);
  const effCap = Math.max(1, getEffectiveCapacity(hut, typeFilter));
  const cap = hut.capacity || {};
  const capDesc = `假日承載：床 ${cap.holiday_beds || 0} / 營 ${cap.holiday_tents || 0}`;

  if (avail.status === "closed") {
    return {
      cssStatus: "status-closed",
      mainText: "封閉",
      subText: "暫停開放",
      pct: 0,
      tooltip: `${hut.name} (${night.date})：路線或宿營地封閉中`,
    };
  }

  if (avail.status === "not_open") {
    return {
      cssStatus: "status-not_open",
      mainText: "—",
      subText: "未開放",
      pct: 0,
      tooltip: `${hut.name} (${night.date})：已逾申請期限或尚未進入開放申請窗口`,
    };
  }

  if (avail.status === "lottery") {
    let subText = `排隊 ${avail.queue}`;
    if (beds === 0 && tents === 0) {
      subText = `已滿·候補 ${avail.queue}`;
    } else if (avail.approved === 0 && avail.reviewing === 0) {
      subText = `待抽·預約 ${avail.queue}`;
    } else {
      subText = `餘${beds}·備取 ${avail.queue}`;
    }
    return {
      cssStatus: "status-lottery",
      mainText: "抽籤制",
      subText,
      pct: 0,
      tooltip: `${hut.name} (${night.date} 抽籤制)\n官方顯示餘額：床 ${beds}\n排隊預約(含備取)：${avail.queue} 人\n審核中：${avail.reviewing} 人\n核准入園：${avail.approved} 人\n(${capDesc})`,
    };
  }

  if (avail.status === "full" || effSpots === 0) {
    const subParts = [];
    if (avail.queue > 0) {
      subParts.push(`候補 ${avail.queue}`);
    } else if (avail.reviewing > 0) {
      subParts.push(`審核 ${avail.reviewing}`);
    } else {
      subParts.push(`已過 ${avail.approved}`);
    }
    return {
      cssStatus: "status-full",
      mainText: "額滿",
      subText: subParts.join(" "),
      pct: 0,
      tooltip: `${hut.name} (${night.date})：額滿\n剩餘：床 ${beds} / 營 ${tents}\n排隊/候補：${avail.queue} 人\n審核/待處理：${avail.reviewing} 人\n已核准：${avail.approved} 人\n(${capDesc})`,
    };
  }

  // Available status
  let mainText = "";
  if (typeFilter === "beds") {
    mainText = `床 ${beds}`;
  } else if (typeFilter === "tents") {
    mainText = `營 ${tents}`;
  } else if (hut.kind === "both") {
    mainText = `床${beds} 營${tents}`;
  } else if (hut.kind === "camp") {
    mainText = `營 ${tents}`;
  } else {
    mainText = `床 ${beds}`;
  }

  const meetsMinSpots = effSpots >= minSpots;
  const cssStatus = meetsMinSpots ? "status-available" : "status-low";
  const pct = Math.min(100, Math.round((effSpots / effCap) * 100));

  const subParts = [];
  if (!meetsMinSpots) {
    subParts.push(`不足${minSpots}人`);
  } else if (avail.reviewing > 0) {
    subParts.push(`審${avail.reviewing} 過${avail.approved}`);
  } else if (avail.queue > 0) {
    subParts.push(`排${avail.queue} 過${avail.approved}`);
  } else {
    subParts.push(`已過 ${avail.approved}`);
  }

  return {
    cssStatus,
    mainText,
    subText: subParts.join(" "),
    pct: meetsMinSpots ? pct : 0,
    tooltip: `${hut.name} (${night.date} ${night.weekdayName})\n剩餘名額：床位 ${beds} / 營位 ${tents}\n排隊/候補：${avail.queue} 人\n審核/待處理：${avail.reviewing} 人\n已核准/通過：${avail.approved} 人\n(${capDesc})\n點擊檢視明細或前往官方申請頁`,
  };
}

function renderMetaHeader() {
  const meta = state.meta;
  const updatedAgoEl = document.getElementById("updated-ago-text");
  const updatedExactEl = document.getElementById("updated-exact-text");
  const pillsEl = document.getElementById("park-status-pills");
  const alertsEl = document.getElementById("unsupported-alerts");

  if (!meta) return;

  updatedAgoEl.textContent = `資料更新於 ${formatRelativeTime(meta.fetched_at)}`;
  const d = new Date(meta.fetched_at);
  updatedExactEl.textContent = Number.isNaN(d.getTime())
    ? ""
    : `(${d.toLocaleString("zh-TW", { hour12: false })})`;

  pillsEl.innerHTML = "";
  alertsEl.innerHTML = "";
  let hasUnsupported = false;

  for (const parkId of ["taroko", "sheipa", "yushan"]) {
    const pMeta = (meta.parks && meta.parks[parkId]) || null;
    const pill = document.createElement("span");
    if (!pMeta || pMeta.supported === false) {
      hasUnsupported = true;
      pill.className = "park-pill unsupported";
      pill.textContent = `${PARK_SHORT_NAMES[parkId]}：暫無法取得`;

      const banner = document.createElement("div");
      banner.className = "unsupported-banner";
      banner.innerHTML = `⚠️ <strong>${PARK_NAMES[parkId]}：暫無法取得</strong>（原因：${(pMeta && pMeta.error) || "官方頁面無法連線或未支援"}）。請直接點擊前往 <a href="${PARK_URLS[parkId]}" target="_blank" rel="noopener noreferrer">官方查詢頁</a>。`;
      alertsEl.appendChild(banner);
    } else {
      pill.className = "park-pill";
      pill.textContent = `${PARK_SHORT_NAMES[parkId]} ${pMeta.success_count}/${pMeta.total_huts}`;
    }
    pillsEl.appendChild(pill);
  }

  alertsEl.hidden = !hasUnsupported;

  const holidayBadge = document.getElementById("holiday-source-badge");
  if (holidayBadge && state.holidaysData && state.holidaysData.source) {
    holidayBadge.textContent = `📅 ${state.holidaysData.source}`;
  }
}

function renderKpiStrip() {
  const strip = document.getElementById("kpi-strip");
  if (!strip || state.weekendBlocks.length === 0) return;

  const { type, minSpots, park } = state.filters;
  const candidateHuts = state.huts.filter(
    (h) => (park === "all" || h.park === park) && hutMatchesTypeFilter(h, type)
  );

  const anyAvailCount = candidateHuts.filter((h) =>
    hutHasAvailableWeekendNight(h, state.weekendBlocks, type, minSpots)
  ).length;

  // Next open weekend (usually index 1 since index 0 is within 5 days for Shei-Pa/Yushan)
  const w1Block = state.weekendBlocks[1] || state.weekendBlocks[0];
  const w1Count = w1Block
    ? candidateHuts.filter((h) => hutHasAvailableNightInBlock(h, w1Block, type, minSpots)).length
    : 0;

  // Find consecutive holiday blocks
  const holidayBlocks = state.weekendBlocks.filter((b) => b.isLongWeekend);

  let html = `
    <button type="button" class="kpi-card" data-action="toggle-only-avail">
      <div>
        <span class="kpi-label">🟢 未來 8 週末有空山屋</span>
        <span class="kpi-sub">點擊切換「只看有空位」</span>
      </div>
      <span class="kpi-value">${anyAvailCount} <small style="font-size:0.75rem;font-weight:600;">處</small></span>
    </button>
  `;

  if (w1Block) {
    html += `
      <button type="button" class="kpi-card" data-jump-idx="${w1Block.index}">
        <div>
          <span class="kpi-label">🔥 近期週末 (${w1Block.rangeLabel})</span>
          <span class="kpi-sub">點擊定位至此週末</span>
        </div>
        <span class="kpi-value">${w1Count} <small style="font-size:0.75rem;font-weight:600;">處有空</small></span>
      </button>
    `;
  }

  for (const hb of holidayBlocks.slice(0, 2)) {
    const hbCount = candidateHuts.filter((h) => hutHasAvailableNightInBlock(h, hb, type, minSpots)).length;
    html += `
      <button type="button" class="kpi-card is-holiday-kpi" data-jump-idx="${hb.index}">
        <div>
          <span class="kpi-label">🎌 ${hb.holidayTitle || "國定連假"} (${hb.rangeLabel})</span>
          <span class="kpi-sub">連假 ${hb.nights.length} 晚 · 點擊跳轉</span>
        </div>
        <span class="kpi-value">${hbCount} <small style="font-size:0.75rem;font-weight:600;">處有空</small></span>
      </button>
    `;
  }

  strip.innerHTML = html;

  strip.querySelectorAll(".kpi-card").forEach((card) => {
    card.addEventListener("click", () => {
      if (card.dataset.action === "toggle-only-avail") {
        const toggle = document.getElementById("only-available-toggle");
        toggle.checked = !toggle.checked;
        state.filters.onlyAvailable = toggle.checked;
        renderAll();
      } else if (card.dataset.jumpIdx !== undefined) {
        jumpToWeekend(Number(card.dataset.jumpIdx));
      }
    });
  });
}

function jumpToWeekend(idx) {
  state.filters.activeWeekendIndex = idx;
  renderWeekendJumpBar();
  if (state.filters.viewMode === "cards") {
    renderCardsView();
  } else {
    const targetTh = document.getElementById(`weekend-col-${idx}`);
    if (targetTh) {
      targetTh.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }
}

function renderWeekendJumpBar() {
  const bar = document.getElementById("weekend-jump-bar");
  bar.innerHTML = "";

  state.weekendBlocks.forEach((block, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const classes = ["weekend-jump-pill"];
    if (block.isLongWeekend) classes.push("is-holiday");
    if (state.filters.activeWeekendIndex === idx) classes.push("active");
    btn.className = classes.join(" ");
    btn.textContent = block.shortLabel;
    btn.addEventListener("click", () => jumpToWeekend(idx));
    bar.appendChild(btn);
  });
}

function getFilteredHutsByPark() {
  const { park, type, minSpots, onlyAvailable, search } = state.filters;
  const kw = search.trim().toLowerCase();

  const grouped = {
    taroko: [],
    sheipa: [],
    yushan: [],
  };

  let totalMatched = 0;

  for (const hut of state.huts) {
    if (park !== "all" && hut.park !== park) continue;
    if (!hutMatchesTypeFilter(hut, type)) continue;
    if (kw && !hut.name.toLowerCase().includes(kw)) continue;
    if (onlyAvailable && !hutHasAvailableWeekendNight(hut, state.weekendBlocks, type, minSpots)) {
      continue;
    }
    if (grouped[hut.park]) {
      grouped[hut.park].push(hut);
      totalMatched += 1;
    }
  }

  return { grouped, totalMatched };
}

function openCellDetailModal(hutId, dateStr, weekdayName) {
  const hut = state.hutsById.get(hutId);
  if (!hut) return;
  const avail = state.availabilityMap.get(`${hutId}__${dateStr}`);
  const backdrop = document.getElementById("cell-detail-backdrop");
  const parkEl = document.getElementById("cell-detail-park");
  const titleEl = document.getElementById("cell-detail-title");
  const bodyEl = document.getElementById("cell-detail-body");

  parkEl.textContent = `${PARK_NAMES[hut.park]} · ${hut.kind === "both" ? "山屋+營地" : hut.kind === "camp" ? "營地" : "山屋"}`;
  titleEl.textContent = `${hut.name} — ${dateStr} (${weekdayName})`;

  const c = hut.capacity || {};
  const statusMap = {
    available: "🟢 有空位（可申請）",
    full: "🔴 額滿（可排候補）",
    lottery: "🟣 抽籤制（排雲山莊）",
    not_open: "⚪ 未開放或已逾申請期限",
    closed: "⚫ 封閉中",
    unknown: "❓ 未知狀態",
  };

  const stText = avail ? statusMap[avail.status] || avail.status : "⚪ 未開放";
  const remBeds = avail ? avail.remaining_beds : 0;
  const remTents = avail ? avail.remaining_tents : 0;
  const queue = avail ? avail.queue : 0;
  const reviewing = avail ? avail.reviewing : 0;
  const approved = avail ? avail.approved : 0;

  bodyEl.innerHTML = `
    <div style="font-size:0.9rem;font-weight:700;margin-bottom:8px;">狀態：${stText}</div>
    <div class="detail-grid">
      <div class="detail-stat-box">
        <span class="detail-stat-label">🛏️ 剩餘床位 / 假日承載</span>
        <span class="detail-stat-val">${remBeds} <small style="font-weight:400;font-size:0.78rem;color:var(--text-muted);">/ ${c.holiday_beds || 0} 人</small></span>
      </div>
      <div class="detail-stat-box">
        <span class="detail-stat-label">⛺ 剩餘營位 / 假日承載</span>
        <span class="detail-stat-val">${remTents} <small style="font-weight:400;font-size:0.78rem;color:var(--text-muted);">/ ${c.holiday_tents || 0} 人</small></span>
      </div>
      <div class="detail-stat-box">
        <span class="detail-stat-label">⏳ 排隊預約 / 候補人數</span>
        <span class="detail-stat-val">${queue} <small style="font-weight:400;font-size:0.78rem;">人</small></span>
      </div>
      <div class="detail-stat-box">
        <span class="detail-stat-label">📝 審核中 (待處理+補件)</span>
        <span class="detail-stat-val">${reviewing} <small style="font-weight:400;font-size:0.78rem;">人</small></span>
      </div>
      <div class="detail-stat-box" style="grid-column: 1 / -1;">
        <span class="detail-stat-label">✅ 已核准入園 / 已通過人數</span>
        <span class="detail-stat-val">${approved} <small style="font-weight:400;font-size:0.78rem;">人（官方公式：餘額 = 承載量 − 已通過 − 待處理 − 補件）</small></span>
      </div>
    </div>
    <a class="btn-cta-official" href="${hut.source_url}" target="_blank" rel="noopener noreferrer">
      ↗ 前往官方「${hut.name}」日曆與申請頁面
    </a>
  `;

  backdrop.hidden = false;
}

function renderMatrixView() {
  const thead = document.getElementById("matrix-thead");
  const tbody = document.getElementById("matrix-tbody");
  const counterEl = document.getElementById("summary-counter");

  const { grouped, totalMatched } = getFilteredHutsByPark();
  counterEl.textContent = `顯示 ${totalMatched} / ${state.huts.length} 處宿營地`;

  const totalNightCols = state.weekendBlocks.reduce((acc, b) => acc + b.nights.length, 0);

  let groupRowHtml = `<tr class="weekend-group-row"><th class="sticky-col" rowspan="2">山屋／營地（依公園分組）<br/><span style="font-weight:400;font-size:0.72rem;color:var(--text-muted);">點擊格子看明細或直達官方頁</span></th>`;
  let nightRowHtml = `<tr class="night-sub-row">`;

  state.weekendBlocks.forEach((block, bIdx) => {
    const groupClass = block.isLongWeekend ? "is-holiday-group" : "";
    groupRowHtml += `<th id="weekend-col-${bIdx}" class="${groupClass} weekend-start-col" colspan="${block.nights.length}">${block.label}</th>`;

    block.nights.forEach((night, nIdx) => {
      const classes = [];
      if (nIdx === 0) classes.push("weekend-start-col");
      if (block.isLongWeekend) classes.push("is-holiday-night");
      nightRowHtml += `<th class="${classes.join(" ")}">
        <span class="night-date-label">${night.shortDate}</span>
        <span class="night-weekday-label">${night.weekdayName}</span>
        ${night.holidayTag ? `<span class="night-holiday-tag">${night.holidayTag}</span>` : ""}
      </th>`;
    });
  });

  groupRowHtml += `</tr>`;
  nightRowHtml += `</tr>`;
  thead.innerHTML = groupRowHtml + nightRowHtml;

  const parkOrder = state.filters.park === "all" ? ["taroko", "sheipa", "yushan"] : [state.filters.park];
  let bodyHtml = "";

  for (const parkId of parkOrder) {
    const pMeta = (state.meta && state.meta.parks && state.meta.parks[parkId]) || null;
    const isUnsupported = pMeta && pMeta.supported === false;
    const parkHuts = grouped[parkId] || [];

    bodyHtml += `<tr class="park-group-row">
      <td class="sticky-col">${PARK_NAMES[parkId]} (${parkHuts.length})</td>
      <td colspan="${totalNightCols}">
        ${
          isUnsupported
            ? `⚠️ 暫無法取得（${pMeta.error || "官方站連線失敗"}）— <a href="${PARK_URLS[parkId]}" target="_blank" rel="noopener noreferrer" style="color:#fff;text-decoration:underline;">前往官方查詢頁</a>`
            : `官方申請總表：<a href="${PARK_URLS[parkId]}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;">${PARK_URLS[parkId]}</a>`
        }
      </td>
    </tr>`;

    if (isUnsupported) {
      bodyHtml += `<tr>
        <td class="sticky-col">暫無法取得</td>
        <td colspan="${totalNightCols}" style="text-align:left;color:var(--full-text);font-weight:700;">
          此國家公園目前暫無法取得資料，請點擊上方官方連結查詢。
        </td>
      </tr>`;
      continue;
    }

    if (parkHuts.length === 0) {
      bodyHtml += `<tr>
        <td class="sticky-col" style="color:var(--text-muted);">無符合山屋</td>
        <td colspan="${totalNightCols}" style="text-align:left;color:var(--text-muted);">
          在目前篩選條件下，${PARK_NAMES[parkId]}沒有符合的山屋或營地。
        </td>
      </tr>`;
      continue;
    }

    for (const hut of parkHuts) {
      const kindLabel = hut.kind === "both" ? "山屋+營地" : hut.kind === "camp" ? "營地" : "山屋";
      const kindClass = hut.kind === "both" ? "kind-both" : hut.kind === "camp" ? "kind-camp" : "kind-hut";
      const lotteryBadge = hut.booking_mode === "lottery" ? `<span class="kind-badge kind-lottery">抽籤制</span>` : "";

      bodyHtml += `<tr>
        <td class="sticky-col">
          <a class="hut-name-link" href="${hut.source_url}" target="_blank" rel="noopener noreferrer" title="前往 ${hut.name} 官方日曆頁">
            ${hut.name} <span style="font-size:0.7rem;opacity:0.65;">↗</span>
          </a>
          <div class="hut-meta-line">
            <span class="kind-badge ${kindClass}">${kindLabel}</span>
            ${lotteryBadge}
            <span class="cap-text">${formatHutCapacityText(hut)}</span>
          </div>
        </td>`;

      state.weekendBlocks.forEach((block) => {
        block.nights.forEach((night, nIdx) => {
          const vm = buildCellViewModel(hut, night);
          const colBorder = nIdx === 0 ? "weekend-start-col" : "";
          const safeTooltip = vm.tooltip.replace(/"/g, "&quot;");
          const barHtml = vm.pct > 0 ? `<div class="cell-cap-bar"><div class="cell-cap-fill" style="width:${vm.pct}%"></div></div>` : "";
          bodyHtml += `<td class="avail-cell ${colBorder}">
            <a class="cell-link ${vm.cssStatus}" href="${hut.source_url}" target="_blank" rel="noopener noreferrer"
               data-hut-id="${hut.id}" data-date="${night.date}" data-weekday="${night.weekdayName}" title="${safeTooltip}">
              <span class="cell-main-val">${vm.mainText}</span>
              <span class="cell-sub-val">${vm.subText}</span>
              ${barHtml}
            </a>
          </td>`;
        });
      });

      bodyHtml += `</tr>`;
    }
  }

  tbody.innerHTML = bodyHtml;
}

function renderCardsView() {
  const headerEl = document.getElementById("cards-weekend-header");
  const containerEl = document.getElementById("cards-container");
  const counterEl = document.getElementById("summary-counter");

  const { grouped, totalMatched } = getFilteredHutsByPark();
  counterEl.textContent = `顯示 ${totalMatched} / ${state.huts.length} 處宿營地`;

  const activeIdx = state.filters.activeWeekendIndex;
  const block = state.weekendBlocks[activeIdx] || state.weekendBlocks[0];
  if (!block) return;

  headerEl.innerHTML = `
    <div>
      <strong style="font-size:1.02rem;">${block.label}</strong>
      <div style="font-size:0.78rem;color:var(--text-muted);">點選格子可檢視完整審核／候補明細並前往官方申請頁</div>
    </div>
    <div class="weekend-nav-btns">
      <button type="button" class="btn-weekend-nav" id="prev-weekend-btn" ${activeIdx <= 0 ? "disabled" : ""}>◀ 上一週末</button>
      <button type="button" class="btn-weekend-nav" id="next-weekend-btn" ${activeIdx >= state.weekendBlocks.length - 1 ? "disabled" : ""}>下一週末 ▶</button>
    </div>
  `;

  const prevBtn = document.getElementById("prev-weekend-btn");
  const nextBtn = document.getElementById("next-weekend-btn");
  if (prevBtn) prevBtn.addEventListener("click", () => jumpToWeekend(Math.max(0, activeIdx - 1)));
  if (nextBtn) nextBtn.addEventListener("click", () => jumpToWeekend(Math.min(state.weekendBlocks.length - 1, activeIdx + 1)));

  const parkOrder = state.filters.park === "all" ? ["taroko", "sheipa", "yushan"] : [state.filters.park];
  let cardsHtml = "";

  for (const parkId of parkOrder) {
    const pMeta = (state.meta && state.meta.parks && state.meta.parks[parkId]) || null;
    if (pMeta && pMeta.supported === false) {
      cardsHtml += `<div class="hut-card">
        <div class="hut-card-header">
          <strong>${PARK_NAMES[parkId]}</strong>
          <span class="park-pill unsupported">暫無法取得</span>
        </div>
        <p style="margin:0;font-size:0.84rem;color:var(--full-text);">此公園目前暫無法取得資料，請前往 <a href="${PARK_URLS[parkId]}" target="_blank" rel="noopener noreferrer">官方網站</a> 查詢。</p>
      </div>`;
      continue;
    }

    const parkHuts = grouped[parkId] || [];
    for (const hut of parkHuts) {
      const kindLabel = hut.kind === "both" ? "山屋+營地" : hut.kind === "camp" ? "營地" : "山屋";
      const kindClass = hut.kind === "both" ? "kind-both" : hut.kind === "camp" ? "kind-camp" : "kind-hut";
      const lotteryBadge = hut.booking_mode === "lottery" ? `<span class="kind-badge kind-lottery">抽籤制</span>` : "";

      let nightsHtml = "";
      for (const night of block.nights) {
        const vm = buildCellViewModel(hut, night);
        const safeTooltip = vm.tooltip.replace(/"/g, "&quot;");
        nightsHtml += `
          <a class="cell-link ${vm.cssStatus}" href="${hut.source_url}" target="_blank" rel="noopener noreferrer"
             data-hut-id="${hut.id}" data-date="${night.date}" data-weekday="${night.weekdayName}" title="${safeTooltip}">
            <span class="card-night-date">${night.shortDate} ${night.weekdayName}</span>
            <span class="cell-main-val">${vm.mainText}</span>
            <span class="cell-sub-val">${vm.subText}</span>
          </a>
        `;
      }

      cardsHtml += `<article class="hut-card">
        <div class="hut-card-header">
          <div>
            <a class="hut-name-link" href="${hut.source_url}" target="_blank" rel="noopener noreferrer">${hut.name} ↗</a>
            <div class="hut-meta-line">
              <span class="kind-badge ${kindClass}">${kindLabel}</span>
              ${lotteryBadge}
              <span class="cap-text">${formatHutCapacityText(hut)}</span>
            </div>
          </div>
          <span class="hut-card-park">${PARK_SHORT_NAMES[hut.park]}</span>
        </div>
        <div class="hut-card-nights">${nightsHtml}</div>
      </article>`;
    }
  }

  if (!cardsHtml) {
    cardsHtml = `<div class="state-box" style="grid-column: 1 / -1;">無符合目前篩選條件的山屋或營地。</div>`;
  }

  containerEl.innerHTML = cardsHtml;
}

function updateActiveFilterBadge() {
  const { type, minSpots, search } = state.filters;
  const hasAdvanced = type !== "all" || minSpots > 1 || search.trim().length > 0;
  const dot = document.getElementById("active-filter-badge");
  if (dot) dot.hidden = !hasAdvanced;
}

function renderAll() {
  const matrixSection = document.getElementById("matrix-view-section");
  const cardsSection = document.getElementById("cards-view-section");

  // Sync view mode buttons active state
  document.querySelectorAll("#view-mode-group .seg-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === state.filters.viewMode);
  });

  updateActiveFilterBadge();
  renderKpiStrip();
  renderWeekendJumpBar();

  if (state.filters.viewMode === "cards") {
    matrixSection.hidden = true;
    cardsSection.hidden = false;
    renderCardsView();
  } else {
    cardsSection.hidden = true;
    matrixSection.hidden = false;
    renderMatrixView();
  }
}

async function loadAllData(bustCache = false) {
  const [huts, availability, meta] = await Promise.all([
    fetchJsonWithFallback("huts.json", bustCache),
    fetchJsonWithFallback("availability.json", bustCache),
    fetchJsonWithFallback("meta.json", bustCache),
  ]);

  try {
    const holidays = await fetchJsonWithFallback("holidays.json", bustCache);
    if (holidays && holidays.holidays) {
      state.holidaysData = holidays;
    }
  } catch (_) {
    state.holidaysData = FALLBACK_HOLIDAYS_DATA;
  }

  state.huts = Array.isArray(huts) ? huts : [];
  state.hutsById.clear();
  for (const h of state.huts) {
    state.hutsById.set(h.id, h);
  }

  state.meta = meta || {};
  state.availabilityMap.clear();
  for (const rec of availability || []) {
    state.availabilityMap.set(`${rec.hut_id}__${rec.date}`, rec);
  }

  let baseDate = new Date();
  if (meta && meta.fetched_at) {
    const isoDatePart = String(meta.fetched_at).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoDatePart)) {
      baseDate = parseLocalDate(isoDatePart);
    }
  }

  state.weekendBlocks = computeUpcomingWeekendBlocks(baseDate, 8, state.holidaysData);
  renderMetaHeader();
  renderAll();
}

/* ==========================================================================
   Manual Update Request & Live Progress Polling
   ========================================================================== */
async function triggerServerScrape(parksList) {
  const feedbackEl = document.getElementById("refresh-modal-feedback");
  feedbackEl.hidden = false;
  feedbackEl.textContent = "正在向伺服器送出更新要求…";

  try {
    const resp = await fetch("/api/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parks: parksList, months_ahead: 2, interval: 1.5 }),
    });

    if (resp.status === 404 || resp.status === 405) {
      throw new Error("STATIC_HOST");
    }

    const data = await resp.json();
    feedbackEl.textContent = data.message || "已啟動背景更新！";
    document.getElementById("refresh-modal-backdrop").hidden = true;
    showToast("🔄 已送出更新要求！正在背景禮貌抓取最新資料");
    startPollingRefreshStatus();
  } catch (err) {
    // Fallback if hosted on static GitHub Pages without local Python server
    await loadAllData(true);
    feedbackEl.innerHTML = `
      ✅ 已重新讀取最新靜態資料檔！<br/>
      <small>提示：若在純靜態空間（如 GitHub Pages）欲觸發遠端爬蟲，請至 GitHub Repo ➔ Actions ➔ 點擊「Run workflow」，或於本機執行 <code>.\\run_scrape.ps1 -Serve</code> 啟用即時爬蟲 API。</small>
    `;
    showToast("✅ 已重新載入最新 JSON 資料檔！");
  }
}

function startPollingRefreshStatus() {
  const banner = document.getElementById("live-progress-banner");
  const refreshBtn = document.getElementById("open-refresh-modal-btn");
  const refreshLabel = document.getElementById("refresh-btn-label");
  banner.hidden = false;
  refreshBtn.classList.add("is-spinning");
  refreshLabel.textContent = "更新進行中…";

  if (state.pollTimer) clearInterval(state.pollTimer);

  const pollFn = async () => {
    try {
      const resp = await fetch(`/api/refresh/status?t=${Date.now()}`, { cache: "no-store" });
      if (!resp.ok) return;
      const payload = await resp.json();
      const st = payload.status;
      if (!st) return;

      const total = Math.max(1, st.total_huts || 1);
      const done = st.completed_huts || 0;
      const pct = Math.min(100, Math.round((done / total) * 100));

      document.getElementById("progress-status-detail").textContent = st.message || "";
      document.getElementById("progress-percentage").textContent = `${pct}% (${done}/${total})`;
      document.getElementById("progress-bar-fill").style.width = `${pct}%`;

      if (!st.is_running) {
        clearInterval(state.pollTimer);
        state.pollTimer = null;
        refreshBtn.classList.remove("is-spinning");
        refreshLabel.textContent = "手動更新資料";

        await loadAllData(true);
        setTimeout(() => {
          banner.hidden = true;
        }, 3500);

        if (st.last_error) {
          showToast(`⚠️ 更新發生錯誤：${st.last_error}`, 6000);
        } else {
          showToast("✅ 資料已完成更新並自動重載！");
        }
      }
    } catch (_) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  };

  pollFn();
  state.pollTimer = setInterval(pollFn, 1500);
}

function bindEvents() {
  // Theme switcher
  document.getElementById("theme-toggle-btn").addEventListener("click", () => {
    applyTheme(state.theme === "dark" ? "light" : "dark");
  });

  // Mobile filter drawer toggle
  const mobileExpandBtn = document.getElementById("mobile-filter-expand-btn");
  const collapsible = document.getElementById("filters-collapsible");
  mobileExpandBtn.addEventListener("click", () => {
    const expanded = collapsible.classList.toggle("is-expanded");
    mobileExpandBtn.setAttribute("aria-expanded", String(expanded));
  });

  // Park filter buttons
  document.querySelectorAll("#park-filter-group .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#park-filter-group .seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.filters.park = btn.dataset.park;
      renderAll();
    });
  });

  // Type filter buttons
  document.querySelectorAll("#type-filter-group .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#type-filter-group .seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.filters.type = btn.dataset.type;
      renderAll();
    });
  });

  // Quick spots buttons & custom number input
  const minSpotsInput = document.getElementById("min-spots-input");
  document.querySelectorAll("#quick-spots-group .spot-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = Number(btn.dataset.spots) || 1;
      minSpotsInput.value = String(val);
      state.filters.minSpots = val;
      document.querySelectorAll("#quick-spots-group .spot-btn").forEach((b) => {
        b.classList.toggle("active", Number(b.dataset.spots) === val);
      });
      renderAll();
    });
  });

  minSpotsInput.addEventListener("input", () => {
    const val = Math.max(1, Number(minSpotsInput.value) || 1);
    state.filters.minSpots = val;
    document.querySelectorAll("#quick-spots-group .spot-btn").forEach((b) => {
      b.classList.toggle("active", Number(b.dataset.spots) === val);
    });
    renderAll();
  });

  // Only available toggle
  const onlyAvailToggle = document.getElementById("only-available-toggle");
  onlyAvailToggle.addEventListener("change", () => {
    state.filters.onlyAvailable = onlyAvailToggle.checked;
    renderAll();
  });

  // Search input & Reset button
  const searchInput = document.getElementById("hut-search-input");
  searchInput.addEventListener("input", () => {
    state.filters.search = searchInput.value;
    renderAll();
  });

  document.getElementById("reset-filters-btn").addEventListener("click", () => {
    state.filters.park = "all";
    state.filters.type = "all";
    state.filters.minSpots = 1;
    state.filters.onlyAvailable = false;
    state.filters.search = "";

    document.querySelectorAll("#park-filter-group .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.park === "all"));
    document.querySelectorAll("#type-filter-group .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.type === "all"));
    document.querySelectorAll("#quick-spots-group .spot-btn").forEach((b) => b.classList.toggle("active", Number(b.dataset.spots) === 1));
    minSpotsInput.value = "1";
    onlyAvailToggle.checked = false;
    searchInput.value = "";
    renderAll();
  });

  // View mode switcher
  document.querySelectorAll("#view-mode-group .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.filters.viewMode = btn.dataset.view;
      renderAll();
    });
  });

  // Delegate cell click to open interactive detail sheet on mobile / touch or Alt-click,
  // or let normal click open the detail sheet with 1-click official CTA button!
  document.addEventListener("click", (e) => {
    const cellLink = e.target.closest(".cell-link[data-hut-id]");
    if (cellLink && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      openCellDetailModal(cellLink.dataset.hutId, cellLink.dataset.date, cellLink.dataset.weekday);
    }
  });

  // Close Cell Detail Modal
  const detailBackdrop = document.getElementById("cell-detail-backdrop");
  document.getElementById("close-cell-detail-btn").addEventListener("click", () => {
    detailBackdrop.hidden = true;
  });
  detailBackdrop.addEventListener("click", (e) => {
    if (e.target === detailBackdrop) detailBackdrop.hidden = true;
  });

  // Manual Refresh Modal events
  const refreshBackdrop = document.getElementById("refresh-modal-backdrop");
  document.getElementById("open-refresh-modal-btn").addEventListener("click", () => {
    document.getElementById("refresh-modal-feedback").hidden = true;
    refreshBackdrop.hidden = false;
  });
  document.getElementById("close-refresh-modal-btn").addEventListener("click", () => {
    refreshBackdrop.hidden = true;
  });
  refreshBackdrop.addEventListener("click", (e) => {
    if (e.target === refreshBackdrop) refreshBackdrop.hidden = true;
  });

  document.getElementById("btn-reload-json-now").addEventListener("click", async () => {
    await loadAllData(true);
    refreshBackdrop.hidden = true;
    showToast("⚡ 已重新載入最新 JSON 資料檔！");
  });

  document.getElementById("btn-trigger-targeted-scrape").addEventListener("click", () => {
    const checked = Array.from(document.querySelectorAll("input[name='refresh-park']:checked")).map((el) => el.value);
    if (checked.length === 0) {
      showToast("⚠️ 請至少勾選一座國家公園");
      return;
    }
    triggerServerScrape(checked);
  });

  document.getElementById("btn-trigger-full-scrape").addEventListener("click", () => {
    triggerServerScrape(["taroko", "sheipa", "yushan"]);
  });

  document.getElementById("reload-partial-btn").addEventListener("click", async () => {
    await loadAllData(true);
    showToast("📥 已載入最新進度資料！");
  });
}

async function initApp() {
  initTheme();
  const loadingEl = document.getElementById("loading-state");
  bindEvents();

  try {
    await loadAllData(false);
    loadingEl.hidden = true;

    // Check if a background refresh is already running on the local server
    try {
      const resp = await fetch("/api/refresh/status", { cache: "no-store" });
      if (resp.ok) {
        const payload = await resp.json();
        if (payload.status && payload.status.is_running) {
          startPollingRefreshStatus();
        }
      }
    } catch (_) {
      // Pure static mode
    }
  } catch (err) {
    loadingEl.innerHTML = `
      <p style="color:var(--full-text);font-weight:700;">⚠️ 無法載入資料檔 (data/*.json)</p>
      <p style="font-size:0.86rem;">請先點選右上角「🔄 手動更新資料」或執行爬蟲指令 <code>.\\run_scrape.ps1 -Serve</code>。</p>
      <p style="font-size:0.78rem;color:var(--text-muted);">錯誤詳情：${err.message}</p>
    `;
  }
}

document.addEventListener("DOMContentLoaded", initApp);
