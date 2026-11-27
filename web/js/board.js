/**
 * board.js — 空位表（organism）。第一欄山屋名牌固定，欄位按週末分組。
 * 手機版只顯示選中的週末（CSS 依 data-wk / .is-sel 隱藏其他欄）。
 */
import { h, kindGlyph } from "./dom.js";
import { PARKS, PARK_ORDER, cellFact } from "./model.js";

const CELL_TEXT = { full: "滿", lottery: "籤", na: "·", closed: "封" };
const STATUS_WORD = {
  open: "有位",
  low: "有位但不夠",
  full: "額滿",
  lottery: "抽籤",
  na: "未開放或已截止",
  closed: "封閉",
};

function capacityText(hut) {
  const c = hut.capacity || {};
  const parts = [];
  if (hut.kind !== "camp") parts.push(`床 ${c.holiday_beds || 0}`);
  if (hut.kind !== "hut") parts.push(`營 ${c.holiday_tents || 0}`);
  return parts.join("・");
}

export function renderBoard(store, huts, { animate = false, onCell, onWeekend } = {}) {
  const thead = document.getElementById("thead");
  const tbody = document.getElementById("tbody");
  const blocks = store.weekends;
  const sel = store.filters.weekend;
  const party = store.filters.party;

  /* ---- 表頭兩列：週末、夜晚 ---- */
  const row1 = h("tr", null, h("th", { class: "corner", rowspan: 2, scope: "col" }, "山屋／營地"));
  const row2 = h("tr");
  blocks.forEach((b, i) => {
    const selCls = i === sel ? " is-sel" : "";
    row1.append(
      h(
        "th",
        { class: `wk${selCls}`, colspan: b.nights.length, scope: "colgroup", dataset: { wk: i } },
        h(
          "button",
          { type: "button", class: "wk-head", onclick: () => onWeekend && onWeekend(i), "aria-label": `選擇 ${b.range} 這個週末` },
          h("span", { class: "wk-range" }, b.range),
          b.holiday ? h("span", { class: "wk-name" }, b.holiday) : null
        )
      )
    );
    b.nights.forEach((n, j) => {
      row2.append(
        h(
          "th",
          { class: `night${j === 0 ? " wk-start" : ""}${selCls}`, scope: "col", dataset: { wk: i } },
          h(
            "div",
            { class: "night-head" },
            h("span", { class: "night-date" }, n.md),
            h("span", { class: `night-day${n.holiday ? " is-holiday" : ""}` }, `週${n.day}夜`)
          )
        )
      );
    });
  });
  thead.replaceChildren(row1, row2);

  /* ---- 表身：依園區分組 ---- */
  const totalCols = 1 + blocks.reduce((a, b) => a + b.nights.length, 0);
  const frag = document.createDocumentFragment();
  for (const park of PARK_ORDER) {
    const group = huts.filter((x) => x.park === park);
    if (!group.length) continue;
    const p = PARKS[park];
    frag.append(
      h(
        "tr",
        { class: "park-row" },
        h(
          "th",
          { colspan: totalCols, scope: "colgroup" },
          h(
            "div",
            { class: "park-title" },
            h("h2", null, p.short),
            h("span", null, `${group.length} 處`),
            h("a", { href: p.url, target: "_blank", rel: "noopener noreferrer" }, "官方申請頁")
          )
        )
      )
    );

    for (const hut of group) {
      const tr = h(
        "tr",
        { class: "hut-row" },
        h(
          "th",
          { scope: "row" },
          h(
            "div",
            { class: "hut" },
            h("a", { class: "hut-name", href: hut.source_url, target: "_blank", rel: "noopener noreferrer", title: `${hut.name}（官方頁）` }, hut.name),
            h("span", { class: "hut-meta" }, kindGlyph(hut.kind), h("span", { class: "glyph" }, capacityText(hut)))
          )
        )
      );
      let col = 0;
      blocks.forEach((b, i) => {
        b.nights.forEach((n, j) => {
          const f = cellFact(store, hut, n.date);
          const text = f.s === "open" || f.s === "low" ? String(f.n) : CELL_TEXT[f.s];
          const label =
            `${hut.name}，${n.md} 週${n.day}夜，${STATUS_WORD[f.s]}` +
            (f.s === "open" || f.s === "low" ? `，剩 ${f.n} 位` : "") +
            (f.s === "low" ? `，你們有 ${party} 人` : "");
          const btn = h(
            "button",
            {
              type: "button",
              class: "cell",
              dataset: { s: f.s, ...(f.s === "open" && f.f >= 0.62 ? { deep: "" } : {}) },
              style: { "--f": f.f.toFixed(2), "--col": col },
              "aria-label": label,
              onclick: () => onCell && onCell(hut, n, f),
            },
            text
          );
          tr.append(h("td", { class: `${j === 0 ? "wk-start" : ""}${i === sel ? " is-sel" : ""}`.trim() || null, dataset: { wk: i } }, btn));
          col += 1;
        });
      });
      frag.append(tr);
    }
  }
  tbody.replaceChildren(frag);

  const table = document.getElementById("grid-table");
  table.classList.toggle("is-inking", animate);
  if (animate) setTimeout(() => table.classList.remove("is-inking"), 2200);
}

/** 桌面版：把選中的週末捲進視野 */
export function scrollToWeekend(index) {
  const scroller = document.getElementById("grid");
  const th = scroller.querySelector(`thead th.wk[data-wk="${index}"]`);
  const corner = scroller.querySelector("thead .corner");
  if (!th || !corner || th.offsetParent === null) return;
  const target = th.offsetLeft - corner.offsetWidth - 8;
  scroller.scrollTo({ left: Math.max(0, target), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}
