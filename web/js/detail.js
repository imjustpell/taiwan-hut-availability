/**
 * detail.js — 點一格打開的明細（organism）。
 */
import { $, h } from "./dom.js";
import { PARKS } from "./model.js";

function statusBlock(fact, party, type) {
  const unit = type === "beds" ? "床位" : type === "tents" ? "營位" : "位";
  switch (fact.s) {
    case "open":
      return [h("span", { class: "big" }, String(fact.n)), h("p", null, `還剩 ${fact.n} 個${unit}，睡得下你們 ${party} 人。`)];
    case "low":
      return [h("span", { class: "big" }, String(fact.n)), h("p", null, `只剩 ${fact.n} 個${unit}，不夠你們 ${party} 人。可以拆兩晚，或換一間。`)];
    case "full":
      return [h("span", { class: "big is-word" }, "額滿"), h("p", null, "這一晚已經沒有名額。官方頁可以排候補。")];
    case "lottery":
      return [h("span", { class: "big is-word" }, "抽籤"), h("p", null, "這裡採抽籤制，不是先搶先贏。抽籤日期與規則請看官方頁。")];
    case "closed":
      return [h("span", { class: "big is-word" }, "封閉"), h("p", null, "路線或宿營地目前封閉，不受理申請。")];
    default:
      return [h("span", { class: "big is-word" }, "未開放"), h("p", null, "還沒到開放申請的日子，或已經過了截止日（多數園區入園前 5 天截止）。")];
  }
}

export function openDetail(store, hut, night, fact) {
  const dlg = $("detail");
  const rec = fact.rec || {};
  const cap = hut.capacity || {};

  $("detail-eyebrow").textContent = `${PARKS[hut.park]?.short || ""}　${night.md} 週${night.day}夜`;
  $("detail-title").textContent = hut.name;
  $("detail-status").replaceChildren(...statusBlock(fact, store.filters.party, store.filters.type));

  const rows = [];
  if (hut.kind !== "camp") rows.push(["剩餘床位", rec.remaining_beds ?? "—", `／ ${cap.holiday_beds || 0}`]);
  if (hut.kind !== "hut") rows.push(["剩餘營位", rec.remaining_tents ?? "—", `／ ${cap.holiday_tents || 0}`]);
  rows.push(["已核准", rec.approved ?? "—", " 人"]);
  rows.push(["審核中", rec.reviewing ?? "—", " 人"]);
  rows.push(["排隊或候補", rec.queue ?? "—", " 人"]);
  $("detail-kv").replaceChildren(...rows.flatMap(([k, v, tail]) => [h("dt", null, k), h("dd", null, String(v), h("small", null, tail))]));

  const go = $("detail-go");
  go.href = hut.source_url;
  go.textContent = fact.s === "open" || fact.s === "low" ? "到官方頁申請" : "到官方頁查看";

  dlg.showModal();
}

export function bindDetail() {
  const dlg = $("detail");
  // 點遮罩關閉
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });
}
