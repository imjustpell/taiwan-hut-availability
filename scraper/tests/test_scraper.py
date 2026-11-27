import json
from pathlib import Path
import httpx
from scraper.src.scraper import PoliteHttpClient, run_full_scrape, scrape_hut_availability
from scraper.src.parser import parse_main_page

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures"


def _read_fixture(name: str) -> str:
    return (FIXTURES_DIR / name).read_text(encoding="utf-8")


def test_scrape_hut_availability_with_mock_transport():
    """Verify multi-month postback chaining and closed hut handling using fixtures."""
    taroko_huts = {h.node_id: h for h in parse_main_page("taroko", _read_fixture("taroko_main.html"))}
    hut_124 = taroko_huts["124"]
    hut_697 = taroko_huts["697"]  # 天空營地 (closed, 0 capacity)

    post_call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal post_call_count
        url_str = str(request.url)
        if request.method == "GET" and "node_id=124" in url_str:
            return httpx.Response(200, text=_read_fixture("taroko_get_node_124.html"))
        if request.method == "POST" and "node_id=124" in url_str:
            post_call_count += 1
            if post_call_count == 1:
                return httpx.Response(200, text=_read_fixture("taroko_node_124_2026_12.html"))
            return httpx.Response(200, text=_read_fixture("taroko_node_124_2027_01.html"))
        if request.method == "GET" and "node_id=697" in url_str:
            # 697 returns main page without calendar dropdown
            return httpx.Response(200, text=_read_fixture("taroko_main.html"))
        return httpx.Response(404)

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    polite = PoliteHttpClient(interval=0.0, client=mock_client)

    avail_124 = scrape_hut_availability(polite, hut_124, months_ahead=2)
    # 2026-11 (30 days) + 2026-12 (31 days) + 2027-01 (31 days) = 92 days
    assert len(avail_124) == 92
    by_date = {a.date: a for a in avail_124}
    assert by_date["2026-11-27"].remaining_beds == 1
    assert by_date["2026-12-01"].remaining_beds == 3
    assert by_date["2027-01-01"].remaining_beds == 6
    assert by_date["2027-01-28"].status == "not_open"

    # Closed hut 697 should produce "closed" records for all 3 months without failing
    avail_697 = scrape_hut_availability(polite, hut_697, months_ahead=2, base_year=2026, base_month=11)
    assert len(avail_697) == 92
    assert all(a.status == "closed" for a in avail_697)


def test_partial_failure_resilience_and_meta_output(tmp_path: Path):
    """Verify that a single hut failure does not abort the scrape and is recorded in meta.json."""
    def handler(request: httpx.Request) -> httpx.Response:
        url_str = str(request.url)
        if request.method == "GET" and url_str.endswith("bed_4.aspx"):
            return httpx.Response(200, text=_read_fixture("taroko_main.html"))
        if "node_id=124" in url_str:
            if request.method == "GET":
                return httpx.Response(200, text=_read_fixture("taroko_get_node_124.html"))
            return httpx.Response(200, text=_read_fixture("taroko_node_124_2026_12.html"))
        if "node_id=697" in url_str:
            return httpx.Response(200, text=_read_fixture("taroko_main.html"))
        # Simulate failure for other huts
        return httpx.Response(500, text="Simulated server error")

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    polite = PoliteHttpClient(interval=0.0, max_retries=2, client=mock_client)

    meta = run_full_scrape(
        output_dir=tmp_path,
        months_ahead=1,
        interval=0.0,
        parks=["taroko"],
        http_client=polite,
    )

    assert meta["total_huts"] == 15
    assert meta["success_count"] == 2  # 124 and 697
    assert meta["failed_count"] == 13
    assert len(meta["failed_huts"]) == 13

    huts_data = json.loads((tmp_path / "huts.json").read_text(encoding="utf-8"))
    avail_data = json.loads((tmp_path / "availability.json").read_text(encoding="utf-8"))
    meta_data = json.loads((tmp_path / "meta.json").read_text(encoding="utf-8"))

    assert len(huts_data) == 15
    assert len(avail_data) > 0
    assert meta_data["parks"]["taroko"]["supported"] is True
