/**
 * 台灣國家公園山屋／營地 未來週末空位彙整 前端應用程式
 * 純靜態讀取 data/*.json，不在瀏覽器端直接請求官方網站。
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
  source: "行政院人事行政總處 政府行政機關辦公日曆表（內建 2026–2027 國定假日與連假清單）",
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
  huts: [],
  availabilityMap: new Map(), // key: `${hut_id}__${date}` -> Availability
  meta: null,
  holidaysData: FALLBACK_HOLIDAYS_DATA,
  weekendBlocks: [],
  filters: {
    park: "all",
    type: "all", // 'all' | 'beds' | 'tents'
    minSpots: 1,
    onlyAvailable: false,
    search: "",
    viewMode: "matrix", // 'matrix' | 'cards'
    activeWeekendIndex: 0,
  },
};

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
  return day === 0 || day === 6; // Sunday=0, Saturday=6
}

/**
 * Compute upcoming 8 weekend / consecutive holiday accommodation night blocks.
 * Standard weekend (Sat-Sun off) -> accommodation nights are Fri night & Sat night.
 * Consecutive holiday [D_start, D_end] -> accommodation nights are (D_start - 1 day) through (D_end - 1 day).
 */
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

async function fetchJsonWithFallback(filename) {
  const candidates = [`./data/${filename}`, `../data/${filename}`];
  let lastErr = null;
  for (const url of candidates) {
    try {
      const resp = await fetch(url, { cache: "no-cache" });
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

function hutMatchesTypeFilter(hut, typeFilter) {
  if (typeFilter === "beds") {
    return hut.kind === "hut" || hut.kind === "both";
  }
  if (typeFilter === "tents") {
    return hut.kind === "camp" || hut.kind === "both";
  }
  return true;
}

function hutHasAvailableWeekendNight(hut, weekendBlocks, typeFilter, minSpots) {
  for (const block of weekendBlocks) {
    for (const night of block.nights) {
      const avail = state.availabilityMap.get(`${hut.id}__${night.date}`);
      if (avail && avail.status === "available") {
        const spots = getEffectiveRemaining(hut, avail, typeFilter);
        if (spots >= minSpots) {
          return true;
        }
      }
    }
  }
  return false;
}

function formatHutCapacityText(hut) {
  const c = hut.capacity || {};
  const parts = [];
  if (hut.kind === "hut" || hut.kind === "both") {
    const bedStr = c.weekday_beds === c.holiday_beds ? `${c.holiday_beds}` : `平${c.weekday_beds}/假${c.holiday_beds}`;
    parts.push(`床位 ${bedStr}`);
  }
  if (hut.kind === "camp" || hut.kind === "both") {
    const tentStr = c.weekday_tents === c.holiday_tents ? `${c.holiday_tents}` : `平${c.weekday_tents}/假${c.holiday_tents}`;
    parts.push(`營位 ${tentStr}`);
  }
  if (parts.length === 0) return "承載量 0";
  return parts.join(" · ");
}

function buildCellViewModel(hut, night) {
  const avail = state.availabilityMap.get(`${hut.id}__${night.date}`);
  const typeFilter = state.filters.type;
  const minSpots = state.filters.minSpots;

  if (!avail) {
    return {
      cssStatus: "status-not_open",
      mainText: "未開放",
      subText: "無資料",
      tooltip: `${hut.name} (${night.date} ${night.weekdayName})：尚未開放或無資料`,
    };
  }

  const beds = avail.remaining_beds || 0;
  const tents = avail.remaining_tents || 0;
  const effSpots = getEffectiveRemaining(hut, avail, typeFilter);
  const cap = hut.capacity || {};
  const capDesc = `假日承載：床 ${cap.holiday_beds || 0} / 營 ${cap.holiday_tents || 0}`;

  if (avail.status === "closed") {
    return {
      cssStatus: "status-closed",
      mainText: "封閉",
      subText: "暫不開放",
      tooltip: `${hut.name} (${night.date})：路線或宿營地封閉中`,
    };
  }

  if (avail.status === "not_open") {
    return {
      cssStatus: "status-not_open",
      mainText: "未開放",
      subText: "截止/未開",
      tooltip: `${hut.name} (${night.date})：已逾申請期限或尚未進入開放申請窗口`,
    };
  }

  if (avail.status === "lottery") {
    let subText = `排隊 ${avail.queue}`;
    if (beds === 0 && tents === 0) {
      subText = `已滿 · 候補 ${avail.queue}`;
    } else if (avail.approved === 0 && avail.reviewing === 0) {
      subText = `待抽 ${beds} · 預約 ${avail.queue}`;
    } else {
      subText = `餘 ${beds} · 備取 ${avail.queue}`;
    }
    return {
      cssStatus: "status-lottery",
      mainText: "抽籤制",
      subText,
      tooltip: `${hut.name} (${night.date} 抽籤制)\n官方顯示餘額：床 ${beds}\n排隊預約(含備取)：${avail.queue} 人\n審核中：${avail.reviewing} 人\n核准入園：${avail.approved} 人\n(${capDesc})`,
    };
  }

  if (avail.status === "full" || effSpots === 0) {
    const subParts = [];
    if (avail.queue > 0) {
      subParts.push(`排隊 ${avail.queue}`);
    } else if (avail.reviewing > 0) {
      subParts.push(`審核 ${avail.reviewing}`);
    } else {
      subParts.push(`已過 ${avail.approved}`);
    }
    return {
      cssStatus: "status-full",
      mainText: "額滿 (0)",
      subText: subParts.join(" · "),
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
    mainText = `床${beds} · 營${tents}`;
  } else if (hut.kind === "camp") {
    mainText = `營 ${tents}`;
  } else {
    mainText = `床 ${beds}`;
  }

  const meetsMinSpots = effSpots >= minSpots;
  const cssStatus = meetsMinSpots ? "status-available" : "status-low";

  const subParts = [];
  if (!meetsMinSpots) {
    subParts.push(`不足 ${minSpots} 人`);
  } else if (avail.reviewing > 0) {
    subParts.push(`審${avail.reviewing} · 過${avail.approved}`);
  } else if (avail.queue > 0) {
    subParts.push(`排${avail.queue} · 過${avail.approved}`);
  } else {
    subParts.push(`已過 ${avail.approved}`);
  }

  return {
    cssStatus,
    mainText,
    subText: subParts.join(" "),
    tooltip: `${hut.name} (${night.date} ${night.weekdayName})\n剩餘名額：床位 ${beds} / 營位 ${tents}\n排隊/候補：${avail.queue} 人\n審核/待處理：${avail.reviewing} 人\n已核准/通過：${avail.approved} 人\n(${capDesc})\n點擊前往官方申請頁面`,
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
    ? `更新時間：${meta.fetched_at}`
    : `更新時間：${d.toLocaleString("zh-TW", { hour12: false })}`;

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
    btn.addEventListener("click", () => {
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
    });
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

function renderMatrixView() {
  const thead = document.getElementById("matrix-thead");
  const tbody = document.getElementById("matrix-tbody");
  const counterEl = document.getElementById("summary-counter");

  const { grouped, totalMatched } = getFilteredHutsByPark();
  counterEl.textContent = `顯示 ${totalMatched} / ${state.huts.length} 處宿營地`;

  const totalNightCols = state.weekendBlocks.reduce((acc, b) => acc + b.nights.length, 0);

  // Build 2-level table header
  let groupRowHtml = `<tr class="weekend-group-row"><th class="sticky-col" rowspan="2">山屋／營地（依公園分組）<br/><span style="font-weight:400;font-size:0.73rem;color:#556b63;">點擊名稱或格子直達官方頁</span></th>`;
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

  // Build table body grouped by park
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
            : `官方申請總表：<a href="${PARK_URLS[parkId]}" target="_blank" rel="noopener noreferrer" style="color:#a9f0d1;text-decoration:underline;">${PARK_URLS[parkId]}</a>`
        }
      </td>
    </tr>`;

    if (isUnsupported) {
      bodyHtml += `<tr>
        <td class="sticky-col">暫無法取得</td>
        <td colspan="${totalNightCols}" style="text-align:left;color:#9c2323;font-weight:700;">
          此國家公園目前暫無法取得資料，請點擊上方官方連結查詢。
        </td>
      </tr>`;
      continue;
    }

    if (parkHuts.length === 0) {
      bodyHtml += `<tr>
        <td class="sticky-col" style="color:#768780;">無符合條件山屋</td>
        <td colspan="${totalNightCols}" style="text-align:left;color:#768780;">
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
            ${hut.name} <span style="font-size:0.72rem;opacity:0.65;">↗</span>
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
          bodyHtml += `<td class="avail-cell ${colBorder}">
            <a class="cell-link ${vm.cssStatus}" href="${hut.source_url}" target="_blank" rel="noopener noreferrer" title="${safeTooltip}">
              <span class="cell-main-val">${vm.mainText}</span>
              <span class="cell-sub-val">${vm.subText}</span>
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

  const block = state.weekendBlocks[state.filters.activeWeekendIndex] || state.weekendBlocks[0];
  if (!block) return;

  headerEl.innerHTML = `
    <div>
      <strong style="font-size:1.02rem;">${block.label}</strong>
      <div style="font-size:0.8rem;color:#556b63;">點選上方週末按鈕可切換不同週末；點擊任一住宿夜直達官方申請頁</div>
    </div>
  `;

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
        <p style="margin:0;font-size:0.85rem;color:#9c2323;">此公園目前暫無法取得資料，請前往 <a href="${PARK_URLS[parkId]}" target="_blank" rel="noopener noreferrer">官方網站</a> 查詢。</p>
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
          <a class="cell-link ${vm.cssStatus}" href="${hut.source_url}" target="_blank" rel="noopener noreferrer" title="${safeTooltip}">
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

function renderAll() {
  const matrixSection = document.getElementById("matrix-view-section");
  const cardsSection = document.getElementById("cards-view-section");

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

function bindEvents() {
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

  // Search input
  const searchInput = document.getElementById("hut-search-input");
  searchInput.addEventListener("input", () => {
    state.filters.search = searchInput.value;
    renderAll();
  });

  // View mode switcher
  document.querySelectorAll("#view-mode-group .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#view-mode-group .seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.filters.viewMode = btn.dataset.view;
      renderAll();
    });
  });
}

async function initApp() {
  const loadingEl = document.getElementById("loading-state");
  bindEvents();

  try {
    const [huts, availability, meta] = await Promise.all([
      fetchJsonWithFallback("huts.json"),
      fetchJsonWithFallback("availability.json"),
      fetchJsonWithFallback("meta.json"),
    ]);

    try {
      const holidays = await fetchJsonWithFallback("holidays.json");
      if (holidays && holidays.holidays) {
        state.holidaysData = holidays;
      }
    } catch (_) {
      state.holidaysData = FALLBACK_HOLIDAYS_DATA;
    }

    state.huts = Array.isArray(huts) ? huts : [];
    state.meta = meta || {};
    state.availabilityMap.clear();

    let minDateStr = null;
    for (const rec of availability || []) {
      state.availabilityMap.set(`${rec.hut_id}__${rec.date}`, rec);
    }

    // Determine start date from meta.fetched_at (in Taiwan timezone) or local today
    let baseDate = new Date();
    if (meta && meta.fetched_at) {
      const isoDatePart = String(meta.fetched_at).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(isoDatePart)) {
        baseDate = parseLocalDate(isoDatePart);
      }
    }

    state.weekendBlocks = computeUpcomingWeekendBlocks(baseDate, 8, state.holidaysData);

    loadingEl.hidden = true;
    renderMetaHeader();
    renderAll();
  } catch (err) {
    loadingEl.innerHTML = `
      <p style="color:#9c2323;font-weight:700;">⚠️ 無法載入資料檔 (data/*.json)</p>
      <p style="font-size:0.86rem;">請先執行爬蟲指令（例如 <code>python -m scraper.src.scraper</code> 或 <code>.\\run_scrape.ps1</code>）產生最新資料。</p>
      <p style="font-size:0.78rem;color:#768780;">錯誤詳情：${err.message}</p>
    `;
  }
}

document.addEventListener("DOMContentLoaded", initApp);
