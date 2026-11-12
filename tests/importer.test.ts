import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  coordinatePair,
  countryCode,
  importCities,
  parseMapLink,
  readCSV,
  slug,
  validDate,
} from "../scripts/importer.js";
import { formatVisitDate } from "../src/lib/types.js";
const header =
  "Cities,Country,Continent,Region,SubRegion,Status,Link,Latitude,Longitude,CountryCode,Visited,LastVisited,PinColor,Notes";
const csv = (rows: string[]) => [header, ...rows].join("\n");
const row = (name = "Test", status = "Complete") =>
  `${name},Poland,Europe,Central Europe,,${status},,0,0,PL,,,,`;
test("demo imports five cities and every exact map status, without diagnostics", () => {
  const { data, issues } = importCities(
    readFileSync("fixtures/cities.demo.csv", "utf8"),
    {
      demo: true,
      countryVisits: readFileSync("fixtures/country-visits.demo.csv", "utf8"),
    },
  );
  assert.equal(data.cities.length, 5);
  assert.equal(issues.length, 0);
  assert.equal(data.demo, true);
  assert.deepEqual([...new Set(data.cities.map((c) => c.status))].sort(), [
    "Complete",
    "Not Started",
    "Unfinished",
    "Update",
  ]);
  assert.equal(
    data.cities.find((c) => c.name === "Warsaw")?.pinColor,
    "#A37AD9",
  );
  assert.equal(data.countries.find((c) => c.code === "DE")?.visited, true);
  assert.equal(data.countries.find((c) => c.code === "FI")?.color, "#5B75AD");
});
test("CSV supports BOM, case, whitespace, City alias, CRLF, doubled quotes and multiline cells", () => {
  const input =
    '\uFEFF City , COUNTRY ,Continent,Region,SubRegion, Status , Link ,Notes\r\n"  São Paulo  ",Brazil,South America,South,, dOnE ,,"First, a walk.\r\nThen a \"\"coffee\"\"."\r\n\r\n';
  const city = importCities(input).data.cities[0];
  assert.equal(city.name, "São Paulo");
  assert.equal(city.status, "Complete");
  assert.equal(city.countryCode, "BR");
  assert.equal(city.notes, 'First, a walk.\r\nThen a "coffee".');
});
test("missing required headers and unknown statuses include actionable diagnostics", () => {
  assert.throws(
    () => importCities("City,Country\nX,Poland"),
    /Missing required CSV headers: Continent/,
  );
  assert.throws(
    () => importCities(csv([row("Test", "Pending")])),
    /Row 2.*Supported: Complete, Update, Unfinished, Not Started/,
  );
  assert.throws(
    () => importCities(csv([row("Test", "")])),
    /Row 2.*missing Status/,
  );
});
test("URL and inert iframe produce canonical safe URLs, preserving embed settings", () => {
  const link = parseMapLink(
    '<iframe src="https://www.google.com/maps/d/u/0/embed?mid=abc_123-x&amp;ll=50,30&amp;z=5&amp;ehbc=2E312F&amp;noprof=1" onload="malicious()"></iframe>',
  );
  assert.ok(link);
  assert.equal(
    link.viewerUrl,
    "https://www.google.com/maps/d/viewer?mid=abc_123-x",
  );
  assert.equal(new URL(link.embedUrl).searchParams.get("ll"), "50,30");
  assert.ok(!link.embedUrl.includes("onload"));
  assert.equal(
    parseMapLink("https://google.com/maps/d/viewer?mid=abc")?.viewerUrl,
    "https://www.google.com/maps/d/viewer?mid=abc",
  );
});
test("reject deceptive hosts, arbitrary URLs, credentials, duplicate src and invalid IDs", () => {
  for (const link of [
    "https://www.google.com.evil.com/maps/d/embed?mid=abc",
    "https://evil.com/?mid=abc",
    "http://www.google.com/maps/d/embed?mid=abc",
    "https://www.google.com/maps/place/abc?mid=abc",
    "https://user:pass@www.google.com/maps/d/embed?mid=abc",
    "https://www.google.com/maps/d/embed?mid=",
    "https://www.google.com/maps/d/embed?mid=abc%2Fdef",
    "https://www.google.com/maps/d/embed?mid=a&mid=b",
    '<iframe src="https://www.google.com/maps/d/embed?mid=a" src="https://evil.com"></iframe>',
    "<script>alert(1)</script>",
  ])
    assert.throws(() => parseMapLink(link), Error, link);
});
test("invalid links preserve the city; empty link is allowed in every map status", () => {
  const { data, issues } = importCities(
    csv([
      "Test,Poland,Europe,Central Europe,,Update,https://evil.com,0,0,PL,,,,",
    ]),
  );
  assert.equal(data.cities.length, 1);
  assert.equal(data.cities[0].map, null);
  assert.match(issues[0].message, /HTTPS Google/);
  for (const status of ["Complete", "Update", "Unfinished", "Not Started"])
    assert.equal(
      importCities(csv([row("Test", status)])).data.cities[0].map,
      null,
    );
});
test("IDs are deterministic across reordering, accents and non-Latin names", () => {
  assert.equal(slug("São Paulo", "Brazil"), "sao-paulo-brazil");
  assert.equal(slug("東京", "日本"), "東京-日本");
  const first = importCities(csv([row("Lublin"), row("Warsaw")])).data.cities;
  const second = importCities(csv([row("Warsaw"), row("Lublin")])).data.cities;
  assert.equal(first[0].id, second[1].id);
  assert.throws(
    () => importCities(csv([row(), row()])),
    /duplicate city ID.*CityId/,
  );
  assert.equal(
    importCities(
      csv([
        row("London"),
        row("London").replace("Poland", "Canada").replace(",PL,", ",CA,"),
      ]),
    ).data.cities.length,
    2,
  );
});
test("explicit CityId disambiguates duplicate names", () => {
  const input = header + ",CityId\n" + row() + ",one\n" + row() + ",two";
  assert.deepEqual(
    importCities(input).data.cities.map((c) => c.id),
    ["one", "two"],
  );
});
test("coordinates accept valid zeros and keep unresolved cities in catalog", () => {
  assert.deepEqual(coordinatePair("0", "0"), [0, 0]);
  assert.deepEqual(coordinatePair("50", "30"), [30, 50]);
  assert.equal(coordinatePair("91", "0"), null);
  assert.equal(coordinatePair("", "10"), null);
  const { data, issues } = importCities(csv([row().replace(",0,0,", ",,,")]));
  assert.equal(data.cities[0].coordinates, null);
  assert.match(issues[0].message, /Missing location.*Test, Poland/);
});
test("coordinate sidecar fills missing locations but never replaces an explicit pair or uses map ll", () => {
  const withMissing = row().replace(",0,0,", ",,,");
  assert.deepEqual(
    importCities(csv([withMissing]), {
      coordinates: "CityId,Latitude,Longitude\ntest-poland,50,30",
    }).data.cities[0].coordinates,
    [30, 50],
  );
  assert.deepEqual(
    importCities(csv([row()]), {
      coordinates: "CityId,Latitude,Longitude\ntest-poland,50,30",
    }).data.cities[0].coordinates,
    [0, 0],
  );
  const input = withMissing.replace(
    "Complete,",
    "Complete,https://www.google.com/maps/d/embed?mid=abc&ll=50%2C30",
  );
  assert.equal(importCities(csv([input])).data.cities[0].coordinates, null);
});
test("all date precisions validate without timezone shifts, including leap years", () => {
  for (const date of ["2024", "2024-02", "2024-02-29"])
    assert.equal(validDate(date), true);
  for (const date of [
    "2025-02-29",
    "2024-13",
    "2024-00",
    "2024-04-31",
    "yesterday",
    "2024-1-01",
  ])
    assert.equal(validDate(date), false);
  assert.equal(formatVisitDate("2025"), "2025");
  assert.equal(formatVisitDate("2025-06"), "June 2025");
  assert.equal(formatVisitDate("2025-06-18"), "18 June 2025");
});
test("visit is independent of map status; contradictory date and No produce unknown", () => {
  const input = csv([
    "A,Poland,Europe,,,Complete,,0,0,PL,,2025,,",
    "B,Poland,Europe,,,Not Started,,1,1,PL,No,2025-06,,",
    "C,Poland,Europe,,,Update,,2,2,PL,No,,,",
    "D,Poland,Europe,,,Unfinished,,3,3,PL,Yes,,,",
  ]);
  const { data, issues } = importCities(input);
  assert.deepEqual(
    data.cities.map((c) => c.visit),
    ["visited", "unknown", "not-visited", "visited"],
  );
  assert.equal(data.cities[1].lastVisited, null);
  assert.match(issues[0].message, /conflicts/);
  assert.equal(data.countries[0].visited, true);
});
test("country-only records, city visits and custom colors work independently", () => {
  const { data } = importCities(csv([row()]), {
    countryVisits:
      "CountryCode,Visited,FillColor\nDE,Yes,#488F87\nPL,,#123456\nFI,No,#5B75AD",
  });
  assert.equal(data.countries.find((c) => c.code === "DE")?.visited, true);
  assert.equal(data.countries.find((c) => c.code === "PL")?.visited, false);
  assert.equal(data.countries.find((c) => c.code === "PL")?.color, "#123456");
  assert.equal(data.countries.find((c) => c.code === "FI")?.color, "#5B75AD");
  assert.equal(
    importCities(csv([row()]), {
      countryVisits: "CountryCode\nDE",
    }).data.countries.find((c) => c.code === "DE")?.visited,
    true,
  );
  assert.throws(
    () =>
      importCities(csv([row()]), {
        countryVisits: "CountryCode,Visited\nPL,Yes\nPL,No",
      }),
    /duplicate CountryCode PL/,
  );
});
test("invalid colors warn with row numbers and fall back; notes remain inert text", () => {
  const { data, issues } = importCities(
    csv([
      "Test,Poland,Europe,,,Complete,,0,0,PL,Yes,,red,<img src=x onerror=alert(1)>",
    ]),
    { countryVisits: "CountryCode,FillColor\nPL,bad" },
  );
  assert.equal(data.cities[0].pinColor, null);
  assert.equal(data.countries[0].color, null);
  assert.equal(data.cities[0].notes, "<img src=x onerror=alert(1)>");
  assert.equal(issues.length, 2);
  assert.equal(issues[0].line, 2);
});
test("country aliases preserve display names, explicit codes are validated", () => {
  assert.equal(countryCode("Russia"), "RU");
  assert.equal(countryCode("Czech Republic"), "CZ");
  assert.equal(countryCode("Türkiye"), "TR");
  assert.equal(countryCode("custom name", "fr"), "FR");
  assert.equal(countryCode("Unknown"), null);
  assert.equal(countryCode("France", "ZZ"), null);
});
