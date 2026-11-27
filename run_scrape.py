#!/usr/bin/env python3
"""CLI entrypoint for `run_scrape` and one-click local scrape + static web preview."""

import argparse
import http.server
import logging
import shutil
import socketserver
import webbrowser
from functools import partial
from pathlib import Path

from scraper.src.scraper import DEFAULT_INTERVAL_SECONDS, run_full_scrape
from scraper.src.holidays import write_holidays_json

ROOT_DIR = Path(__file__).resolve().parent
DATA_DIR = ROOT_DIR / "data"
WEB_DIR = ROOT_DIR / "web"


def sync_data_to_web(data_dir: Path, web_dir: Path) -> None:
    web_data_dir = web_dir / "data"
    web_data_dir.mkdir(parents=True, exist_ok=True)
    for json_file in data_dir.glob("*.json"):
        shutil.copy2(json_file, web_data_dir / json_file.name)


def serve_static(web_dir: Path, port: int = 8080, open_browser: bool = True) -> None:
    handler = partial(http.server.SimpleHTTPRequestHandler, directory=str(web_dir))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", port), handler) as httpd:
        url = f"http://127.0.0.1:{port}/"
        print(f"\n============================================================")
        print(f" 本機預覽伺服器已啟動: {url}")
        print(f" 靜態網站目錄: {web_dir}")
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
        serve_static(WEB_DIR, port=args.port, open_browser=not args.no_browser)


if __name__ == "__main__":
    main()
