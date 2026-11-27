from pathlib import Path
import pytest
from scraper.src.parser import parse_main_page, parse_calendar_page, extract_postback_fields

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures"


def _read_fixture(name: str) -> str:
    return (FIXTURES_DIR / name).read_text(encoding="utf-8")


def test_parse_main_pages_counts_and_capacities():
    taroko_huts = parse_main_page("taroko", _read_fixture("taroko_main.html"))
    sheipa_huts = parse_main_page("sheipa", _read_fixture("sheipa_main.html"))
    yushan_huts = parse_main_page("yushan", _read_fixture("yushan_main.html"))

    assert len(taroko_huts) == 15
    assert len(sheipa_huts) == 34
    assert len(yushan_huts) == 27

    # Check Taroko hut vs camp classification
    t_by_id = {h.node_id: h for h in taroko_huts}
    assert t_by_id["124"].name == "黑水塘山屋"
    assert t_by_id["124"].kind == "hut"
    assert t_by_id["124"].capacity.weekday_beds == 6
    assert t_by_id["124"].capacity.weekday_tents == 0

    assert t_by_id["666"].name == "雲稜營地"
    assert t_by_id["666"].kind == "camp"
    assert t_by_id["666"].capacity.weekday_beds == 0
    assert t_by_id["666"].capacity.weekday_tents == 14

    assert t_by_id["692"].name == "三叉營地避難小屋"
    assert t_by_id["692"].kind == "hut"
    assert t_by_id["692"].capacity.weekday_beds == 12

    # Check Shei-Pa hut and camp
    s_by_id = {h.node_id: h for h in sheipa_huts}
    assert s_by_id["10"].name == "七卡山莊"
    assert s_by_id["10"].kind == "hut"
    assert s_by_id["10"].capacity.weekday_beds == 106
    assert s_by_id["386"].name == "七卡營地"
    assert s_by_id["386"].kind == "camp"
    assert s_by_id["386"].capacity.weekday_tents == 30

    # Check Yushan lottery vs first_come and kind="both"
    y_by_id = {h.node_id: h for h in yushan_huts}
    assert y_by_id["3"].name == "排雲山莊"
    assert y_by_id["3"].booking_mode == "lottery"
    assert y_by_id["3"].kind == "hut"
    assert y_by_id["3"].capacity.weekday_beds == 136

    assert y_by_id["4"].name == "圓峰山屋/營地"
    assert y_by_id["4"].booking_mode == "first_come"
    assert y_by_id["4"].kind == "both"
    assert y_by_id["4"].capacity.weekday_beds == 15
    assert y_by_id["4"].capacity.weekday_tents == 9


def test_gate1_taroko_124_and_149():
    taroko_huts = {h.node_id: h for h in parse_main_page("taroko", _read_fixture("taroko_main.html"))}
    hut_124 = taroko_huts["124"]

    nov = {a.date: a for a in parse_calendar_page(hut_124, _read_fixture("taroko_get_node_124.html"))}
    dec = {a.date: a for a in parse_calendar_page(hut_124, _read_fixture("taroko_node_124_2026_12.html"))}
    jan = {a.date: a for a in parse_calendar_page(hut_124, _read_fixture("taroko_node_124_2027_01.html"))}

    assert len(nov) == 30
    assert nov["2026-11-26"].status == "not_open"
    assert nov["2026-11-27"].remaining_beds == 1
    assert nov["2026-11-27"].reviewing == 0
    assert nov["2026-11-27"].approved == 5
    assert nov["2026-11-27"].status == "available"

    assert nov["2026-11-28"].remaining_beds == 5
    assert nov["2026-11-28"].approved == 1
    assert nov["2026-11-28"].status == "available"

    assert dec["2026-12-01"].remaining_beds == 3
    assert dec["2026-12-01"].reviewing == 1
    assert dec["2026-12-01"].approved == 2
    assert dec["2026-12-01"].status == "available"

    assert dec["2026-12-03"].remaining_beds == 0
    assert dec["2026-12-03"].approved == 6
    assert dec["2026-12-03"].status == "full"

    assert dec["2026-12-29"].remaining_beds == 0
    assert dec["2026-12-29"].reviewing == 6
    assert dec["2026-12-29"].status == "full"

    assert jan["2027-01-27"].remaining_beds == 6
    assert jan["2027-01-27"].status == "available"
    assert jan["2027-01-28"].status == "not_open"
    assert jan["2027-01-31"].status == "not_open"

    # Also test Taroko camp (雲稜營地 666) puts remaining into remaining_tents
    hut_666 = taroko_huts["666"]
    dec_666 = {a.date: a for a in parse_calendar_page(hut_666, _read_fixture("taroko_node_666_2026_12.html"))}
    assert dec_666["2026-12-01"].remaining_beds == 0
    assert dec_666["2026-12-01"].remaining_tents == 13
    assert dec_666["2026-12-01"].approved == 1
    assert dec_666["2026-12-01"].status == "available"


def test_gate1_sheipa_10_and_58():
    sheipa_huts = {h.node_id: h for h in parse_main_page("sheipa", _read_fixture("sheipa_main.html"))}
    hut_10 = sheipa_huts["10"]

    dec = {a.date: a for a in parse_calendar_page(hut_10, _read_fixture("sheipa_node_10_2026_12.html"))}
    jan = {a.date: a for a in parse_calendar_page(hut_10, _read_fixture("sheipa_node_10_2027_01.html"))}

    assert dec["2026-12-01"].status == "not_open"

    assert dec["2026-12-02"].remaining_beds == 100
    assert dec["2026-12-02"].reviewing == 0
    assert dec["2026-12-02"].approved == 6
    assert dec["2026-12-02"].queue == 2
    assert dec["2026-12-02"].status == "available"

    assert dec["2026-12-03"].remaining_beds == 71
    assert dec["2026-12-03"].reviewing == 1  # 待處理 0 + 補件 1
    assert dec["2026-12-03"].approved == 34
    assert dec["2026-12-03"].queue == 1
    assert dec["2026-12-03"].status == "available"

    assert dec["2026-12-04"].remaining_beds == 53
    assert dec["2026-12-04"].approved == 53
    assert dec["2026-12-04"].queue == 6  # 待系統排定 1 + 候補 5
    assert dec["2026-12-04"].status == "available"

    assert dec["2026-12-26"].remaining_beds == 0
    assert dec["2026-12-26"].approved == 106
    assert dec["2026-12-26"].queue == 10
    assert dec["2026-12-26"].status == "full"

    assert jan["2027-01-02"].remaining_beds == 81
    assert jan["2027-01-02"].reviewing == 6  # 補件 6
    assert jan["2027-01-02"].approved == 19
    assert jan["2027-01-02"].status == "available"


def test_gate1_yushan_4_3_and_226():
    yushan_huts = {h.node_id: h for h in parse_main_page("yushan", _read_fixture("yushan_main.html"))}

    # 1. 圓峰山屋/營地 (node_id=4, kind="both")
    hut_4 = yushan_huts["4"]
    dec_4 = {a.date: a for a in parse_calendar_page(hut_4, _read_fixture("yushan_node_4_2026_12.html"))}
    assert dec_4["2026-12-01"].status == "not_open"

    assert dec_4["2026-12-02"].remaining_beds == 1
    assert dec_4["2026-12-02"].remaining_tents == 0
    assert dec_4["2026-12-02"].queue == 1
    assert dec_4["2026-12-02"].approved == 23
    assert dec_4["2026-12-02"].status == "available"

    assert dec_4["2026-12-03"].remaining_beds == 0
    assert dec_4["2026-12-03"].remaining_tents == 0
    assert dec_4["2026-12-03"].approved == 24
    assert dec_4["2026-12-03"].status == "full"

    assert dec_4["2026-12-04"].remaining_beds == 0
    assert dec_4["2026-12-04"].remaining_tents == 1
    assert dec_4["2026-12-04"].queue == 5
    assert dec_4["2026-12-04"].approved == 23
    assert dec_4["2026-12-04"].status == "available"

    assert dec_4["2026-12-05"].remaining_beds == 0
    assert dec_4["2026-12-05"].remaining_tents == 1
    assert dec_4["2026-12-05"].queue == 4
    assert dec_4["2026-12-05"].approved == 19
    assert dec_4["2026-12-05"].status == "available"

    # 2. 排雲山莊 (node_id=3, booking_mode="lottery")
    hut_3 = yushan_huts["3"]
    dec_3 = {a.date: a for a in parse_calendar_page(hut_3, _read_fixture("yushan_node_3_2026_12.html"))}
    jan_3 = {a.date: a for a in parse_calendar_page(hut_3, _read_fixture("yushan_node_3_2027_01.html"))}

    assert dec_3["2026-12-01"].status == "not_open"
    assert dec_3["2026-12-04"].status == "lottery"
    assert dec_3["2026-12-04"].remaining_beds == 0
    assert dec_3["2026-12-18"].status == "lottery"
    assert dec_3["2026-12-18"].remaining_beds == 9
    assert jan_3["2027-01-01"].status == "lottery"
    assert jan_3["2027-01-01"].remaining_beds == 136
    assert jan_3["2027-01-01"].queue == 223

    # 3. 杜鵑營地 (node_id=226, closed)
    hut_226 = yushan_huts["226"]
    dec_226 = {a.date: a for a in parse_calendar_page(hut_226, _read_fixture("yushan_node_226_2026_12.html"))}
    assert dec_226["2026-12-02"].status == "closed"
    assert dec_226["2026-12-05"].status == "closed"


def test_extract_postback_fields():
    fields = extract_postback_fields(_read_fixture("taroko_get_node_124.html"))
    assert "__VIEWSTATE" in fields and fields["__VIEWSTATE"]
    assert "__EVENTVALIDATION" in fields and fields["__EVENTVALIDATION"]
    assert fields.get("ctl00$con$rooms") == "124"
    assert fields.get("ctl00$con$hidYear") == "2026"
    assert fields.get("ctl00$con$hidMonth") == "11"
