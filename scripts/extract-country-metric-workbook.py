"""Base extraction for npm run country:prepare-reference; GDP-per-capita preparation follows."""

import csv
import hashlib
import json
import math
import unicodedata
from collections import Counter
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "data/sources/country-reference/ciudad_mundo_three_indices_global_continental_medians.xlsx"


def key(value):
    return "".join(
        c for c in unicodedata.normalize("NFKD", value.lower().replace("&", "and"))
        if c.isalnum()
    )


with (ROOT / "data/countries.csv").open(encoding="utf-8-sig", newline="") as handle:
    countries = list(csv.DictReader(handle))
with (ROOT / "data/reference/country-geography.csv").open(encoding="utf-8", newline="") as handle:
    geography = list(csv.DictReader(handle))
names = {key(row["Country"]): row["CountryCode"] for row in geography}
names.update({key(name): code for name, code in {
    "DR Congo": "CD", "Republic of the Congo": "CG", "Côte d'Ivoire": "CI",
    "Moldova, Republic of": "MD", "Syrian Arab Republic": "SY",
    "Hong Kong": "HK", "Puerto Rico": "PR", "Macao": "MO", "Réunion": "RE",
    "Guadeloupe": "GP", "Martinique": "MQ", "Bermuda": "BM", "Jersey": "JE",
    "New Caledonia": "NC", "Cayman Islands": "KY", "Isle of Man": "IM",
    "Guam": "GU", "French Polynesia": "PF", "French Guiana": "GF", "Aruba": "AW",
    "Virgin Islands, U.S.": "VI", "Guernsey": "GG", "Gibraltar": "GI",
    "Faroe Islands": "FO", "Mayotte": "YT", "Curaçao": "CW", "Greenland": "GL",
    "Sint Maarten (Dutch part)": "SX", "Åland Islands": "AX",
    "Turks and Caicos Islands": "TC", "Virgin Islands, British": "VG",
    "Northern Mariana Islands": "MP", "Saint Barthélemy": "BL",
    "Bonaire, Sint Eustatius and Saba": "BQ", "American Samoa": "AS",
    "Saint Martin (French part)": "MF", "Anguilla": "AI", "Cook Islands": "CK",
    "Falkland Islands (Malvinas)": "FK", "Saint Pierre and Miquelon": "PM",
    "Norfolk Island": "NF", "Montserrat": "MS",
    "Saint Helena, Ascension and Tristan da Cunha": "SH", "Niue": "NU",
    "Antarctica": "AQ", "Bouvet Island": "BV", "British Indian Ocean Territory": "IO",
    "Christmas Island": "CX", "Cocos (Keeling) Islands": "CC",
    "French Southern Territories": "TF", "Heard Island and McDonald Islands": "HM",
    "Pitcairn": "PN", "South Georgia and the South Sandwich Islands": "GS",
    "Svalbard and Jan Mayen": "SJ", "Tokelau": "TK",
    "United States Minor Outlying Islands": "UM", "Wallis and Futuna": "WF",
    "Western Sahara": "EH",
}.items()})


def number(value):
    if value == "N/A":
        return ""
    if not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise ValueError(f"Expected a cached nonnegative number or N/A, got {value!r}")
    return value


def write_csv(path, header, rows):
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(header)
        writer.writerows(rows)


workbook = load_workbook(WORKBOOK, data_only=True)
raw_rows = list(workbook["Raw Data"].values)[1:]
score_rows = {row[0]: row[1:] for row in list(workbook["Index Scores"].values)[1:]}
output = []
for row in raw_rows:
    name, category, continent, gdp, _, population, _, area, _, gdp_index, population_index, area_index = row
    if tuple([gdp_index, population_index, area_index, category]) != tuple(score_rows[name]):
        raise ValueError(f"The workbook's score sheets disagree for {name}")
    code = names.get(key(name))
    if not code:
        raise ValueError(f"Unmatched workbook entity: {name}")
    output.append([code, name, category, continent, number(population), number(population_index), number(area), number(area_index), number(gdp), number(gdp_index)])

assert len(output) == len({row[0] for row in output}) == 250
assert Counter(row[2] for row in output) == {"195": 195, "197": 2, "Territory": 53}
assert {row[0] for row in output if row[2] != "Territory"} == {row["CountryCode"] for row in countries}
write_csv(ROOT / "data/country-metrics.csv", ["CountryCode", "Country", "Category", "Continent", "Population", "PopulationIndex", "TotalAreaKm2", "AreaIndex", "GdpUsdBillions", "GdpIndex"], output)

median_rows = list(workbook["Medians 197"].values)[5:12]
assert {row[0] for row in median_rows} == {"Global", "Africa", "Asia", "Europe", "North America", "South America", "Oceania"}
write_csv(ROOT / "data/country-metric-medians.csv", ["Region", "Countries", "GdpUsdBillions", "GdpIndex", "Population", "PopulationIndex", "TotalAreaKm2", "AreaIndex"], median_rows)

meta_path = ROOT / "data/sources/country-reference.json"
metadata = json.loads(meta_path.read_text())
metadata["metrics"] = "Original raw figures and precomputed indices copied from the owner's Raw Data sheet, verified against Index Scores. GDP is expressed in USD billions. Missing values remain empty; numeric zero remains zero. The GDP-per-capita preparation step follows this base extraction."
metadata["comparisons"] = "World and continental raw/index medians are copied from Medians 197, not calculated. The workbook uses UN M49 continents (Turkey and Cyprus in Asia). These statistical comparison groups do not change existing travel categories."
metadata["profileExclusions"] = {"SJ": "Owner requested Svalbard remain untouched. The workbook row combines Svalbard and Jan Mayen, so its figures are retained only in the source CSV, not applied to the Svalbard profile."}
metadata["workbook"] = {"path": str(WORKBOOK.relative_to(ROOT)), "sha256": hashlib.sha256(WORKBOOK.read_bytes()).hexdigest(), "sheets": ["Raw Data", "Index Scores", "Medians 197"], "countries": 197, "territories": 53}
metadata["methodReference"] = {"path": "docs/COUNTRY_METRIC_INDEX.md", "sha256": hashlib.sha256((ROOT / "docs/COUNTRY_METRIC_INDEX.md").read_bytes()).hexdigest(), "status": "The original three metrics use cached workbook values. The following offline GDP-per-capita preparation step applies model V1 as requested by the owner; no formula runs in the application."}
metadata["missingGdp"] = [row[0] for row in output if row[2] != "Territory" and row[8] == ""]
metadata["sources"].pop("world-bank-population", None)
metadata["sources"].pop("world-bank-gdp", None)
metadata["csvSha256"] = {path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest() for path in ["data/country-metrics.csv", "data/country-metric-medians.csv", "data/country-highlights.csv", "data/country-comparison-regions.csv"]}
meta_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
print("Copied 250 entity rows and 7 median rows; both workbook score sheets agree. Svalbard profile remains excluded.")
