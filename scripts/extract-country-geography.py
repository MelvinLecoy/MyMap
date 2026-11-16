"""Extract the owner's final country taxonomy using only Python's standard library.

Run with --check to verify the tracked CSV and provenance without writing files.
Only the five literal table columns are read; workbook text is data, not commands.
"""

import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path("data/sources/country-geography/countries_categorization.xlsx")
CSV_PATH = Path("data/reference/country-geography.csv")
PROVENANCE_PATH = Path("data/sources/country-geography.json")
CITY_PATH = Path("data/cities.csv")
NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
HEADERS = ("Country", "Country Code", "Continent", "Region", "Subregion")
CSV_HEADERS = ("CountryCode", "Country", "Continent", "Region", "Subregion")


def sha256(value):
    return hashlib.sha256(value).hexdigest()


def extract():
    source = (ROOT / SOURCE).read_bytes()
    with ZipFile(io.BytesIO(source)) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        sheets = workbook.findall("x:sheets/x:sheet", NS)
        if len(sheets) != 1 or sheets[0].get("name") != "Countries":
            raise ValueError("Expected the single owner-supplied Countries sheet.")
        relation = sheets[0].get(
            "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
        )
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        target = next(
            item.attrib["Target"]
            for item in relationships
            if item.attrib["Id"] == relation
        )
        sheet_path = target.lstrip("/") if target.startswith("/") else "xl/" + target
        strings = [
            "".join(item.itertext())
            for item in ET.fromstring(archive.read("xl/sharedStrings.xml"))
        ]
        sheet = ET.fromstring(archive.read(sheet_path))
        rows = []
        for row in sheet.findall("x:sheetData/x:row", NS):
            values = [""] * 5
            for cell in row.findall("x:c", NS):
                if cell.find("x:f", NS) is not None:
                    raise ValueError("Country classification cells must be literal values.")
                raw = cell.findtext("x:v", default="", namespaces=NS)
                value = strings[int(raw)] if cell.get("t") == "s" else raw
                if cell.get("t") == "inlineStr":
                    value = "".join(cell.find("x:is", NS).itertext())
                column = "".join(letter for letter in cell.attrib["r"] if letter.isalpha())
                if column not in ("A", "B", "C", "D", "E"):
                    if value:
                        raise ValueError("Unexpected data outside the five classification columns.")
                    continue
                values[ord(column) - ord("A")] = value
            if any(values):
                rows.append(values)
    if tuple(rows[0]) != HEADERS or len(rows) != 198:
        raise ValueError("Expected the final workbook's header and 197 country rows.")
    records = rows[1:]
    overview = list(csv.DictReader((ROOT / "data/countries.csv").open(encoding="utf-8-sig")))
    expected = {row["CountryCode"]: row for row in overview}
    seen = set()
    for name, code, continent, region, subregion in records:
        if code in seen or code not in expected:
            raise ValueError(f"Duplicate or unknown country code: {code}")
        if expected[code]["Country"] != name or expected[code]["Continent"] != continent:
            raise ValueError(f"Country identity/continent differs from the approved overview: {code}")
        if subregion and not region:
            raise ValueError(f"A subregion needs its supplied parent region: {code}")
        seen.add(code)
    if seen != expected.keys():
        raise ValueError("The workbook must cover every country in the 197-country overview.")
    text = io.StringIO(newline="")
    writer = csv.writer(text, lineterminator="\n")
    writer.writerow(CSV_HEADERS)
    writer.writerows((code, name, continent, region, subregion) for name, code, continent, region, subregion in records)
    csv_bytes = text.getvalue().encode("utf-8")
    provenance = {
        "authority": "Owner-supplied final country categorization; preserve labels and blank cells verbatim.",
        "workbook": {"path": str(SOURCE), "sha256": sha256(source), "sheet": "Countries", "rows": len(records)},
        "csv": {"path": str(CSV_PATH), "sha256": sha256(csv_bytes)},
        "blankRegions": sum(not row[3] for row in records),
        "blankSubregions": sum(not row[4] for row in records),
        "unlistedCountries": {"SJ": "Svalbard is absent from this workbook. Preserve its existing continent and leave its region/subregion unspecified."},
        "scope": "Authoritative country and city travel classification. Country identity, metric reference figures and metric median regions remain separate.",
    }
    outputs = {
        CSV_PATH: csv_bytes,
        PROVENANCE_PATH: (json.dumps(provenance, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
    }
    city_text = (ROOT / CITY_PATH).read_text(encoding="utf-8-sig")
    cities = list(csv.DictReader(io.StringIO(city_text, newline="")))
    city_headers = list(cities[0])
    by_code = {row[1]: row for row in records}
    changed = False
    for city in cities:
        code = city["CountryCode"]
        if code == "SJ":
            continue
        if not code or code not in by_code:
            raise ValueError(f"City {city['CityId']} needs an explicit classified CountryCode; no country is inferred.")
        _, _, continent, region, subregion = by_code[code]
        for field, value in (("Continent", continent), ("Region", region), ("SubRegion", subregion)):
            if city[field] != value:
                city[field] = value
                changed = True
    # Preserve source bytes if every classification already matches. Mutable
    # names/statuses/visits/map URLs/coordinates are never rewritten by --check.
    if changed:
        city_buffer = io.StringIO(newline="")
        writer = csv.DictWriter(city_buffer, fieldnames=city_headers, lineterminator="\n")
        writer.writeheader()
        writer.writerows(cities)
        outputs[CITY_PATH] = city_buffer.getvalue().encode("utf-8")
    return outputs


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--prepare", action="store_true", help="Write the extracted reference and matching city geography (the default).")
    args = parser.parse_args()
    for path, content in extract().items():
        target = ROOT / path
        if args.check:
            if not target.exists() or target.read_bytes() != content:
                raise SystemExit(f"Country geography is out of date: {path}")
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
    print("Verified final country geography: 197 countries." if args.check else "Prepared final country geography: 197 countries.")
