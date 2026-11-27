/**
 * ridge.js — 招牌元件「空位稜線」。
 * 每個週末畫成一座山：山峰＝當晚還睡得下這團的山屋數；Y 軸上限＝目前篩選下的山屋總數（誠實比例，不放大）。
 * 選中的那座峰頂用一筆「圓相」圈起來。
 */
import { s } from "./dom.js";
import { openCountOnNight } from "./model.js";

const W = 1000;
const LEFT = 44;
const TOP = 34;
const GROUND = 178;
const PLOT_H = GROUND - TOP;

/* 固定種子的小抖動：同一份資料每次畫出同一條「手繪」線 */
function jitter(seed) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/* Catmull-Rom → 三次貝茲，讓稜線柔和 */
function smoothPath(pts) {
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const t = 0.1;
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

function massifPoints(values, x0, x1, max, seed) {
  const y = (v) => GROUND - (v / max) * PLOT_H;
  const k = values.length;
  const span = x1 - x0;
  const pts = [[x0, GROUND]];
  // 山腳緩坡
  pts.push([x0 + span * 0.12, GROUND - (GROUND - y(values[0])) * 0.22 + jitter(seed) * 1.5]);
  values.forEach((v, i) => {
    const x = x0 + span * (0.24 + (0.52 * (k === 1 ? 0.5 : i / (k - 1))));
    if (i > 0) {
      // 兩峰之間的鞍部：比較低的那峰再往下沉一點
      const prevX = pts[pts.length - 1][0];
      const low = Math.min(v, values[i - 1]);
      pts.push([(prevX + x) / 2, y(low) + (GROUND - y(low)) * 0.18 + jitter(seed + i * 7) * 1.5]);
    }
    pts.push([x + jitter(seed + i) * 3, y(v)]);
  });
  pts.push([x0 + span * 0.88, GROUND - (GROUND - y(values[k - 1])) * 0.2 + jitter(seed + 31) * 1.5]);
  pts.push([x1, GROUND]);
  return pts;
}

/* 一筆圓相：半徑隨角度微微起伏、留一個缺口 */
function ensoPath(cx, cy, r, seed) {
  const start = -0.6 + jitter(seed) * 0.3;
  const sweep = Math.PI * 2 * 0.9;
  const steps = 46;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const a = start + (sweep * i) / steps;
    const rr = r * (1 + 0.05 * Math.sin(a * 3 + seed) + (i / steps) * 0.06);
    const x = cx + Math.cos(a) * rr * 1.18;
    const y = cy + Math.sin(a) * rr;
    d += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

const prevShapes = new Map();

export function renderRidge(svg, store, huts, { animate = false, onSelect } = {}) {
  const blocks = store.weekends;
  const sel = store.filters.weekend;
  const max = Math.max(1, huts.length);
  const slot = (W - LEFT) / Math.max(1, blocks.length);

  svg.replaceChildren();
  svg.classList.toggle("is-drawing", animate);

  // 等高線＝刻度：25%、50%、75%、全部
  for (const ratio of [0.25, 0.5, 0.75, 1]) {
    const yy = GROUND - ratio * PLOT_H;
    svg.append(s("line", { class: "r-grid", x1: LEFT - 6, x2: W, y1: yy, y2: yy }));
    svg.append(s("text", { class: "r-grid-label", x: 0, y: yy + 4 }, ratio === 1 ? `${max}處` : String(Math.round(max * ratio))));
  }
  svg.append(s("line", { class: "r-ground", x1: LEFT - 6, x2: W, y1: GROUND, y2: GROUND }));

  const masses = [];
  blocks.forEach((b, i) => {
    const values = b.nights.map((n) => openCountOnNight(store, huts, n.date));
    const peak = Math.max(...values);
    const x0 = LEFT + i * slot + slot * 0.04;
    const x1 = LEFT + (i + 1) * slot - slot * 0.04;
    const pts = massifPoints(values, x0, x1, max, i * 17 + 3);
    const line = smoothPath(pts);
    const area = `${line} L${x0.toFixed(1)} ${GROUND} Z`;
    const peakPt = pts.reduce((a, p) => (p[1] < a[1] ? p : a), pts[0]);
    const cx = (x0 + x1) / 2;
    const isSel = i === sel;

    const nightsText = b.nights.map((n, j) => `${n.md} 週${n.day}夜 ${values[j]} 處`).join("，");
    const g = s("g", {
      class: `r-mass${isSel ? " is-sel" : ""}`,
      role: "button",
      tabindex: isSel ? 0 : -1,
      "aria-pressed": isSel ? "true" : "false",
      "aria-label": `${b.range}${b.holiday ? ` ${b.holiday}` : ""}：${nightsText}`,
      style: { "--i": i },
      "data-i": i,
    });

    const areaEl = s("path", { class: "r-area", d: area });
    const lineEl = s("path", { class: "r-line", d: line });
    const prev = prevShapes.get(i);
    if (!animate && prev) {
      // 篩選改變時，山形從舊形狀滑到新形狀（Chromium 支援 CSS d 轉場）
      areaEl.style.d = `path("${prev.area}")`;
      lineEl.style.d = `path("${prev.line}")`;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          areaEl.style.transition = "d 520ms cubic-bezier(0.22, 0.8, 0.3, 1)";
          lineEl.style.transition = "d 520ms cubic-bezier(0.22, 0.8, 0.3, 1)";
          areaEl.style.d = `path("${area}")`;
          lineEl.style.d = `path("${line}")`;
        })
      );
    }
    prevShapes.set(i, { area, line });

    const labelY = Math.min(peakPt[1] - 12, GROUND - 14);
    g.append(
      s("title", null, `${b.range}${b.holiday ? ` ${b.holiday}` : ""}`),
      areaEl,
      lineEl,
      s("text", { class: "r-peak", x: peakPt[0], y: labelY }, String(peak)),
      s("text", { class: "r-label", x: cx, y: GROUND + 24 }, b.range),
      b.holiday ? s("text", { class: "r-holiday", x: cx, y: GROUND + 42 }, b.holiday) : null
    );
    g.addEventListener("click", () => onSelect && onSelect(i));
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect && onSelect(i);
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const next = Math.min(blocks.length - 1, Math.max(0, i + (e.key === "ArrowRight" ? 1 : -1)));
        onSelect && onSelect(next, { focusRidge: true });
      }
    });
    svg.append(g);
    masses.push({ g, lineEl, isSel, peakPt, labelY });
  });

  // 墨線長度供畫線動畫使用
  if (animate) {
    for (const m of masses) m.lineEl.style.setProperty("--len", Math.ceil(m.lineEl.getTotalLength()));
    setTimeout(() => svg.classList.remove("is-drawing"), 1600 + blocks.length * 110 + 600);
  }

  // 圓相：圈住選中的峰頂數字
  const chosen = masses.find((m) => m.isSel);
  if (chosen) {
    const cx = chosen.peakPt[0];
    const cy = chosen.labelY - 6;
    const thick = s("path", { class: "r-enso", d: ensoPath(cx, cy, 17, sel + 1) });
    const thin = s("path", { class: "r-enso r-enso-thin", d: ensoPath(cx + 1, cy + 1, 18.5, sel + 5) });
    svg.append(thick, thin);
    for (const p of [thick, thin]) {
      p.style.setProperty("--len", Math.ceil(p.getTotalLength()));
      p.style.animationDelay = animate ? `${1600 + sel * 110}ms` : "0ms";
      p.classList.add("is-drawn");
    }
  }
}

export function focusSelectedMassif(svg) {
  const el = svg.querySelector(".r-mass.is-sel");
  if (el) el.focus();
}
