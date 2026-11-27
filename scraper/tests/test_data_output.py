import json
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = ROOT_DIR / "data"


def test_generated_data_files_schema_and_completeness():
    """Verify the generated data/*.json files conform to the specification."""
    huts_path = DATA_DIR / "huts.json"
    avail_path = DATA_DIR / "availability.json"
    meta_path = DATA_DIR / "meta.json"

    assert huts_path.exists(), "data/huts.json must exist"
    assert avail_path.exists(), "data/availability.json must exist"
    assert meta_path.exists(), "data/meta.json must exist"

    huts = json.loads(huts_path.read_text(encoding="utf-8"))
    avail = json.loads(avail_path.read_text(encoding="utf-8"))
    meta = json.loads(meta_path.read_text(encoding="utf-8"))

    # 15 Taroko + 34 Shei-Pa + 27 Yushan = 76 huts
    assert len(huts) == 76
    assert meta["total_huts"] == 76
    assert meta["success_count"] == 76
    assert meta["failed_count"] == 0

    for h in huts:
        assert set(h.keys()) == {"id", "park", "node_id", "name", "kind", "capacity", "booking_mode", "source_url"}
        assert h["park"] in ("taroko", "sheipa", "yushan")
        assert h["kind"] in ("hut", "camp", "both")
        assert h["booking_mode"] in ("first_come", "lottery")
        assert set(h["capacity"].keys()) == {"weekday_beds", "weekday_tents", "holiday_beds", "holiday_tents"}

    # Check 排雲山莊 is marked lottery
    paiyun = next(h for h in huts if h["id"] == "yushan_3")
    assert paiyun["name"] == "排雲山莊"
    assert paiyun["booking_mode"] == "lottery"

    # Check availability records schema and status variety
    assert len(avail) >= 76 * 89
    statuses = {a["status"] for a in avail}
    assert "available" in statuses
    assert "full" in statuses
    assert "not_open" in statuses
    assert "lottery" in statuses
    assert "closed" in statuses

    # Ensure 排雲山莊 never has status == "available"
    paiyun_statuses = {a["status"] for a in avail if a["hut_id"] == "yushan_3"}
    assert "available" not in paiyun_statuses
    assert "lottery" in paiyun_statuses
