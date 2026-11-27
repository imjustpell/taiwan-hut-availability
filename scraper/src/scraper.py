import argparse
import calendar
import datetime
import json
import logging
import shutil
import time
from pathlib import Path
from typing import Callable
import httpx

from .models import Availability, Hut, ParkId
from .holidays import write_holidays_json
from .parser import (
    PARK_BASE_URLS,
    extract_calendar_year_month,
    extract_postback_fields,
    parse_calendar_page,
    parse_main_page,
)
from bs4 import BeautifulSoup

logger = logging.getLogger("taiwan_hut_scraper")

USER_AGENT = "TaiwanHutAvailability/1.0 (+https://github.com/taiwan-hut-availability; polite-scraper; interval=1.5s)"
DEFAULT_INTERVAL_SECONDS = 1.5
MAX_RETRIES = 3


def add_months(year: int, month: int, offset: int) -> tuple[int, int]:
    total = (year * 12 + (month - 1)) + offset
    return total // 12, (total % 12) + 1


class PoliteHttpClient:
    """Single-concurrency HTTP client with rate limiting and exponential backoff retries."""

    def __init__(
        self,
        interval: float = DEFAULT_INTERVAL_SECONDS,
        max_retries: int = MAX_RETRIES,
        timeout: float = 30.0,
        client: httpx.Client | None = None,
    ):
        self.interval = interval
        self.max_retries = max_retries
        self._last_request_ts: float | None = None
        self._owns_client = client is None
        self.client = client or httpx.Client(
            headers={"User-Agent": USER_AGENT},
            follow_redirects=True,
            timeout=timeout,
        )

    def close(self) -> None:
        if self._owns_client:
            self.client.close()

    def __enter__(self) -> "PoliteHttpClient":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()

    def _wait_polite_interval(self) -> None:
        if self._last_request_ts is not None and self.interval > 0:
            elapsed = time.monotonic() - self._last_request_ts
            if elapsed < self.interval:
                time.sleep(self.interval - elapsed)

    def request(self, method: str, url: str, data: dict | None = None) -> httpx.Response:
        last_err: Exception | None = None
        for attempt in range(self.max_retries):
            self._wait_polite_interval()
            try:
                self._last_request_ts = time.monotonic()
                if method.upper() == "GET":
                    resp = self.client.get(url)
                else:
                    resp = self.client.post(url, data=data)
                resp.raise_for_status()
                return resp
            except Exception as exc:
                last_err = exc
                backoff = max(self.interval, 1.5) * (2**attempt)
                logger.warning(
                    "Request %s %s failed (attempt %d/%d): %s. Retrying in %.1fs...",
                    method,
                    url,
                    attempt + 1,
                    self.max_retries,
                    exc,
                    backoff,
                )
                if self.interval > 0:
                    time.sleep(backoff)
        raise RuntimeError(f"Failed {method} {url} after {self.max_retries} attempts: {last_err}") from last_err


def generate_closed_month(hut: Hut, year: int, month: int) -> list[Availability]:
    _, days_in_month = calendar.monthrange(year, month)
    return [
        Availability(
            hut_id=hut.id,
            date=f"{year:04d}-{month:02d}-{day:02d}",
            remaining_beds=0,
            remaining_tents=0,
            queue=0,
            reviewing=0,
            approved=0,
            status="closed",
        )
        for day in range(1, days_in_month + 1)
    ]


def scrape_hut_availability(
    http: PoliteHttpClient,
    hut: Hut,
    months_ahead: int = 2,
    base_year: int | None = None,
    base_month: int | None = None,
) -> list[Availability]:
    """Scrape current month + `months_ahead` months for a single Hut."""
    now = datetime.datetime.now()
    cur_year = base_year or now.year
    cur_month = base_month or now.month

    url = hut.source_url
    resp0 = http.request("GET", url)
    html = resp0.text
    soup0 = BeautifulSoup(html, "html.parser")

    # If hut is not selectable (e.g., Taroko 天空營地 697 with 0 capacity and no #con_ddlMonth)
    if not soup0.select_one("#con_ddlMonth"):
        if hut.capacity.total_capacity() == 0:
            all_closed: list[Availability] = []
            for offset in range(months_ahead + 1):
                y, m = add_months(cur_year, cur_month, offset)
                all_closed.extend(generate_closed_month(hut, y, m))
            return all_closed
        raise ValueError(f"Calendar dropdown #con_ddlMonth missing on {url}")

    cur_year, cur_month = extract_calendar_year_month(soup0, cur_year, cur_month)
    records_by_date: dict[str, Availability] = {}

    for rec in parse_calendar_page(hut, html, cur_year, cur_month):
        records_by_date[rec.date] = rec

    for offset in range(1, months_ahead + 1):
        target_y, target_m = add_months(cur_year, cur_month, offset)
        fields = extract_postback_fields(html)
        if "__VIEWSTATE" not in fields:
            raise ValueError(f"Missing __VIEWSTATE during month postback for {hut.id}")
        fields["__EVENTTARGET"] = "ctl00$con$lbDownMonth"
        fields["__EVENTARGUMENT"] = ""
        resp_next = http.request("POST", url, data=fields)
        html = resp_next.text
        for rec in parse_calendar_page(hut, html, target_y, target_m):
            records_by_date[rec.date] = rec

    return [records_by_date[d] for d in sorted(records_by_date.keys())]


def run_full_scrape(
    output_dir: Path,
    months_ahead: int = 2,
    interval: float = DEFAULT_INTERVAL_SECONDS,
    parks: list[ParkId] | None = None,
    http_client: PoliteHttpClient | None = None,
    progress_callback: Callable[[dict], None] | None = None,
    merge_existing: bool = False,
) -> dict:
    """Scrape supported parks and write huts.json, availability.json, meta.json."""
    target_parks: list[ParkId] = parks or ["taroko", "sheipa", "yushan"]
    output_dir.mkdir(parents=True, exist_ok=True)

    owns_http = http_client is None
    http = http_client or PoliteHttpClient(interval=interval)

    scraped_huts: list[Hut] = []
    scraped_availability: list[Availability] = []
    parks_meta: dict[str, dict] = {}

    try:
        for park in target_parks:
            base_url = PARK_BASE_URLS[park]
            logger.info("=== Scraping park: %s (%s) ===", park, base_url)
            if progress_callback:
                progress_callback(
                    {
                        "phase": "park_init",
                        "park": park,
                        "hut_name": "讀取總表頁...",
                        "park_index": 0,
                        "park_total": 0,
                    }
                )
            try:
                main_resp = http.request("GET", base_url)
                park_huts = parse_main_page(park, main_resp.text, base_url=base_url)
            except Exception as exc:
                logger.error("Failed to fetch main page for park %s: %s", park, exc)
                parks_meta[park] = {
                    "supported": False,
                    "strategy": "http_postback",
                    "error": str(exc),
                    "total_huts": 0,
                    "success_count": 0,
                    "failed_count": 0,
                    "failed_huts": [],
                }
                continue

            if not park_huts:
                parks_meta[park] = {
                    "supported": False,
                    "strategy": "http_postback",
                    "error": "No huts parsed from overview table",
                    "total_huts": 0,
                    "success_count": 0,
                    "failed_count": 0,
                    "failed_huts": [],
                }
                continue

            scraped_huts.extend(park_huts)
            success_count = 0
            failed_huts: list[dict] = []

            for idx, hut in enumerate(park_huts, start=1):
                logger.info(
                    "[%s %d/%d] Scraping %s (node_id=%s)...",
                    park,
                    idx,
                    len(park_huts),
                    hut.name,
                    hut.node_id,
                )
                if progress_callback:
                    progress_callback(
                        {
                            "phase": "scraping_hut",
                            "park": park,
                            "hut_id": hut.id,
                            "hut_name": hut.name,
                            "park_index": idx,
                            "park_total": len(park_huts),
                        }
                    )
                try:
                    hut_avail = scrape_hut_availability(http, hut, months_ahead=months_ahead)
                    scraped_availability.extend(hut_avail)
                    success_count += 1
                except Exception as exc:
                    logger.error("Failed scraping hut %s (%s): %s", hut.id, hut.name, exc)
                    failed_huts.append(
                        {
                            "hut_id": hut.id,
                            "node_id": hut.node_id,
                            "name": hut.name,
                            "error": str(exc),
                        }
                    )

            parks_meta[park] = {
                "supported": success_count > 0,
                "strategy": "http_postback",
                "total_huts": len(park_huts),
                "success_count": success_count,
                "failed_count": len(failed_huts),
                "failed_huts": failed_huts,
            }
    finally:
        if owns_http:
            http.close()

    huts_path = output_dir / "huts.json"
    avail_path = output_dir / "availability.json"
    meta_path = output_dir / "meta.json"

    final_huts_dicts = [h.to_dict() for h in scraped_huts]
    final_avail_dicts = [a.to_dict() for a in scraped_availability]

    # Merge with existing data if only a subset of parks was scraped
    if merge_existing and huts_path.exists() and avail_path.exists() and meta_path.exists():
        try:
            old_huts = json.loads(huts_path.read_text(encoding="utf-8"))
            old_avail = json.loads(avail_path.read_text(encoding="utf-8"))
            old_meta = json.loads(meta_path.read_text(encoding="utf-8"))

            scraped_park_set = set(target_parks)
            kept_huts = [h for h in old_huts if h.get("park") not in scraped_park_set]
            kept_hut_ids = {h["id"] for h in kept_huts}
            kept_avail = [a for a in old_avail if a.get("hut_id") in kept_hut_ids]

            # Order parks consistently: taroko, sheipa, yushan
            park_order = {"taroko": 0, "sheipa": 1, "yushan": 2}
            final_huts_dicts = sorted(
                kept_huts + final_huts_dicts,
                key=lambda x: park_order.get(x.get("park", ""), 99),
            )
            final_avail_dicts = kept_avail + final_avail_dicts

            merged_parks_meta = dict(old_meta.get("parks", {}))
            merged_parks_meta.update(parks_meta)
            parks_meta = merged_parks_meta
        except Exception as exc:
            logger.warning("Could not merge with existing files, writing fresh: %s", exc)

    total_huts_count = sum(p.get("total_huts", 0) for p in parks_meta.values()) or len(final_huts_dicts)
    total_success = sum(p.get("success_count", 0) for p in parks_meta.values())
    total_failed = sum(p.get("failed_count", 0) for p in parks_meta.values())
    all_failed_huts = [fh for p in parks_meta.values() for fh in p.get("failed_huts", [])]

    meta = {
        "fetched_at": datetime.datetime.now(datetime.timezone.utc).astimezone().isoformat(),
        "months_ahead": months_ahead,
        "request_interval_seconds": interval,
        "user_agent": USER_AGENT,
        "total_huts": total_huts_count,
        "success_count": total_success,
        "failed_count": total_failed,
        "failed_huts": all_failed_huts,
        "parks": parks_meta,
    }

    huts_path.write_text(
        json.dumps(final_huts_dicts, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    avail_path.write_text(
        json.dumps(final_avail_dicts, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    meta_path.write_text(
        json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    holidays_path = write_holidays_json(output_dir)

    # Also sync to web/data/ if web directory exists
    web_data_dir = output_dir.parent / "web" / "data"
    if (output_dir.parent / "web").exists():
        web_data_dir.mkdir(parents=True, exist_ok=True)
        for src_file in (huts_path, avail_path, meta_path, holidays_path):
            shutil.copy2(src_file, web_data_dir / src_file.name)

    logger.info(
        "Scrape complete: %d/%d huts succeeded (%d availability records written to %s)",
        total_success,
        total_huts_count,
        len(final_avail_dicts),
        output_dir,
    )
    return meta


def main() -> None:
    parser = argparse.ArgumentParser(description="Polite scraper for Taiwan National Park mountain huts & campsites.")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parent.parent.parent / "data",
        help="Output directory for huts.json, availability.json, meta.json",
    )
    parser.add_argument(
        "--months-ahead",
        type=int,
        default=2,
        help="Number of months ahead of current month to scrape (default: 2)",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=DEFAULT_INTERVAL_SECONDS,
        help="Polite delay in seconds between HTTP requests (default: 1.5)",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    run_full_scrape(
        output_dir=args.output_dir,
        months_ahead=args.months_ahead,
        interval=args.interval,
    )


if __name__ == "__main__":
    main()
