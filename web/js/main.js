/**
 * main.js — 頁面（template）層：持有狀態、接篩選、把 organism 組起來。
 */
import { $, h, swapText, toast } from "./dom.js";
import { PARKS, computeWeekends, loadData, visibleHuts, hutOpenInBlock, openCountOnNight, relativeTime } from "./model.js";
import { renderRidge, focusSelectedMassif } from "./ridge.js";
import { renderBoard, scrollToWeekend } from "./board.js";
import { openDetail, bindDetail } from "./detail.js";
import { bindRefresh, resumeIfRunning } from "./refresh.js";

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem("hut_filters") || "{}");
  } catch (_) {
    return {};
  }
})();

const store = {
  huts: [],
  avail: new Map(),
  meta: {},
  calendar: {},
  weekends: [],
  filters: {
    park: "all",
    type: ["all", "beds", "tents"].includes(saved.type) ? saved.type : "all",
    party: Number.isInteger(saved.party) && saved.party > 0 ? saved.party : 1,
    q: "",
    only: false,
    weekend: 0,
  },
};

let firstPaint = true;

/* ---------- 主視覺答案句 ---------- */
function renderAnswer(huts) {
  const b = store.weekends[store.filters.weekend];
  if (!b) return;
  const party = store.filters.party;
  const open = huts.filter((x) => hutOpenInBlock(store, x, b)).length;
  const per = b.nights.map((n) => ({ n, c: openCountOnNight(store, huts, n.date) }));

  $("eyebrow").replaceChildren(
    `${b.range}`,
    b.holiday ? h("b", null, `　${b.holiday}連假`) : `　週末`,
    `　${b.nights.length} 晚`
  );

  const who = party > 1 ? `你們 ${party} 個人` : "你";
  swapText(
    $("answer"),
    open > 0
      ? [h("span", { class: "num" }, String(open)), ` 處山屋還睡得下${who}。`]
      : [`這個週末，沒有一處睡得下${who}。`]
  );

  const parts = [];
  per.forEach(({ n, c }, i) => {
    if (i) parts.push("　");
    parts.push(`週${n.day}夜 `, h("span", { class: "num" }, String(c)), " 處");
  });
  if (open === 0) {
    const better = store.weekends
      .map((w) => ({ w, c: huts.filter((x) => hutOpenInBlock(store, x, w)).length }))
      .sort((a, z) => z.c - a.c)[0];
    if (better && better.c > 0) parts.push(`。${better.w.range} 比較有機會，有 ${better.c} 處。`);
  }
  swapText($("answer-sub"), parts);

  $("only-label").textContent = `只列 ${b.range} 有位的`;
}

/* ---------- 新鮮度與園區提醒 ---------- */
function renderFresh() {
  const meta = store.meta;
  const rel = relativeTime(meta.fetched_at);
  const el = $("fresh-text");
  if (!rel) {
    el.textContent = "更新時間不明";
    return;
  }
  const stamp = new Date(meta.fetched_at);
  const exact = `${stamp.getMonth() + 1}/${stamp.getDate()} ${String(stamp.getHours()).padStart(2, "0")}:${String(stamp.getMinutes()).padStart(2, "0")}`;
  el.replaceChildren(h("strong", null, `${rel.text}更新`), h("span", { class: "fresh-long" }, `（${exact}）`));
  $("fresh-dot").classList.toggle("dot--stale", rel.min > 180);

  const issues = [];
  for (const [key, p] of Object.entries(meta.parks || {})) {
    const name = PARKS[key]?.short || key;
    if (p.supported === false) issues.push(`${name}目前抓不到資料`);
    else if (p.failed_count > 0) issues.push(`${name}有 ${p.failed_count} 處這次沒抓到`);
  }
  $("notice").replaceChildren(
    ...(issues.length ? [h("p", { class: "notice" }, `${issues.join("；")}。這些格子會顯示為未開放，請到官方頁確認。`)] : [])
  );
}

/* ---------- 全部重畫 ---------- */
function render({ animate = false } = {}) {
  const base = visibleHuts(store);
  const b = store.weekends[store.filters.weekend];
  const rows = store.filters.only && b ? base.filter((x) => hutOpenInBlock(store, x, b)) : base;

  renderAnswer(base);
  renderRidge($("ridge"), store, base, { animate, onSelect: selectWeekend });

  $("loading").hidden = true;
  $("grid-table").hidden = rows.length === 0;
  const empty = $("empty");
  empty.hidden = rows.length > 0;
  if (!rows.length) {
    empty.textContent = store.filters.q
      ? `找不到名稱含「${store.filters.q}」的山屋。`
      : "沒有山屋符合這些條件。試試減少人數，或換一個週末。";
  } else {
    renderBoard(store, rows, { animate, onCell: (hut, n, f) => openDetail(store, hut, n, f), onWeekend: selectWeekend });
  }
  $("count").textContent = `列出 ${rows.length}／${store.huts.length} 處`;
}

function selectWeekend(i, { focusRidge = false } = {}) {
  if (i === store.filters.weekend) {
    scrollToWeekend(i);
    return;
  }
  store.filters.weekend = i;
  render();
  scrollToWeekend(i);
  if (focusRidge) focusSelectedMassif($("ridge"));
}

/* ---------- 篩選控制 ---------- */
function persist() {
  try {
    localStorage.setItem("hut_filters", JSON.stringify({ type: store.filters.type, party: store.filters.party }));
  } catch (_) {}
}

function bindSeg(id, key) {
  const root = $(id);
  const sync = () => root.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === store.filters[key])));
  sync();
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-v]");
    if (!btn) return;
    store.filters[key] = btn.dataset.v;
    sync();
    persist();
    render();
  });
}

function setParty(v) {
  const n = Math.max(1, Math.min(99, Math.round(Number(v) || 1)));
  store.filters.party = n;
  $("party").value = n;
  persist();
  render();
}

function bindControls() {
  bindSeg("park-seg", "park");
  bindSeg("type-seg", "type");
  $("party").value = store.filters.party;
  $("party-dec").addEventListener("click", () => setParty(store.filters.party - 1));
  $("party-inc").addEventListener("click", () => setParty(store.filters.party + 1));
  $("party").addEventListener("change", (e) => setParty(e.target.value));

  let t = null;
  $("q").addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => {
      store.filters.q = e.target.value;
      render();
    }, 160);
  });
  $("only").addEventListener("change", (e) => {
    store.filters.only = e.target.checked;
    render();
  });

  const toggle = $("controls-toggle");
  toggle.addEventListener("click", () => {
    const open = $("controls").classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "收起條件" : "更多條件";
  });

  const themeBtn = $("theme-btn");
  const syncTheme = () => {
    const night = document.documentElement.dataset.theme === "night";
    themeBtn.textContent = night ? "日間" : "夜間";
    themeBtn.setAttribute("aria-label", night ? "切換為日間配色" : "切換為夜間配色");
  };
  syncTheme();
  themeBtn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "night" ? "day" : "night";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("hut_theme", next);
    } catch (_) {}
    syncTheme();
  });
}

/* ---------- 啟動 ---------- */
async function load(bust = false) {
  const data = await loadData(bust);
  Object.assign(store, data);
  const today = new Date();
  store.weekends = computeWeekends(new Date(today.getFullYear(), today.getMonth(), today.getDate()), store.calendar);
  if (store.filters.weekend >= store.weekends.length) store.filters.weekend = 0;
  renderFresh();
  render({ animate: firstPaint && !matchMedia("(prefers-reduced-motion: reduce)").matches });
  firstPaint = false;
}

async function init() {
  bindControls();
  bindDetail();
  bindRefresh(load);
  try {
    await load(false);
  } catch (e) {
    $("loading").textContent = `讀不到山屋資料（${e.message}）。重新整理頁面，或確認 data 資料夾存在。`;
    $("answer").textContent = "讀不到資料";
    toast("讀不到山屋資料。", 6000);
    return;
  }
  resumeIfRunning(load);
  setInterval(renderFresh, 60000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
