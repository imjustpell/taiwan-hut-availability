/**
 * refresh.js — 手動更新（organism）。
 * 本機預覽伺服器（run_scrape.py --serve）提供 POST /api/refresh 與 GET /api/refresh/status；
 * 純靜態主機（GitHub Pages）沒有這兩支，就退回「重新讀取資料檔」。
 */
import { $, toast } from "./dom.js";

let pollTimer = null;

function feedback(text) {
  const el = $("refresh-feedback");
  el.hidden = !text;
  el.textContent = text || "";
}

function setProgress(on, text, pct) {
  $("progress").hidden = !on;
  const dot = $("fresh-dot");
  dot.classList.toggle("dot--busy", on);
  $("refresh-open").disabled = on;
  if (text != null) $("progress-text").textContent = text;
  if (pct != null) {
    $("progress-fill").style.width = `${pct}%`;
    $("progress-pct").textContent = `${pct}%`;
  }
}

async function startScrape(parks, reload) {
  feedback("送出中");
  try {
    const r = await fetch("/api/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parks, months_ahead: 2, interval: 1.5 }),
    });
    if (r.status === 404 || r.status === 405 || r.status === 501) throw new Error("STATIC");
    const data = await r.json();
    if (!data.ok) {
      feedback(data.message || "已有一次抓取正在進行，等它完成再試。");
      return;
    }
    $("refresh").close();
    feedback("");
    toast("已開始重新抓取。完成後會自動載入新資料。");
    poll(reload);
  } catch (_) {
    await reload(true);
    feedback("這個網址是靜態網站，不能從網頁觸發抓取；已改為重新讀取資料檔。要立即重抓，請在 GitHub 的 Actions 頁手動執行，或在本機跑 .\\run_scrape.ps1 -Serve。");
    toast("已重新讀取資料檔。");
  }
}

function poll(reload) {
  setProgress(true, "準備重新抓取", 0);
  clearInterval(pollTimer);
  const tick = async () => {
    try {
      const r = await fetch(`/api/refresh/status?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) return;
      const st = (await r.json()).status;
      if (!st) return;
      const total = Math.max(1, st.total_huts || 1);
      const done = st.completed_huts || 0;
      setProgress(true, st.message || `已抓 ${done}／${total} 處`, Math.min(100, Math.round((done / total) * 100)));
      if (!st.is_running) {
        clearInterval(pollTimer);
        pollTimer = null;
        await reload(true);
        setTimeout(() => setProgress(false), 1800);
        toast(st.last_error ? `抓取中斷：${st.last_error}` : "新資料已載入。", st.last_error ? 7000 : 4200);
      }
    } catch (_) {
      clearInterval(pollTimer);
      pollTimer = null;
      setProgress(false);
    }
  };
  tick();
  pollTimer = setInterval(tick, 1500);
}

export function bindRefresh(reload) {
  const dlg = $("refresh");
  $("refresh-open").addEventListener("click", () => {
    feedback("");
    dlg.showModal();
  });
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });
  $("reload-json").addEventListener("click", async () => {
    feedback("讀取中");
    try {
      await reload(true);
      dlg.close();
      toast("已重新讀取資料檔。");
    } catch (e) {
      feedback(`讀不到資料檔：${e.message}`);
    }
  });
  $("scrape-some").addEventListener("click", () => {
    const parks = [...dlg.querySelectorAll('input[name="park"]:checked')].map((x) => x.value);
    if (!parks.length) {
      feedback("至少勾一個園區。");
      return;
    }
    startScrape(parks, reload);
  });
  $("scrape-all").addEventListener("click", () => startScrape(["taroko", "sheipa", "yushan"], reload));
}

/** 頁面打開時若伺服器正在抓，就接上進度 */
export async function resumeIfRunning(reload) {
  try {
    const r = await fetch("/api/refresh/status", { cache: "no-store" });
    if (!r.ok) return;
    const st = (await r.json()).status;
    if (st && st.is_running) poll(reload);
  } catch (_) {
    /* 靜態主機：沒有這支 API，安靜略過 */
  }
}
