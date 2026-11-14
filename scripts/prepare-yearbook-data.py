"""Regenerate country CSVs from the independently verified yearbook extraction.

Run from the repository root. Existing membership, first-visit order and known
lifetime totals are preserved. Source CSVs and workbook hashes live in data/sources.
"""
import csv
import json
from decimal import Decimal
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
provenance = json.loads((ROOT / 'data/sources/yearbook-provenance.json').read_text())


def read(path):
    with (ROOT / path).open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def write(path, rows, headers=None):
    with (ROOT / path).open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=headers or list(rows[0]), lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


overview = read("data/countries.csv")
summaries = {r["CountryCode"]: r for r in read("data/sources/yearbook-country-summary.csv")}
visits = read("data/sources/yearbook-visits.csv")
periods = read("data/sources/yearbook-stay-periods.csv")
history = []
source_note = "Recorded history: Travel Yearbook, Organized, excluding SA3.0; return gaps under 14 days merge visits; gaps do not count as days spent. Lifetime history may be incomplete."
for row in overview:
    recorded = summaries.get(row["CountryCode"])
    row["RecordedVisits"] = recorded["RecordedVisits"] if recorded else ""
    row["RecordedDaysSpent"] = recorded["RecordedDaysSpent"] if recorded else ""
    if recorded and recorded["RecordedVisits"]:
        assert row["VisitStatus"] == "visited"
        if source_note not in row["Notes"]:
            row["Notes"] = (row["Notes"] + " " + source_note).strip()
        if row["CountryCode"] == "MY":
            ambiguity = "21 July 2025 uses the Malaysia flag although Morning says Seoul and KL appears only in Midnight; flag-based attribution retained."
            if ambiguity not in row["Notes"]:
                row["Notes"] += " " + ambiguity
    elif row["VisitStatus"] == "visited":
        history.append(dict(CountryCode=row["CountryCode"], Country=row["Country"], VisitNumber="1",
                            ArrivalDate="", DepartureDate="", DaysSpent="",
                            Notes="Known visit from supplied country list; no qualifying yearbook dates. Counts and days remain unknown."))
for visit in visits:
    history.append(dict(CountryCode=visit["CountryCode"], Country=visit["Country"], VisitNumber=visit["VisitNumber"],
                        ArrivalDate=visit["ArrivalDate"], DepartureDate=visit["DepartureDate"],
                        DaysSpent=visit["RecordedDaysSpent"],
                        Notes="Recorded yearbook visit; actual stay periods exclude intervening gaps."))
stay_rows = [dict(CountryCode=p["CountryCode"], Country=p["Country"], VisitNumber=p["VisitNumber"],
                  PeriodNumber="", ArrivalDate=p["ArrivalDate"], DepartureDate=p["DepartureDate"],
                  DaysSpent=p['DaysSpent'] if Decimal(p['DaysSpent']) != (date.fromisoformat(p['DepartureDate']) - date.fromisoformat(p['ArrivalDate'])).days + 1 else '',
                  SourceRefs=";".join("Organized!" + c for c in p["SourceDateCells"].split(";") if c) or p.get('ApprovedSource', ''), Notes="") for p in periods]
numbers = {}
for p in stay_rows:
    key = (p["CountryCode"], p["VisitNumber"])
    numbers[key] = numbers.get(key, 0) + 1
    p["PeriodNumber"] = str(numbers[key])
history.sort(key=lambda r: (r["Country"], int(r["VisitNumber"])))
assert sum(Decimal(r["RecordedDaysSpent"] or 0) for r in overview) == Decimal(str(provenance['recorded_country_days']))
assert sum(int(r["RecordedVisits"] or 0) for r in overview) == 114
assert len(history) == 120 and len(stay_rows) == provenance['actual_contiguous_stay_periods']
write("data/countries.csv", overview)
write("data/country-visit-history.csv", history)
write("data/country-visit-periods.csv", stay_rows)
write("data/templates/countries-template.csv", overview)
write("data/templates/country-visits-template.csv", history)
write("data/templates/country-visit-periods-template.csv", stay_rows)
print(f"Prepared {len(overview)} country rows, 114 dated visits + 6 undated known visits, {len(stay_rows)} actual stays and {provenance['recorded_country_days']} country-days.")

# Preserve later owner-approved country additions after the historical rebuild.
import runpy
runpy.run_path(str(ROOT / "scripts/prepare-country-visit-updates.py"), run_name="__main__")
