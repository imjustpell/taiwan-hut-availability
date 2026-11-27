#!/usr/bin/env python3
"""CLI entrypoint for `run_scrape` and local preview server with live manual refresh API."""

import argparse
import datetime
import http.server
import json
import logging
import shutil
import socketserver
import threading
import webbrowser
from pathlib import Path

from scraper.src.scraper import DEFAULT_INTERVAL_SECONDS, run_full_scrape
from scraper.src.holidays import write_holidays_json

ROOT_DIR = Path(__file__).resolve().parent
DATA_DIR = ROOT_DIR / "data"
WEB_DIR = ROOT_DIR / "web"

PARK_LABELS = {
    "taroko": "太魯閣國家公園",
    "sheipa": "雪霸國家公園",
    "yushan": "玉山國家公園",
}

# Thread-safe state for live manual refresh requested from the web UI
REFRESH_STATE_LOCK = threading.Lock()
REFRESH_STATE = {
    "is_running": False,
    "started_at": None,
    "finished_at": None,
    "parks": [],
    "current_park": None,
    "current_hut": None,
    "park_index": 0,
    "park_total": 0,
    "completed_huts": 0,
    "total_huts": 0,
    "message": "待命",
    "last_error": None,
}


def sync_data_to_web(data_dir: Path, web_dir: Path) -> None:
    web_data_dir = web_dir / "data"
    web_data_dir.mkdir(parents=True, exist_ok=True)
    for json_file in data_dir.glob("*.json"):
        shutil.copy2(json_file, web_data_dir / json_file.name)


def _start_background_refresh(
    output_dir: Path,
    web_dir: Path,
    parks: list[str] | None = None,
    months_ahead: int = 2,
    interval: float = DEFAULT_INTERVAL_SECONDS,
) -> tuple[bool, str]:
    valid_parks = [p for p in (parks or ["taroko", "sheipa", "yushan"]) if p in ("taroko", "sheipa", "yushan")]
    if not valid_parks:
        valid_parks = ["taroko", "sheipa", "yushan"]

    expected_counts = {"taroko": 15, "sheipa": 34, "yushan": 27}
    estimated_total = sum(expected_counts.get(p, 20) for p in valid_parks)

    with REFRESH_STATE_LOCK:
        if REFRESH_STATE["is_running"]:
            return False, "目前已有更新任務正在執行中，請稍候。"
        REFRESH_STATE.update(
            {
                "is_running": True,
                "started_at": datetime.datetime.now(datetime.timezone.utc).astimezone().isoformat(),
                "finished_at": None,
                "parks": valid_parks,
                "current_park": valid_parks[0],
                "current_hut": "準備連線至官方網站...",
                "park_index": 0,
                "park_total": expected_counts.get(valid_parks[0], 0),
                "completed_huts": 0,
                "total_huts": estimated_total,
                "message": "已啟動禮貌爬蟲更新任務...",
                "last_error": None,
            }
        )

    def _worker() -> None:
        completed_counter = 0

        def _on_progress(info: dict) -> None:
            nonlocal completed_counter
            park_id = info.get("park", "")
            park_name = PARK_LABELS.get(park_id, park_id)
            hut_name = info.get("hut_name", "")
            p_idx = info.get("park_index", 0)
            p_tot = info.get("park_total", 0)
            if info.get("phase") == "scraping_hut":
                completed_counter += 1
            with REFRESH_STATE_LOCK:
                REFRESH_STATE.update(
                    {
                        "current_park": park_id,
                        "current_hut": hut_name,
                        "park_index": p_idx,
                        "park_total": p_tot,
                        "completed_huts": min(completed_counter, estimated_total),
                        "message": f"正在抓取 {park_name} ({p_idx}/{p_tot})：{hut_name}",
                    }
                )

        try:
            run_full_scrape(
                output_dir=output_dir,
                months_ahead=months_ahead,
                interval=interval,
                parks=valid_parks,  # type: ignore[arg-type]
                progress_callback=_on_progress,
                merge_existing=(len(valid_parks) < 3),
            )
            sync_data_to_web(output_dir, web_dir)
            with REFRESH_STATE_LOCK:
                REFRESH_STATE.update(
                    {
                        "is_running": False,
                        "finished_at": datetime.datetime.now(datetime.timezone.utc).astimezone().isoformat(),
                        "completed_huts": REFRESH_STATE["total_huts"],
                        "message": "資料更新完成！已同步最新山屋與營地空位。",
                        "last_error": None,
                    }
                )
        except Exception as exc:
            with REFRESH_STATE_LOCK:
                REFRESH_STATE.update(
                    {
                        "is_running": False,
                        "finished_at": datetime.datetime.now(datetime.timezone.utc).astimezone().isoformat(),
                        "message": f"更新失敗：{exc}",
                        "last_error": str(exc),
                    }
                )

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    return True, "已送出更新要求，系統正在背景禮貌抓取最新資料。"


class HutPreviewRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Static file handler + `/api/refresh` and `/api/refresh/status` endpoints."""

    def __init__(self, *args, directory: str, data_dir: Path, web_dir: Path, **kwargs):
        self.data_dir = data_dir
        self.web_dir = web_dir
        super().__init__(*args, directory=directory, **kwargs)

    def _send_json(self, status_code: int, payload: dict) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:
        if self.path.startswith("/api/refresh/status"):
            with REFRESH_STATE_LOCK:
                snapshot = dict(REFRESH_STATE)
            self._send_json(200, {"ok": True, "server_Capabilities": ["live_scrape"], "status": snapshot})
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self.path.startswith("/api/refresh"):
            content_len = int(self.headers.get("Content-Length", "0") or "0")
            body = self.rfile.read(content_len).decode("utf-8") if content_len > 0 else "{}"
            try:
                req_data = json.loads(body) if body else {}
            except Exception:
                req_data = {}

            parks = req_data.get("parks")
            months_ahead = int(req_data.get("months_ahead", 2))
            interval = max(1.0, float(req_data.get("interval", DEFAULT_INTERVAL_SECONDS)))

            started, msg = _start_background_refresh(
                output_dir=self.data_dir,
                web_dir=self.web_dir,
                parks=parks,
                months_ahead=months_ahead,
                interval=interval,
            )
            with REFRESH_STATE_LOCK:
                snapshot = dict(REFRESH_STATE)
            self._send_json(200 if started else 409, {"ok": started, "message": msg, "status": snapshot})
            return

        self._send_json(404, {"ok": False, "message": "Not found"})


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def serve_static(data_dir: Path, web_dir: Path, port: int = 8080, open_browser: bool = True) -> None:
    def handler_factory(*args, **kwargs):
        return HutPreviewRequestHandler(
            *args,
            directory=str(web_dir),
            data_dir=data_dir,
            web_dir=web_dir,
            **kwargs,
        )

    with ThreadedTCPServer(("127.0.0.1", port), handler_factory) as httpd:
        url = f"http://127.0.0.1:{port}/"
        print(f"\n============================================================")
        print(f" 本機預覽與即時更新伺服器已啟動: {url}")
        print(f" 靜態網站目錄: {web_dir}")
        print(f" 支援網頁端手動送出更新要求 (POST /api/refresh)")
        print(f" 按下 Ctrl+C 可停止伺服器")
        print(f"============================================================\n")
        if open_browser:
            try:
                webbrowser.open(url)
            except Exception:
                pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n已停止本機預覽伺服器。")


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="run_scrape",
        description="台灣國家公園山屋／營地空位爬蟲與本機一鍵預覽工具",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DATA_DIR,
        help="輸出 JSON 資料夾路徑 (預設: ./data)",
    )
    parser.add_argument(
        "--months-ahead",
        type=int,
        default=2,
        help="抓取當月往後幾個月的日曆 (預設: 2，即當月 + 往後 2 個月)",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=DEFAULT_INTERVAL_SECONDS,
        help="禮貌抓取請求間隔秒數 (預設: 1.5 秒)",
    )
    parser.add_argument(
        "--serve",
        action="store_true",
        help="爬蟲完成後立即啟動本機靜態網頁預覽伺服器",
    )
    parser.add_argument(
        "--serve-only",
        action="store_true",
        help="不重新執行爬蟲，直接同步現有 data/*.json 並啟動本機預覽伺服器",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8080,
        help="本機預覽伺服器埠號 (預設: 8080)",
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="啟動預覽伺服器時不自動開啟瀏覽器",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    if not args.serve_only:
        run_full_scrape(
            output_dir=args.output_dir,
            months_ahead=args.months_ahead,
            interval=args.interval,
        )
    else:
        write_holidays_json(args.output_dir)

    sync_data_to_web(args.output_dir, WEB_DIR)

    if args.serve or args.serve_only:
        serve_static(args.output_dir, WEB_DIR, port=args.port, open_browser=not args.no_browser)


if __name__ == "__main__":
    main()
