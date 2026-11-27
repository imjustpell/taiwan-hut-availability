import calendar
import datetime
import re
from bs4 import BeautifulSoup, Tag
from .models import Availability, AvailabilityStatus, BookingMode, Capacity, Hut, HutKind, ParkId

PARK_BASE_URLS: dict[ParkId, str] = {
    "taroko": "https://hike.taiwan.gov.tw/bed_4.aspx",
    "sheipa": "https://hike.taiwan.gov.tw/bed_1.aspx",
    "yushan": "https://hike.taiwan.gov.tw/bed_6.aspx",
}

# Known lottery huts per requirement #6 (排雲山莊為抽籤制，狀態應標為 lottery，不顯示為一般空位)
LOTTERY_HUT_KEYS: set[tuple[str, str]] = {
    ("yushan", "3"),  # 排雲山莊
}


def _parse_int(val: str, default: int = 0) -> int:
    val = val.strip().replace(",", "")
    m = re.search(r"-?\d+", val)
    return int(m.group(0)) if m else default


def determine_hut_kind(park: ParkId, name: str, weekday_beds: int, weekday_tents: int, holiday_beds: int, holiday_tents: int) -> HutKind:
    has_beds = (weekday_beds + holiday_beds) > 0
    has_tents = (weekday_tents + holiday_tents) > 0
    if has_beds and has_tents:
        return "both"
    if has_beds:
        return "hut"
    if has_tents:
        return "camp"
    # Fallback when all capacities are 0 (e.g., closed sites)
    if ("山屋" in name or "山莊" in name or "小屋" in name) and "營地" in name and not name.endswith("避難小屋"):
        return "both"
    if name.endswith("營地"):
        return "camp"
    return "hut"


def parse_main_page(park: ParkId, html: str, base_url: str | None = None) -> list[Hut]:
    """Parse the park overview page (bed_4.aspx, bed_1.aspx, bed_6.aspx) into Hut objects."""
    if base_url is None:
        base_url = PARK_BASE_URLS[park]

    soup = BeautifulSoup(html, "html.parser")
    huts: list[Hut] = []
    seen_node_ids: set[str] = set()

    for tr in soup.select("table.table_bed tr"):
        a_tag = tr.find("a", id=lambda x: bool(x and "Repeater_List_name" in x))
        hid_tag = tr.find("input", id=lambda x: bool(x and "HiddenField1" in x))
        if not a_tag or not hid_tag:
            continue

        node_id = str(hid_tag.get("value", "")).strip()
        if not node_id or node_id in seen_node_ids:
            continue
        seen_node_ids.add(node_id)

        name = a_tag.get_text(strip=True)
        tds = tr.find_all("td")

        if park == "taroko":
            # Taroko table has 4 columns: [宿營地, 平日山屋床位, 假日山屋床位, 備註]
            # Locations ending with "營地" (e.g. 雲稜營地, 南湖營地, 天空營地) are campsites.
            c_weekday = _parse_int(tds[1].get_text(strip=True)) if len(tds) > 1 else 0
            c_holiday = _parse_int(tds[2].get_text(strip=True)) if len(tds) > 2 else 0
            is_camp = name.endswith("營地")
            if is_camp:
                cap = Capacity(weekday_beds=0, weekday_tents=c_weekday, holiday_beds=0, holiday_tents=c_holiday)
                kind: HutKind = "camp"
            else:
                cap = Capacity(weekday_beds=c_weekday, weekday_tents=0, holiday_beds=c_holiday, holiday_tents=0)
                kind = "hut"
        else:
            # Shei-Pa and Yushan tables have 6 columns:
            # [宿營地, 平日床位, 平日營位, 假日床位, 假日營位, 備註]
            wb = _parse_int(tds[1].get_text(strip=True)) if len(tds) > 1 else 0
            wt = _parse_int(tds[2].get_text(strip=True)) if len(tds) > 2 else 0
            hb = _parse_int(tds[3].get_text(strip=True)) if len(tds) > 3 else 0
            ht = _parse_int(tds[4].get_text(strip=True)) if len(tds) > 4 else 0
            cap = Capacity(weekday_beds=wb, weekday_tents=wt, holiday_beds=hb, holiday_tents=ht)
            kind = determine_hut_kind(park, name, wb, wt, hb, ht)

        booking_mode: BookingMode = "lottery" if (park, node_id) in LOTTERY_HUT_KEYS else "first_come"
        source_url = f"{base_url}?node_id={node_id}"
        huts.append(
            Hut(
                id=f"{park}_{node_id}",
                park=park,
                node_id=node_id,
                name=name,
                kind=kind,
                capacity=cap,
                booking_mode=booking_mode,
                source_url=source_url,
            )
        )

    return huts


def extract_postback_fields(html: str) -> dict[str, str]:
    """Extract all form#form1 input and select values needed for ASP.NET WebForms PostBack."""
    soup = BeautifulSoup(html, "html.parser")
    data: dict[str, str] = {}
    for inp in soup.select("form#form1 input"):
        name = inp.get("name")
        if name:
            data[name] = inp.get("value", "")
    for sel in soup.select("form#form1 select"):
        name = sel.get("name")
        if name:
            opt = sel.find("option", selected=True) or sel.find("option")
            data[name] = opt.get("value", "") if opt else ""
    return data


def extract_calendar_year_month(soup: BeautifulSoup, fallback_year: int | None = None, fallback_month: int | None = None) -> tuple[int, int]:
    """Extract current calendar year and month from hidden fields or select dropdowns."""
    hid_year = soup.select_one("#con_hidYear")
    hid_month = soup.select_one("#con_hidMonth")
    if hid_year and hid_month and hid_year.get("value") and hid_month.get("value"):
        return int(hid_year["value"]), int(hid_month["value"])

    sel_year = soup.select_one("#con_ddlYear option[selected]")
    sel_month = soup.select_one("#con_ddlMonth option[selected]")
    if sel_year and sel_month:
        return int(sel_year.get_text(strip=True)), int(sel_month.get_text(strip=True))

    if fallback_year is not None and fallback_month is not None:
        return fallback_year, fallback_month

    raise ValueError("Unable to determine calendar year and month from HTML")


def _parse_cell_for_park(hut: Hut, date_str: str, td: Tag) -> Availability:
    """Parse a single calendar <td> cell into an Availability record."""
    if hut.capacity.total_capacity() == 0:
        return Availability(
            hut_id=hut.id,
            date=date_str,
            remaining_beds=0,
            remaining_tents=0,
            queue=0,
            reviewing=0,
            approved=0,
            status="closed",
        )

    stop_link = td.find("a", id="stopdate") or td.find("a", href=lambda h: bool(h and "nodestop" in h))
    if stop_link:
        return Availability(
            hut_id=hut.id,
            date=date_str,
            remaining_beds=0,
            remaining_tents=0,
            queue=0,
            reviewing=0,
            approved=0,
            status="closed",
        )

    detail_link = td.find("a", href=lambda h: bool(h and "main.aspx" in h))
    if not detail_link:
        return Availability(
            hut_id=hut.id,
            date=date_str,
            remaining_beds=0,
            remaining_tents=0,
            queue=0,
            reviewing=0,
            approved=0,
            status="not_open",
        )

    text = " ".join(detail_link.get_text(" ", strip=True).split())

    remaining_beds = 0
    remaining_tents = 0
    queue = 0
    reviewing = 0
    approved = 0
    parsed_ok = False

    if hut.park == "taroko":
        m_rem = re.search(r"餘額\s*(\d+)", text)
        m_rev = re.search(r"待處理\s*(\d+)", text)
        m_app = re.search(r"已通過\s*(\d+)", text)
        if m_rem:
            parsed_ok = True
            rem_val = int(m_rem.group(1))
            if hut.kind == "camp":
                remaining_tents = rem_val
            else:
                remaining_beds = rem_val
        if m_rev:
            reviewing = int(m_rev.group(1))
        if m_app:
            approved = int(m_app.group(1))

    elif hut.park == "sheipa":
        m_rem = re.search(r"餘額\s*(\d+)", text)
        m_pend = re.search(r"待處理\s*(\d+)", text)
        m_supp = re.search(r"補件\s*(\d+)", text)
        m_app = re.search(r"已通過\s*(\d+)", text)
        m_sys = re.search(r"待系統排定\s*(\d+)", text)
        m_wait = re.search(r"宿營地不足候補\s*(\d+)", text)
        if m_rem:
            parsed_ok = True
            rem_val = int(m_rem.group(1))
            if hut.kind == "camp":
                remaining_tents = rem_val
            else:
                remaining_beds = rem_val
        pend_val = int(m_pend.group(1)) if m_pend else 0
        supp_val = int(m_supp.group(1)) if m_supp else 0
        reviewing = pend_val + supp_val
        if m_app:
            approved = int(m_app.group(1))
        sys_val = int(m_sys.group(1)) if m_sys else 0
        wait_val = int(m_wait.group(1)) if m_wait else 0
        queue = sys_val + wait_val

    elif hut.park == "yushan":
        m_rem = re.search(r"餘額\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)", text)
        if m_rem:
            parsed_ok = True
            remaining_beds = int(m_rem.group(1))
            remaining_tents = int(m_rem.group(2))
        elif "額滿" in text:
            parsed_ok = True
            remaining_beds = 0
            remaining_tents = 0

        m_q = re.search(r"排隊預約\s*(\d+)", text)
        m_rev = re.search(r"審核中\s*(\d+)", text)
        m_app = re.search(r"核准入園\s*(\d+)", text)
        if m_q:
            queue = int(m_q.group(1))
        if m_rev:
            reviewing = int(m_rev.group(1))
        if m_app:
            approved = int(m_app.group(1))

    if not parsed_ok:
        status: AvailabilityStatus = "unknown"
    elif hut.booking_mode == "lottery":
        status = "lottery"
    elif (remaining_beds + remaining_tents) == 0:
        status = "full"
    else:
        status = "available"

    return Availability(
        hut_id=hut.id,
        date=date_str,
        remaining_beds=remaining_beds,
        remaining_tents=remaining_tents,
        queue=queue,
        reviewing=reviewing,
        approved=approved,
        status=status,
    )


def parse_calendar_page(
    hut: Hut,
    html: str,
    fallback_year: int | None = None,
    fallback_month: int | None = None,
) -> list[Availability]:
    """Parse a monthly calendar HTML page for a given Hut into daily Availability objects."""
    soup = BeautifulSoup(html, "html.parser")
    table = soup.select_one("#con_CalendarDiv table.table_bed") or soup.select_one("#con_UpdatePanel2 table.table_bed")

    # If the page has no calendar table (e.g. Taroko node_id=697 天空營地 which is closed and not in #con_rooms)
    if not table or not soup.select_one("#con_ddlMonth"):
        if fallback_year is not None and fallback_month is not None and hut.capacity.total_capacity() == 0:
            _, days_in_month = calendar.monthrange(fallback_year, fallback_month)
            return [
                Availability(
                    hut_id=hut.id,
                    date=f"{fallback_year:04d}-{fallback_month:02d}-{day:02d}",
                    remaining_beds=0,
                    remaining_tents=0,
                    queue=0,
                    reviewing=0,
                    approved=0,
                    status="closed",
                )
                for day in range(1, days_in_month + 1)
            ]
        return []

    year, month = extract_calendar_year_month(soup, fallback_year, fallback_month)
    _, days_in_month = calendar.monthrange(year, month)
    # Sunday-first column index (Sunday=0, Monday=1, ..., Saturday=6)
    first_col = (datetime.date(year, month, 1).weekday() + 1) % 7

    tds = table.select("tbody td")
    results: list[Availability] = []

    for day in range(1, days_in_month + 1):
        idx = first_col + (day - 1)
        date_str = f"{year:04d}-{month:02d}-{day:02d}"
        if idx < len(tds):
            avail = _parse_cell_for_park(hut, date_str, tds[idx])
        else:
            avail = Availability(
                hut_id=hut.id,
                date=date_str,
                remaining_beds=0,
                remaining_tents=0,
                queue=0,
                reviewing=0,
                approved=0,
                status="closed" if hut.capacity.total_capacity() == 0 else "not_open",
            )
        results.append(avail)

    return results
