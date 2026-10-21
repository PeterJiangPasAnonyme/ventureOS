#!/usr/bin/env python3
"""Build the Ridgeline GL and the uncleaned user export. Review artifacts only."""
from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.chart import BarChart, Reference
import random

OUT_GL = "/Users/peterjiangmacbookpro/Desktop/ventureOS/eval/ridgeline/finance/ridgeline-gl-2025Q4-2026Q3.xlsx"
OUT_USERS = "/Users/peterjiangmacbookpro/Desktop/ventureOS/eval/ridgeline/data/users-export-2026-10-12.xlsx"

BLUE = Font(name="Arial", size=10, color="0000FF")
BLACK = Font(name="Arial", size=10, color="000000")
HEAD = Font(name="Arial", size=10, bold=True, color="000000")
TITLE = Font(name="Arial", size=14, bold=True)
SECTION = Font(name="Arial", size=10, bold=True, color="FFFFFF")
SECTION_FILL = PatternFill("solid", fgColor="1F4D3A")
INPUT_FILL = PatternFill("solid", fgColor="F4F7FB")
ZEBRA = PatternFill("solid", fgColor="F7F4EF")
THIN = Border(
    left=Side(style="thin", color="D6D3D1"),
    right=Side(style="thin", color="D6D3D1"),
    top=Side(style="thin", color="D6D3D1"),
    bottom=Side(style="thin", color="D6D3D1"),
)
MONEY = '$#,##0;($#,##0);"-"'
PCT = "0.0%"
COUNT = "#,##0"

MONTHS = [
    "Oct 2025", "Nov 2025", "Dec 2025",
    "Jan 2026", "Feb 2026", "Mar 2026",
    "Apr 2026", "May 2026", "Jun 2026",
    "Jul 2026", "Aug 2026", "Sep 2026",
]

# Input rows, dollars or counts, 12 months. Calculated rows are formulas.
GROSS = [6_200_000, 14_100_000, 16_100_000, 15_400_000, 14_200_000, 12_200_000, 9_800_000, 5_100_000, 3_700_000, 2_900_000, 3_400_000, 4_900_000]
CANCELS = [500_000, 1_600_000, 2_000_000, 2_100_000, 1_900_000, 1_600_000, 1_100_000, 500_000, 300_000, 200_000, 250_000, 350_000]
COMMISSION = [540_000, 1_220_000, 1_420_000, 1_380_000, 1_280_000, 1_060_000, 820_000, 430_000, 300_000, 240_000, 290_000, 410_000]
SNOW = [160_000, 170_000, 190_000, 200_000, 210_000, 200_000, 200_000, 190_000, 190_000, 200_000, 210_000, 230_000]
PLACE = [40_000, 50_000, 50_000, 55_000, 55_000, 50_000, 45_000, 35_000, 30_000, 25_000, 30_000, 35_000]
AFFILIATE = [210_000, 480_000, 550_000, 520_000, 480_000, 410_000, 330_000, 170_000, 120_000, 100_000, 120_000, 160_000]
PAYMENTS = [80_000, 190_000, 220_000, 210_000, 190_000, 160_000, 130_000, 70_000, 50_000, 40_000, 50_000, 70_000]
LICENSES = [120_000, 120_000, 120_000, 120_000, 120_000, 120_000, 120_000, 130_000, 130_000, 130_000, 125_000, 125_000]
SUPPORT = [80_000, 150_000, 180_000, 220_000, 210_000, 190_000, 140_000, 80_000, 60_000, 50_000, 60_000, 80_000]
SM = [500_000, 650_000, 650_000, 750_000, 700_000, 650_000, 600_000, 500_000, 500_000, 450_000, 450_000, 500_000]
PRODUCT = [700_000, 750_000, 750_000, 760_000, 770_000, 770_000, 800_000, 820_000, 830_000, 820_000, 840_000, 840_000]
GA = [280_000, 300_000, 320_000, 310_000, 310_000, 320_000, 340_000, 380_000, 380_000, 360_000, 380_000, 380_000]
CASH = [12_400_000, 11_600_000, 11_200_000, 10_600_000, 10_100_000, 9_800_000, 9_400_000, 15_200_000, 14_100_000, 15_600_000, 16_000_000, 16_400_000]
HC = [72, 73, 74, 76, 78, 79, 81, 84, 86, 88, 90, 91]
SUBS = [38200, 39800, 41200, 42600, 43900, 44800, 45600, 46400, 47100, 48900, 50600, 52300]
NEW_BOOKERS = [4200, 6800, 7400, 7600, 7200, 6400, 3100, 2400, 2100, 1400, 1600, 1900]
# renewal is quarterly, stored on the quarterly sheet
RENEWAL = [0.71, 0.69, 0.76, 0.74]

# Channel mix of new bookers. Leaves an unattributed remainder on purpose.
ORGANIC = [1800, 2600, 2900, 3000, 2800, 2500, 1400, 1100, 900, 600, 700, 800]
PAID = [1500, 2500, 2700, 2800, 2600, 2300, 900, 700, 600, 400, 450, 500]
PARTNER = [400, 700, 800, 800, 750, 700, 300, 200, 200, 150, 150, 200]


def apply_font_range(ws):
    for row in ws.iter_rows():
        for cell in row:
            if cell.font is None or cell.font.name != "Arial":
                cell.font = Font(name="Arial", size=cell.font.size or 10, bold=cell.font.bold, color=cell.font.color)


def build_gl():
    wb = Workbook()
    cover = wb.active
    cover.title = "Read me"
    cover["A1"] = "Ridgeline GL export"
    cover["A1"].font = TITLE
    cover["A2"] = "Pulled 16 Oct 2026 from the ledger. Calendar months, Oct 2025 through Sep 2026. Not a fiscal-year pack. Not a deck."
    cover["A2"].font = Font(name="Arial", size=10)
    cover["A4"] = "Blue numbers are entered actuals. Black numbers are formulas. Do not paste a single month into a round-number slide."
    cover["A4"].font = Font(name="Arial", size=10, italic=True)
    cover["A6"] = "Tabs"
    cover["A6"].font = HEAD
    cover["A7"] = "Monthly — one column per month"
    cover["A8"] = "Quarters — Q4 2025, Q1 2026, Q2 2026, Q3 2026, and the twelve-month total"
    cover["A9"] = "New bookers by source — does not tie to New bookers. The gap is the unattributed line."
    for row in range(2, 10):
        cover.cell(row, 1).font = Font(name="Arial", size=10)
    cover["A1"].font = TITLE
    cover["A6"].font = HEAD
    cover.column_dimensions["A"].width = 110
    cover.row_dimensions[2].height = 32
    cover.sheet_properties.tabColor = "1F4D3A"

    ws = wb.create_sheet("Monthly")
    ws["A1"] = "Monthly actuals"
    ws["A1"].font = TITLE
    ws["A2"] = "Entered figures are the close. Formulas are the relationships finance uses. Renewal rate is not on this tab."
    ws["A2"].font = Font(name="Arial", size=9, italic=True, color="44403C")
    ws.merge_cells("A2:N2")

    ws["A4"] = "Line"
    for i, label in enumerate(MONTHS):
        cell = ws.cell(4, 2 + i, label)
        cell.font = HEAD
        cell.alignment = Alignment(horizontal="center")
    total_cell = ws.cell(4, 14, "Twelve months")
    total_cell.font = HEAD
    for col in range(1, 15):
        ws.cell(4, col).fill = SECTION_FILL
        ws.cell(4, col).font = Font(name="Arial", size=10, bold=True, color="FFFFFF")

    # row map
    # 5 gross (input)
    # 6 cancellations (input)
    # 7 net bookings = B5-B6
    # 8 commission (input)
    # 9 snow (input)
    # 10 placement (input)
    # 11 net revenue = B8+B9+B10
    # 12 affiliate
    # 13 payments
    # 14 licenses
    # 15 support
    # 16 variable = sum 12:15
    # 17 contribution = 11-16
    # 18 contribution margin = 17/11
    # 19 sm
    # 20 product
    # 21 ga
    # 22 opex = sum 19:21
    # 23 operating income = 17-22
    # 24 cash (input, point in time — twelve month column is the last month, not a sum)
    # 25 hc point in time
    # 26 subs point in time
    # 27 new bookers
    # 28 take rate = commission/gross

    labels = {
        5: "Gross bookings",
        6: "Cancellations",
        7: "Net bookings",
        8: "Booking commission revenue",
        9: "Snow Pass revenue",
        10: "Resort placement revenue",
        11: "Net revenue",
        12: "Affiliate fees, lodging",
        13: "Payment fees",
        14: "Snow, map, and forecast licenses",
        15: "Support and chargebacks",
        16: "Variable costs",
        17: "Contribution profit",
        18: "Contribution margin",
        19: "Sales and marketing",
        20: "Product and engineering",
        21: "G&A",
        22: "Operating expenses",
        23: "Operating income",
        24: "Cash, end of month",
        25: "Headcount, end of month",
        26: "Snow Pass subscribers, end of month",
        27: "New bookers",
        28: "Take rate (commission / gross bookings)",
    }
    inputs = {
        5: GROSS,
        6: CANCELS,
        8: COMMISSION,
        9: SNOW,
        10: PLACE,
        12: AFFILIATE,
        13: PAYMENTS,
        14: LICENSES,
        15: SUPPORT,
        19: SM,
        20: PRODUCT,
        21: GA,
        24: CASH,
        25: HC,
        26: SUBS,
        27: NEW_BOOKERS,
    }
    money_rows = set(range(5, 25)) - {18}
    count_rows = {25, 26, 27}
    pct_rows = {18, 28}
    point_in_time = {24, 25, 26}

    for r, label in labels.items():
        cell = ws.cell(r, 1, label)
        cell.font = HEAD if r in (7, 11, 16, 17, 18, 22, 23, 28) else BLACK
        if r in inputs:
            for i, value in enumerate(inputs[r]):
                c = ws.cell(r, 2 + i, value)
                c.font = BLUE
                c.fill = INPUT_FILL
        else:
            for i in range(12):
                col = get_column_letter(2 + i)
                if r == 7:
                    formula = f"={col}5-{col}6"
                elif r == 11:
                    formula = f"={col}8+{col}9+{col}10"
                elif r == 16:
                    formula = f"={col}12+{col}13+{col}14+{col}15"
                elif r == 17:
                    formula = f"={col}11-{col}16"
                elif r == 18:
                    formula = f'=IF({col}11=0,"-",{col}17/{col}11)'
                elif r == 22:
                    formula = f"={col}19+{col}20+{col}21"
                elif r == 23:
                    formula = f"={col}17-{col}22"
                elif r == 28:
                    formula = f'=IF({col}5=0,"-",{col}8/{col}5)'
                else:
                    formula = None
                c = ws.cell(r, 2 + i, formula)
                c.font = BLACK

        # twelve-month column
        if r in point_in_time:
            c = ws.cell(r, 14, f"={get_column_letter(13)}{r}")
            c.font = Font(name="Arial", size=10, color="008000")
        elif r == 18:
            c = ws.cell(r, 14, '=IF(N11=0,"-",N17/N11)')
            c.font = BLACK
        elif r == 28:
            c = ws.cell(r, 14, '=IF(N5=0,"-",N8/N5)')
            c.font = BLACK
        else:
            c = ws.cell(r, 14, f"=SUM(B{r}:M{r})")
            c.font = BLACK

        for col in range(1, 15):
            cell = ws.cell(r, col)
            cell.border = THIN
            if col > 1 and r in money_rows:
                cell.number_format = MONEY
            elif col > 1 and r in count_rows:
                cell.number_format = COUNT
            elif col > 1 and r in pct_rows:
                cell.number_format = PCT
        if r % 2 == 0:
            ws.cell(r, 1).fill = ZEBRA

    ws.cell(5, 2).comment = Comment(
        "Hardcoded actual from the Oct 2025 close. Same for every blue cell on this tab. Source: company ledger, pulled 16 Oct 2026.",
        "Finance",
        width=240,
        height=70,
    )
    ws.cell(24, 14).comment = Comment(
        "Cash, headcount, and subscribers are end of period. The twelve-month column points at September 2026, it does not add the months.",
        "Finance",
        width=240,
        height=70,
    )

    ws.column_dimensions["A"].width = 48
    for col in range(2, 15):
        ws.column_dimensions[get_column_letter(col)].width = 14
    ws.freeze_panes = "B5"
    ws.auto_filter.ref = "A4:N28"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 1
    ws.page_setup.paperSize = ws.PAPERSIZE_TABLOID
    ws.sheet_properties.tabColor = "1F4D3A"
    ws.oddHeader.left.text = "Ridgeline GL"
    ws.oddFooter.right.text = "Pulled 16 Oct 2026"

    q = wb.create_sheet("Quarters")
    q["A1"] = "Calendar quarters"
    q["A1"].font = TITLE
    q["A2"] = "Every figure on this tab is a formula back to Monthly, except renewal rate, which is entered once a quarter."
    q["A2"].font = Font(name="Arial", size=9, italic=True, color="44403C")
    headers = ["Line", "Q4 2025", "Q1 2026", "Q2 2026", "Q3 2026", "Last twelve months"]
    for i, h in enumerate(headers, 1):
        c = q.cell(4, i, h)
        c.fill = SECTION_FILL
        c.font = Font(name="Arial", size=10, bold=True, color="FFFFFF")
        c.alignment = Alignment(horizontal="center" if i > 1 else "left")

    # Monthly columns: B-D Q4, E-G Q1, H-J Q2, K-M Q3
    quarter_cols = [("B", "D"), ("E", "G"), ("H", "J"), ("K", "M")]
    for r, label in labels.items():
        q.cell(r, 1, f"=Monthly!A{r}").font = Font(name="Arial", size=10, color="008000")
        for qi, (start, end) in enumerate(quarter_cols):
            if r in point_in_time:
                formula = f"=Monthly!{end}{r}"
            elif r in pct_rows:
                # recompute from quarter totals, don't average rates
                if r == 18:
                    formula = f'=IF({get_column_letter(2+qi)}11=0,"-",{get_column_letter(2+qi)}17/{get_column_letter(2+qi)}11)'
                else:
                    formula = f'=IF({get_column_letter(2+qi)}5=0,"-",{get_column_letter(2+qi)}8/{get_column_letter(2+qi)}5)'
            else:
                formula = f"=SUM(Monthly!{start}{r}:{end}{r})"
            cell = q.cell(r, 2 + qi, formula)
            cell.font = BLACK
        if r in point_in_time:
            q.cell(r, 6, "=E{0}".format(r)).font = Font(name="Arial", size=10, color="008000")
        elif r == 18:
            q.cell(r, 6, '=IF(F11=0,"-",F17/F11)').font = BLACK
        elif r == 28:
            q.cell(r, 6, '=IF(F5=0,"-",F8/F5)').font = BLACK
        else:
            q.cell(r, 6, f"=SUM(B{r}:E{r})").font = BLACK
        for col in range(1, 7):
            cell = q.cell(r, col)
            cell.border = THIN
            if col > 1 and r in money_rows:
                cell.number_format = MONEY
            elif col > 1 and r in count_rows:
                cell.number_format = COUNT
            elif col > 1 and r in pct_rows:
                cell.number_format = PCT

    q.cell(30, 1, "Snow Pass renewal rate").font = HEAD
    for i, rate in enumerate(RENEWAL):
        c = q.cell(30, 2 + i, rate)
        c.font = BLUE
        c.fill = INPUT_FILL
        c.number_format = PCT
        c.border = THIN
    q.cell(30, 6, "=E30")
    q.cell(30, 6).font = Font(name="Arial", size=10, color="008000")
    q.cell(30, 6).number_format = PCT
    q.cell(30, 6).border = THIN
    q.cell(30, 1).border = THIN
    q.cell(30, 2).comment = Comment(
        "Entered once a quarter from the subscriber cohort file. Not a monthly actual. Last-twelve-months cell repeats Q3 2026, it is not an average.",
        "Finance",
        width=240,
        height=70,
    )

    q.column_dimensions["A"].width = 48
    for col in range(2, 7):
        q.column_dimensions[get_column_letter(col)].width = 20
    q.freeze_panes = "B5"
    q.page_setup.orientation = "landscape"
    q.page_setup.fitToPage = True
    q.page_setup.fitToWidth = 1
    q.page_setup.fitToHeight = 1
    q.page_setup.paperSize = q.PAPERSIZE_TABLOID
    q.sheet_properties.tabColor = "9A3412"
    q.print_title_rows = "1:4"

    chart = BarChart()
    chart.type = "col"
    chart.title = "Gross bookings by quarter"
    chart.y_axis.title = None
    chart.style = 10
    data = Reference(q, min_col=2, max_col=5, min_row=5, max_row=5)
    cats = Reference(q, min_col=2, max_col=5, min_row=4, max_row=4)
    chart.add_data(data, from_rows=True, titles_from_data=False)
    chart.set_categories(cats)
    chart.shape = 4
    chart.legend = None
    chart.y_axis.numFmt = "$#,##0"
    chart.width = 18
    chart.height = 6
    q.add_chart(chart, "A32")

    ch = wb.create_sheet("New bookers by source")
    ch["A1"] = "New bookers by source"
    ch["A1"].font = TITLE
    ch["A2"] = "Warehouse attribution export, same pull. It does not cover every new booker. Unattributed is the plug."
    ch["A2"].font = Font(name="Arial", size=9, italic=True, color="44403C")
    ch["A4"] = "Source"
    for i, label in enumerate(MONTHS):
        c = ch.cell(4, 2 + i, label)
        c.font = Font(name="Arial", size=10, bold=True, color="FFFFFF")
        c.fill = SECTION_FILL
    ch["A4"].fill = SECTION_FILL
    ch["A4"].font = Font(name="Arial", size=10, bold=True, color="FFFFFF")
    ch.cell(4, 14, "Twelve months").font = Font(name="Arial", size=10, bold=True, color="FFFFFF")
    ch.cell(4, 14).fill = SECTION_FILL

    for name, row, series in (
        ("Organic", 5, ORGANIC),
        ("Paid", 6, PAID),
        ("Partner", 7, PARTNER),
    ):
        ch.cell(row, 1, name).font = BLACK
        for i, value in enumerate(series):
            c = ch.cell(row, 2 + i, value)
            c.font = BLUE
            c.fill = INPUT_FILL
            c.number_format = COUNT
            c.border = THIN
        c = ch.cell(row, 14, f"=SUM(B{row}:M{row})")
        c.font = BLACK
        c.number_format = COUNT
        c.border = THIN
        ch.cell(row, 1).border = THIN

    ch.cell(8, 1, "Attributed").font = HEAD
    ch.cell(9, 1, "New bookers on the GL").font = HEAD
    ch.cell(10, 1, "Unattributed").font = HEAD
    for i in range(12):
        col = get_column_letter(2 + i)
        for row, formula in (
            (8, f"={col}5+{col}6+{col}7"),
            (9, f"=Monthly!{col}27"),
            (10, f"={col}9-{col}8"),
        ):
            c = ch.cell(row, 2 + i, formula)
            c.font = Font(name="Arial", size=10, color="008000") if row == 9 else BLACK
            c.number_format = COUNT
            c.border = THIN
        ch.cell(8, 1).border = THIN
        ch.cell(9, 1).border = THIN
        ch.cell(10, 1).border = THIN
    for row in (8, 9, 10):
        c = ch.cell(row, 14, f"=SUM(B{row}:M{row})")
        c.font = BLACK
        c.number_format = COUNT
        c.border = THIN
    ch.cell(5, 2).comment = Comment(
        "Entered counts from the attribution export. Unattributed is new bookers minus organic, paid, and partner. The gap is real in this pull.",
        "Finance",
        width=240,
        height=70,
    )
    ch.column_dimensions["A"].width = 28
    for col in range(2, 15):
        ch.column_dimensions[get_column_letter(col)].width = 14
    ch.freeze_panes = "B5"
    ch.sheet_properties.tabColor = "C4B8A5"
    ch.page_setup.orientation = "landscape"
    ch.page_setup.fitToPage = True
    ch.page_setup.fitToWidth = 1
    ch.page_setup.fitToHeight = 1

    wb.save(OUT_GL)


def build_users():
    rng = random.Random(20261012)
    airports = ["DEN", "ORD", "EWR", "SEA", "SLC", "DFW", "BOS", "LAX", "MSP", "YYZ", ""]
    passes = ["Epic", "EPIC", "epic", "Ikon", "ikon", "ikon pass", "Day ticket", "day ticket", "day-ticket", "", "none"]
    resorts = ["Winter Park", "Copper", "Breck", "Vail", "Killington", "Stowe", "Whistler", "Big Sky", "Jackson", ""]
    sources = ["organic", "Organic", "paid", "Paid search", "partner", "Partner", "", "unknown"]
    snow = ["active", "cancelled", "trial", "", "ACTIVE", "no"]

    wb = Workbook()
    raw = wb.active
    raw.title = "users"
    headers = [
        "user_id", "email", "signed_up", "home_airport", "pass_field",
        "snow_pass", "last_booking", "last_resort", "party_size",
        "gross_booking_usd", "cancelled_flag", "refund_usd", "acquisition", "note",
    ]
    for i, h in enumerate(headers, 1):
        c = raw.cell(1, i, h)
        c.font = Font(name="Arial", size=10, bold=True, color="FFFFFF")
        c.fill = SECTION_FILL
    raw.auto_filter.ref = "A1:N2001"
    raw.freeze_panes = "A2"
    raw.auto_filter.ref = "A1:N2001"

    ids = [f"U{n:05d}" for n in range(1, 1986)]
    # 15 duplicate ids appended
    dup_ids = rng.sample(ids, 15)
    all_ids = ids + dup_ids
    rng.shuffle(all_ids)

    for r, uid in enumerate(all_ids, 2):
        n = int(uid[1:])
        local = rng.choice(["alex", "sam", "jordan", "riley", "casey", "taylor", "guest"])
        messy_email = rng.random() < 0.04
        email = f" {local}{n}@example.com " if messy_email else f"{local}{n}@example.com"
        year = rng.choice([2023, 2024, 2025, 2026])
        month = rng.randint(1, 12 if year < 2026 else 9)
        day = rng.randint(1, 28)
        signed = f"{year:04d}-{month:02d}-{day:02d}"
        if rng.random() < 0.03:
            signed = f"{month}/{day}/{year}"  # mixed date format
        airport = rng.choice(airports)
        if rng.random() < 0.05:
            airport = airport.lower()
        pass_field = rng.choice(passes)
        sp = rng.choice(snow)
        by, bm = rng.choice([2025, 2026]), rng.randint(1, 12 if True else 9)
        if by == 2026 and bm > 9:
            bm = rng.randint(1, 9)
        last_booking = f"{by:04d}-{bm:02d}-{rng.randint(1, 28):02d}"
        if rng.random() < 0.08:
            last_booking = ""
        resort = rng.choice(resorts)
        party = rng.choice([1, 1, 2, 2, 2, 3, 4, 4, 6, None])
        gross = rng.randrange(180, 6400, 10)
        if rng.random() < 0.07:
            gross = 0
        cancelled = rng.choice(["Y", "N", "yes", "no", "1", "0", ""])
        refund = rng.randrange(0, 900, 10) if cancelled in ("Y", "yes", "1") and rng.random() < 0.7 else 0
        source = rng.choice(sources)
        note = ""
        if uid in dup_ids and rng.random() < 0.5:
            note = "dup id, second row from a reimport"
        elif rng.random() < 0.02:
            note = "test account?"
        values = [uid, email, signed, airport, pass_field, sp, last_booking, resort, party, gross, cancelled, refund, source, note]
        for c, value in enumerate(values, 1):
            cell = raw.cell(r, c, value)
            cell.font = Font(name="Arial", size=9)
            if c in (10, 12) and isinstance(value, (int, float)):
                cell.number_format = MONEY
        if r % 2 == 0:
            for c in range(1, 15):
                if raw.cell(r, c).fill.fgColor is None or raw.cell(r, c).fill.fgColor.rgb in ("00000000", None):
                    raw.cell(r, c).fill = ZEBRA

    widths = [12, 28, 14, 14, 14, 12, 14, 16, 12, 18, 14, 14, 16, 36]
    for i, w in enumerate(widths, 1):
        raw.column_dimensions[get_column_letter(i)].width = w
    raw.auto_filter.ref = "A1:N2001"
    raw.page_setup.orientation = "landscape"
    raw.page_setup.fitToPage = True
    raw.page_setup.fitToWidth = 1
    raw.page_setup.fitToHeight = 0
    raw.page_setup.paperSize = raw.PAPERSIZE_TABLOID
    raw.sheet_properties.tabColor = "1F4D3A"
    raw.oddHeader.left.text = "users export 12 Oct 2026 — not deduped"
    raw.auto_filter.ref = "A1:N2001"
    raw.freeze_panes = "A2"

    summary = wb.create_sheet("summary", 0)
    summary["A1"] = "users export summary"
    summary["A1"].font = TITLE
    summary["A2"] = "Export dated 12 Oct 2026. Rows were not deduped. pass_field was not standardized. Counts below are exact string matches, so Epic and EPIC are different lines."
    summary["A2"].font = Font(name="Arial", size=9, italic=True, color="44403C")
    summary.merge_cells("A2:C2")
    summary["A4"] = "Check"
    summary["B4"] = "Result"
    summary["C4"] = "How"
    for col in range(1, 4):
        summary.cell(4, col).fill = SECTION_FILL
        summary.cell(4, col).font = Font(name="Arial", size=10, bold=True, color="FFFFFF")

    checks = [
        (5, "Rows", '=COUNTA(users!A2:A2001)', "Every data row, including duplicate user_ids"),
        (6, "pass_field = Epic", '=COUNTIF(users!E:E,"Epic")', "Exact match"),
        (7, "pass_field = EPIC", '=COUNTIF(users!E:E,"EPIC")', "Exact match"),
        (8, "pass_field = epic", '=COUNTIF(users!E:E,"epic")', "Exact match"),
        (9, "pass_field = Ikon", '=COUNTIF(users!E:E,"Ikon")', "Exact match"),
        (10, "pass_field = ikon", '=COUNTIF(users!E:E,"ikon")', "Exact match"),
        (11, "pass_field = ikon pass", '=COUNTIF(users!E:E,"ikon pass")', "Exact match"),
        (12, "pass_field = Day ticket", '=COUNTIF(users!E:E,"Day ticket")', "Exact match"),
        (13, "pass_field = day ticket", '=COUNTIF(users!E:E,"day ticket")', "Exact match"),
        (14, "pass_field = day-ticket", '=COUNTIF(users!E:E,"day-ticket")', "Exact match"),
        (15, "pass_field blank", '=COUNTBLANK(users!E2:E2001)', "Empty pass field"),
        (16, "pass_field = none", '=COUNTIF(users!E:E,"none")', "The word none"),
        (17, "Sum of the pass lines above", "=SUM(B6:B16)", "Will not equal row count if a value is missing from the list"),
        (18, "Rows missing from the pass lines", "=B5-B17", "Should be zero. If it is not, the list is incomplete."),
        (19, "cancelled_flag = Y", '=COUNTIF(users!K:K,"Y")', "Does not include yes or 1"),
        (20, "cancelled_flag = yes", '=COUNTIF(users!K:K,"yes")', "Separate from Y"),
        (21, "cancelled_flag = 1", '=COUNTIF(users!K:K,"1")', "Stored as text"),
        (22, "Sum of gross_booking_usd", "=SUM(users!J2:J2001)", "Includes zeroes and cancelled trips"),
        (23, "Sum of refund_usd", "=SUM(users!L2:L2001)", "Only rows where a refund amount was filled in"),
    ]
    for row, label, formula, how in checks:
        summary.cell(row, 1, label).font = BLACK
        c = summary.cell(row, 2, formula)
        c.font = BLACK
        c.number_format = MONEY if row in (22, 23) else COUNT
        summary.cell(row, 3, how).font = Font(name="Arial", size=9, italic=True, color="44403C")
        for col in range(1, 4):
            summary.cell(row, col).border = THIN
    summary.column_dimensions["A"].width = 36
    summary.column_dimensions["B"].width = 18
    summary.column_dimensions["C"].width = 62
    summary.page_setup.orientation = "landscape"
    summary.page_setup.fitToPage = True
    summary.page_setup.fitToWidth = 1
    summary.page_setup.fitToHeight = 1
    summary.sheet_properties.tabColor = "9A3412"
    summary["B5"].comment = Comment(
        "Formula over the users tab. The export was not cleaned. Do not treat a single pass_field count as the number of Epic bookers.",
        "Data",
        width=240,
        height=60,
    )

    wb.save(OUT_USERS)


if __name__ == "__main__":
    build_gl()
    build_users()
    print("wrote", OUT_GL)
    print("wrote", OUT_USERS)
