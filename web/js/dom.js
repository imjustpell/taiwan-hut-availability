/**
 * dom.js — 原子層的 JS：建元素、通知。沒有業務邏輯。
 */

export const $ = (id) => document.getElementById(id);

/** h("td", { class: "x", dataset: { s: "open" } }, child1, "text") */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k === "style") for (const [sk, sv] of Object.entries(v)) el.style.setProperty(sk, sv);
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function s(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k === "style") for (const [sk, sv] of Object.entries(v)) el.style.setProperty(sk, sv);
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function toast(message, ms = 4200) {
  const box = $("toasts");
  if (!box) return;
  const t = h("div", { class: "toast", role: "status" }, message);
  box.append(t);
  setTimeout(() => t.remove(), ms);
}

/** 換字時加一次「墨入」動畫 */
export function swapText(el, build) {
  el.classList.remove("is-swapping");
  el.replaceChildren(...[].concat(build));
  void el.offsetWidth;
  el.classList.add("is-swapping");
}

export const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 小山屋／營地圖例符號（地圖式，不用 emoji） */
export function kindGlyph(kind) {
  const house = s("svg", { viewBox: "0 0 12 12", "aria-hidden": "true" }, s("path", { d: "M1.5 6 6 2l4.5 4M3 5.2V10h6V5.2" }));
  const tent = s("svg", { viewBox: "0 0 12 12", "aria-hidden": "true" }, s("path", { d: "M1 10 6 2l5 8ZM6 10V6.5" }));
  const label = kind === "camp" ? "營地" : kind === "both" ? "山屋＋營地" : "山屋";
  const parts = kind === "camp" ? [tent] : kind === "both" ? [house, tent] : [house];
  return h("span", { class: "glyph", title: label }, ...parts, h("span", { class: "sr-only" }, label));
}
