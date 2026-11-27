/**
 * model.js — 資料層：讀 JSON、算週末區塊、判每一格的狀態。
 * 不碰 DOM；所有畫面元件都從這裡取「事實」。
 */

export const PARKS = {
  taroko: { name: "太魯閣國家公園", short: "太魯閣", url: "https://hike.taiwan.gov.tw/bed_4.aspx" },
  sheipa: { name: "雪霸國家公園", short: "雪霸", url: "https://hike.taiwan.gov.tw/bed_1.aspx" },
  yushan: { name: "玉山國家公園", short: "玉山", url: "https://hike.taiwan.gov.tw/bed_6.aspx" },
};

export const PARK_ORDER = ["taroko", "sheipa", "yushan"];
const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];
const WEEKENDS_AHEAD = 8;

/* ---------- 日期 ---------- */

export function parseLocalDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

function md(d) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function isOffDay(d, cal) {
  const iso = isoDate(d);
  if (cal.makeup_workdays && cal.makeup_workdays[iso]) return false;
  const h = cal.holidays && cal.holidays[iso];
  if (h && h.is_holiday !== false) return true;
  const wd = d.getDay();
  return wd === 0 || wd === 6;
}

/**
 * 找出從 start 起的 N 個「連續休假區塊」，住宿夜＝休假首日前一晚到末日前一晚。
 * 例：週六日 → 週五夜、週六夜；12/25 週五放假 → 週四、五、六夜。
 */
export function computeWeekends(start, cal, n = WEEKENDS_AHEAD) {
  const hmap = cal.holidays || {};
  const blocks = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const stop = addDays(cur, 150);

  while (cur <= stop && blocks.length < n) {
    if (!isOffDay(cur, cal)) {
      cur = addDays(cur, 1);
      continue;
    }
    let a = cur;
    while (isOffDay(addDays(a, -1), cal)) a = addDays(a, -1);
    let b = cur;
    while (isOffDay(addDays(b, 1), cal)) b = addDays(b, 1);

    const offDays = Math.round((b - a) / 86400000) + 1;
    if (offDays >= 2) {
      const names = [];
      for (let d = a; d <= b; d = addDays(d, 1)) {
        const info = hmap[isoDate(d)];
        if (info && info.name) {
          const clean = info.name.replace("補假", "");
          if (!names.includes(clean)) names.push(clean);
        }
      }
      const nights = [];
      for (let d = addDays(a, -1); d <= addDays(b, -1); d = addDays(d, 1)) {
        if (d < start) continue;
        const iso = isoDate(d);
        nights.push({
          date: iso,
          md: md(d),
          day: WEEKDAY[d.getDay()],
          holiday: Boolean(hmap[iso]) || Boolean(hmap[isoDate(addDays(d, 1))]),
        });
      }
      if (nights.length) {
        blocks.push({
          index: blocks.length,
          nights,
          range: nights.length === 1 ? nights[0].md : `${nights[0].md}–${nights[nights.length - 1].md}`,
          holiday: names.length ? names.join("・") : null,
        });
      }
    }
    cur = addDays(b, 1);
  }
  return blocks;
}

/* ---------- 讀資料 ---------- */

async function fetchJson(name, bust) {
  const qs = bust ? `?t=${Date.now()}` : "";
  let lastErr = null;
  for (const url of [`./data/${name}${qs}`, `../data/${name}${qs}`]) {
    try {
      const r = await fetch(url, { cache: bust ? "no-store" : "default" });
      if (r.ok) return await r.json();
      lastErr = new Error(`${name}: HTTP ${r.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error(`讀不到 ${name}`);
}

export async function loadData(bust = false) {
  const [huts, availability, meta] = await Promise.all([
    fetchJson("huts.json", bust),
    fetchJson("availability.json", bust),
    fetchJson("meta.json", bust),
  ]);
  let calendar = { holidays: {}, makeup_workdays: {} };
  try {
    const c = await fetchJson("holidays.json", bust);
    if (c && c.holidays) calendar = c;
  } catch (_) {
    /* 讀不到連假表就只算週六日，不擋畫面 */
  }
  const avail = new Map();
  for (const r of availability || []) avail.set(`${r.hut_id}|${r.date}`, r);

  const order = new Map(PARK_ORDER.map((p, i) => [p, i]));
  const sorted = (huts || []).slice().sort((x, y) => (order.get(x.park) ?? 9) - (order.get(y.park) ?? 9));
  return { huts: sorted, avail, meta: meta || {}, calendar };
}

/* ---------- 每一格的事實 ---------- */

export function hutFitsType(hut, type) {
  if (type === "beds") return hut.kind === "hut" || hut.kind === "both";
  if (type === "tents") return hut.kind === "camp" || hut.kind === "both";
  return true;
}

function spots(rec, type) {
  const b = rec.remaining_beds || 0;
  const t = rec.remaining_tents || 0;
  if (type === "beds") return b;
  if (type === "tents") return t;
  return b + t;
}

function capacity(hut, type) {
  const c = hut.capacity || {};
  if (type === "beds") return c.holiday_beds || 0;
  if (type === "tents") return c.holiday_tents || 0;
  return (c.holiday_beds || 0) + (c.holiday_tents || 0);
}

/**
 * 回傳 { s, n, f, rec }
 *   s：open｜low｜full｜lottery｜na｜closed
 *   n：依「睡哪裡」換算後的剩餘數
 *   f：剩餘／承載（0–1），open 才有意義
 */
export function cellFact(store, hut, date) {
  const rec = store.avail.get(`${hut.id}|${date}`);
  const { type, party } = store.filters;
  if (!rec || rec.status === "not_open") return { s: "na", n: 0, f: 0, rec };
  if (rec.status === "closed") return { s: "closed", n: 0, f: 0, rec };
  if (rec.status === "lottery") return { s: "lottery", n: spots(rec, type), f: 0, rec };
  const n = spots(rec, type);
  if (rec.status === "full" || n === 0) return { s: "full", n: 0, f: 0, rec };
  const f = Math.min(1, n / Math.max(1, capacity(hut, type)));
  return { s: n >= party ? "open" : "low", n, f, rec };
}

export function visibleHuts(store) {
  const { park, type, q } = store.filters;
  const needle = q.trim();
  return store.huts.filter(
    (h) => (park === "all" || h.park === park) && hutFitsType(h, type) && (!needle || h.name.includes(needle))
  );
}

export function openCountOnNight(store, huts, date) {
  let n = 0;
  for (const h of huts) if (cellFact(store, h, date).s === "open") n += 1;
  return n;
}

export function hutOpenInBlock(store, hut, block) {
  return block.nights.some((nt) => cellFact(store, hut, nt.date).s === "open");
}

export function relativeTime(iso) {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  const min = Math.max(0, Math.floor((Date.now() - t.getTime()) / 60000));
  if (min < 1) return { text: "剛剛", min };
  if (min < 60) return { text: `${min} 分鐘前`, min };
  const hr = Math.floor(min / 60);
  if (hr < 24) return { text: `${hr} 小時前`, min };
  return { text: `${Math.floor(hr / 24)} 天前`, min };
}
