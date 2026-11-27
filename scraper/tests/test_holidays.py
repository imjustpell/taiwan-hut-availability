import datetime
from scraper.src.holidays import get_upcoming_weekend_blocks, BUILTIN_HOLIDAYS_DATA


def test_upcoming_8_weekends_include_national_holiday_nights():
    """Verify that starting from 2026-11-27, the 8 weekend blocks include 12/25 and 1/1 long weekend nights."""
    blocks = get_upcoming_weekend_blocks(datetime.date(2026, 11, 27), num_weekends=8)
    assert len(blocks) == 8

    # Block 0: 2026-11-27 (Fri), 2026-11-28 (Sat)
    assert [n["date"] for n in blocks[0]["nights"]] == ["2026-11-27", "2026-11-28"]
    assert blocks[0]["is_long_weekend"] is False

    # Block 4: 2026-12-25 (行憲紀念日 3-day連假) -> includes Thu 12/24 night, Fri 12/25 night, Sat 12/26 night
    assert blocks[4]["is_long_weekend"] is True
    assert blocks[4]["holiday_title"] == "行憲紀念日"
    assert [n["date"] for n in blocks[4]["nights"]] == ["2026-12-24", "2026-12-25", "2026-12-26"]

    # Block 5: 2027-01-01 (元旦 3-day連假) -> includes Thu 12/31 night, Fri 01/01 night, Sat 01/02 night
    assert blocks[5]["is_long_weekend"] is True
    assert blocks[5]["holiday_title"] == "元旦"
    assert [n["date"] for n in blocks[5]["nights"]] == ["2026-12-31", "2027-01-01", "2027-01-02"]
