import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { AtlasData } from "../../src/lib/types";
import { VISIT_YEAR_COLORS } from "../../src/lib/palette";
import {
  chooseFilter,
  mapFilterButton,
  setMapFilter,
} from "./collection-filters";
import {
  MAP_STATUS_STORAGE_KEY,
  COLLECTION_STATUS_STORAGE_KEY,
} from "../../src/lib/status-storage";

const data = JSON.parse(
  readFileSync("src/generated/atlas.json", "utf8"),
) as AtlasData;
const entries = [...data.cities, ...(data.places ?? [])];
const mapCount = (status: string) =>
  entries.filter((entry) => entry.status === status).length;
const backName = `All cities (${data.cities.length})`;

test("city overview, compact visit rows, map progress filters and city details use the same history", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      return type.includes("webgl")
        ? null
        : get.apply(this, [type, ...args] as never);
    } as typeof get;
  });
  await page.goto("/");
  await expect(page.locator(".city-overview-totals dd")).toHaveText([
    "174",
    "222",
    "401",
  ]);
  await expect(page.locator(".city-map-progress-heading")).toContainText(
    `${mapCount("Complete")} / ${entries.length} complete`,
  );
  const filters = page.getByRole("group", { name: "Map progress filters" });
  await filters
    .getByRole("button", {
      name: `Update ${mapCount("Unfinished")}`,
      exact: true,
    })
    .click();
  await expect(mapFilterButton(page, "Unfinished")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".city-row")).toHaveCount(mapCount("Unfinished"));
  await page.getByLabel("Search cities and countries").fill("Shanghai");
  await expect(page.locator(".city-overview-totals dd")).toHaveText([
    "1",
    "1",
    "2.5",
  ]);
  const row = page.locator(".city-row");
  await expect(row.locator(".city-count-badge")).toContainText("1");
  await expect(row.locator(".city-row-duration")).toHaveText("2.5 days");
  await expect(row.locator(".city-last-visit")).toContainText("26 Sep");
  await expect(row.locator(".status")).toHaveText("Update");
  expect((await row.boundingBox())!.height).toBeLessThanOrEqual(73);
  await row.click();
  await expect(page.locator(".city-statistics dd")).toHaveText(["1", "2.5"]);
  await expect(page.locator(".city-visit-list")).toContainText(
    "30 – 31 August 2026",
  );
  await expect(page.locator(".visit-period-duration")).toHaveText(["1.5*"]);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(page.locator(".city-overview-totals dd")).toHaveText([
      "174",
      "222",
      "401",
    ]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("scoreboard toggles compose with filters and sort visits and half-days with alphabetical ties", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      return type.includes("webgl")
        ? null
        : get.apply(this, [type, ...args] as never);
    } as typeof get;
  });
  await page.goto("/");
  const scores = page.locator(".city-overview-totals");
  const visited = scores.getByRole("button", { name: /^Cities visited / });
  const visits = scores.getByRole("button", { name: /^Visits / });
  const days = scores.getByRole("button", { name: /^Days spent / });
  const names = page.locator(".city-row-name");
  const filters = page.getByRole("group", { name: "Map progress filters" });
  await expect(scores.getByRole("button", { pressed: false })).toHaveCount(3);
  await expect(filters.locator("button > span")).toHaveText([
    "Complete",
    "Usable",
    "Update",
    "Not Started",
  ]);
  await expect(page.locator(".city-map-progress-bar")).toHaveAttribute(
    "aria-label",
    `${mapCount("Complete")} Complete, ${mapCount("Update")} Usable, ${mapCount("Unfinished")} Update, ${mapCount("Not Started")} Not Started`,
  );
  await expect(
    page.locator(".city-map-progress-bar .status-complete"),
  ).toHaveCSS("background-color", "rgb(8, 127, 70)");
  for (const button of await filters.getByRole("button").all()) {
    expect(
      await button.locator("span").evaluate((el) => getComputedStyle(el).color),
    ).toBe(
      await button
        .locator("strong")
        .evaluate((el) => getComputedStyle(el).color),
    );
  }
  const alphabetical = entries
    .map((city) => city.name)
    .sort((a, b) => a.localeCompare(b));
  await expect(names).toHaveText(alphabetical);
  // Clicking the quiet label area activates the whole scoreboard cell.
  await scores
    .locator(":scope > div")
    .first()
    .click({
      position: { x: 16, y: 27 },
    });
  await expect(visited).toHaveAttribute("aria-pressed", "true");
  await expect(names).toHaveCount(174);
  await expect(page.locator(".city-row .visit-marker-not-yet")).toHaveCount(0);
  await expect(page.locator(".city-map-progress-heading")).toContainText(
    "/ 174 complete",
  );
  await visits.click();
  await expect(visits).toHaveAttribute("aria-pressed", "true");
  await expect(names.nth(0)).toHaveText("New York City");
  await expect(names.nth(1)).toHaveText("London");
  await expect(names.nth(2)).toHaveText("Los Angeles");
  await expect(names.nth(3)).toHaveText("Singapore");
  await days.click();
  await expect(days).toHaveAttribute("aria-pressed", "true");
  await expect(visits).toHaveAttribute("aria-pressed", "false");
  await expect(names.nth(0)).toHaveText("New York City");
  await expect(names.nth(1)).toHaveText("Vancouver");
  await expect(names.nth(2)).toHaveText("Chicago");
  await expect(names.nth(4)).toHaveText("Los Angeles");
  await expect(names.nth(5)).toHaveText("Istanbul");
  await expect(names.nth(6)).toHaveText("Singapore");
  await expect(names.nth(7)).toHaveText("Sydney");
  await days.click();
  await expect(days).toHaveAttribute("aria-pressed", "false");
  await expect(names).toHaveText(
    data.cities
      .filter((city) => city.visit === "visited")
      .map((city) => city.name)
      .sort((a, b) => a.localeCompare(b)),
  );
  await visits.click();
  await visits.click();
  await expect(visits).toHaveAttribute("aria-pressed", "false");
  await filters.getByRole("button", { name: /^Update / }).click();
  await expect(mapFilterButton(page, "Unfinished")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const visitedUpdates = data.cities.filter(
    (city) => city.visit === "visited" && city.status === "Unfinished",
  );
  await expect(names).toHaveCount(visitedUpdates.length);
  await filters.getByRole("button", { name: /^Update / }).click();
  await expect(names).toHaveCount(174);
  await page.getByLabel("Search cities and countries").fill("Shanghai");
  await expect(scores.locator(".scoreboard-stat-value")).toHaveText([
    "1",
    "1",
    "2.5",
  ]);
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await visited.focus();
  await page.keyboard.press("Space");
  await expect(visited).toHaveAttribute("aria-pressed", "false");
  await expect(names).toHaveText(alphabetical);
  await filters.getByRole("button", { name: /^Usable / }).click();
  await expect(mapFilterButton(page, "Update")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(names).toHaveCount(mapCount("Update"));
  await filters.getByRole("button", { name: /^Usable / }).click();
  await expect(names).toHaveText(alphabetical);
  for (const width of [320, 650, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(scores).toHaveCSS("height", "49px");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await visits.click();
    await expect(names.first()).toHaveText("New York City");
    await visits.click();
    await expect(names.first()).toHaveText(alphabetical[0]);
  }
});

test("compact year and continent menus filter latest visits, retain year colors and support keyboard controls", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      return type.includes("webgl")
        ? null
        : get.apply(this, [type, ...args] as never);
    } as typeof get;
  });
  await page.goto("/");
  const year = page.getByRole("combobox", {
    name: "Filter by last visited year",
    exact: true,
  });
  const continent = page.getByRole("combobox", {
    name: "Filter by continent",
    exact: true,
  });
  await expect(page.locator(".city-filter-row [role=combobox]")).toHaveCount(2);
  await expect(page.locator(".city-map-progress")).toHaveCSS(
    "margin-top",
    "9px",
  );
  await expect(page.locator(".collection-navigation")).toHaveCSS(
    "padding",
    "12px 16px 11px",
  );
  await expect(page.locator(".city-overview")).toHaveCSS(
    "margin-bottom",
    "8px",
  );
  const row = page.locator(".city-row").first();
  await expect(row.locator(".city-last-visit")).toContainText("26 Aug");
  const date = (await row.locator(".city-last-visit").boundingBox())!;
  const badge = (await row.locator(".city-count-badge").boundingBox())!;
  const duration = (await row.locator(".city-row-duration").boundingBox())!;
  expect(badge.y - date.y - date.height).toBe(3);
  expect(duration.y - badge.y - badge.height).toBe(4);
  expect((await row.boundingBox())!.height).toBe(72);
  expect(badge.width).toBe(badge.height);
  expect(badge.width).toBe(34);
  await expect(row.locator(".city-row-metrics .city-row-duration")).toHaveCount(
    0,
  );
  await year.click();
  const years = ["2026", "2025", "2024", "2023 or before"];
  await expect(page.getByRole("option")).toHaveText(["All years", ...years]);
  for (const value of years) {
    const color = VISIT_YEAR_COLORS[value.slice(0, 4)];
    const rgb = color
      .slice(1)
      .match(/../g)!
      .map((part) => parseInt(part, 16));
    await expect(
      page
        .getByRole("option", { name: value, exact: true })
        .locator(".collection-filter-option-label"),
    ).toHaveCSS("color", `rgb(${rgb.join(", ")})`);
  }
  await page
    .getByRole("option", { name: "2023 or before", exact: true })
    .click();
  await expect(page.locator(".city-row")).toHaveCount(
    data.cities.filter(
      (city) =>
        city.lastVisited && Number(city.lastVisited.slice(0, 4)) <= 2023,
    ).length,
  );
  await chooseFilter(page, "Filter by last visited year", "2025");
  const in2025 = data.cities.filter((city) =>
    city.lastVisited?.startsWith("2025"),
  );
  await expect(page.locator(".city-row")).toHaveCount(in2025.length);
  await expect(
    page.locator(".city-row-name").filter({ hasText: "New York City" }),
  ).toHaveCount(0);
  await chooseFilter(page, "Filter by continent", "Europe");
  await expect(page.locator(".city-row")).toHaveCount(
    in2025.filter((city) => city.continent === "Europe").length,
  );
  await page
    .locator(".city-overview-totals")
    .getByRole("button", { name: /^Cities visited / })
    .click();
  await setMapFilter(page, "Complete");
  await expect(page.locator(".city-row")).toHaveCount(
    in2025.filter(
      (city) => city.continent === "Europe" && city.status === "Complete",
    ).length,
  );
  await page.getByLabel("Search cities and countries").fill("not-a-place");
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(page.locator(".city-row")).toHaveCount(entries.length);
  await expect(year).toContainText("Year last visited");
  await expect(continent).toContainText("Continent");
  await year.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(year).toContainText("2026");
  await expect(year).toBeFocused();
  await year.click();
  await page.keyboard.press("Escape");
  await expect(year).toHaveAttribute("aria-expanded", "false");
  await expect(year).toBeFocused();
  await year.click();
  await continent.click();
  await expect(page.getByRole("listbox")).toHaveCount(1);
  await expect(year).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.type("e");
  await page.keyboard.press("Enter");
  await expect(continent).toContainText("Europe");
  await year.click();
  await page.getByLabel("Search cities and countries").click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  for (const width of [320, 650, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await year.click();
    const menu = (await page.getByRole("listbox").boundingBox())!;
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(width);
    expect(menu.y + menu.height).toBeLessThanOrEqual(900);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    const filterRow = (await page.locator(".city-filter-row").boundingBox())!;
    expect(filterRow.height).toBe(24);
  }
});

test("country collection mirrors the compact scoreboard, filters and visit rows with a custom country-set menu", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      return type.includes("webgl")
        ? null
        : original.apply(this, [type, ...args] as never);
    } as typeof original;
  });
  await page.goto("/?panel=countries");
  const scores = page.locator(".country-overview");
  const visited = scores.getByRole("button", { name: /^Countries visited / });
  const visits = scores.getByRole("button", { name: /^Visits / });
  const days = scores.getByRole("button", { name: /^Days spent / });
  const alphabetical = scores.getByRole("button", {
    name: "Sort countries alphabetically",
    exact: true,
  });
  const firstVisits = [
    "China",
    "United States",
    "Canada",
    "United Kingdom",
    "Switzerland",
    "Netherlands",
  ];
  await expect(scores.locator(".scoreboard-stat-value")).toHaveText([
    "97",
    "125",
    "313.5",
  ]);
  await expect(scores.locator("dl")).toHaveCSS("height", "49px");
  await expect(page.locator(".city-map-progress")).toHaveCount(0);
  const names = page.locator(".country-row .city-row-name");
  await expect(names).toHaveCount(198);
  await expect(alphabetical).toHaveAttribute("aria-pressed", "false");
  for (const [index, name] of firstVisits.entries())
    await expect(names.nth(index)).toHaveText(name);
  const albania = page
    .locator(".country-row")
    .filter({ has: page.locator(".city-row-name", { hasText: /^Albania$/ }) });
  await expect(albania.locator(".country-last-visit")).toContainText("26 Jun");
  await expect(albania.locator(".country-row-duration")).toHaveText("1 day");
  const date = (await albania.locator(".country-last-visit").boundingBox())!;
  const badge = (await albania.locator(".country-count-badge").boundingBox())!;
  const duration = (await albania
    .locator(".country-row-duration")
    .boundingBox())!;
  expect(badge.y - date.y - date.height).toBe(3);
  expect(duration.y - badge.y - badge.height).toBe(4);
  expect((await albania.boundingBox())!.height).toBe(72);
  expect(badge.width).toBe(34);
  expect(badge.height).toBe(34);
  await expect(albania.locator(".country-city-count strong")).toHaveText("1");
  await visited.click();
  await expect(names).toHaveCount(97);
  await expect(names.filter({ hasText: /^Kosovo$/ })).toHaveCount(0);
  await chooseFilter(page, "Country scoreboard scope", "197 (🇽🇰🇹🇼)");
  await expect(names).toHaveCount(98);
  await expect(names.filter({ hasText: /^Kosovo$/ })).toHaveCount(1);
  await chooseFilter(page, "Country scoreboard scope", "195");
  await expect(names).toHaveCount(97);
  for (const [index, name] of firstVisits.entries())
    await expect(names.nth(index)).toHaveText(name);
  await alphabetical.click();
  await expect(alphabetical).toHaveAttribute("aria-pressed", "true");
  await expect(visited).toHaveAttribute("aria-pressed", "true");
  await expect(names).toHaveCount(97);
  await expect(names.first()).toHaveText("Albania");
  await alphabetical.focus();
  await page.keyboard.press("Space");
  await expect(alphabetical).toHaveAttribute("aria-pressed", "false");
  await expect(names.first()).toHaveText("China");
  await alphabetical.click();
  await visited.click();
  await expect(names).toHaveCount(198);
  await expect(names.filter({ hasText: /^Kosovo$/ })).toHaveCount(1);
  await expect(names.filter({ hasText: /^Svalbard$/ })).toHaveCount(1);
  await expect(alphabetical).toHaveAttribute("aria-pressed", "true");
  await expect(names.first()).toHaveText("Afghanistan");
  await visited.click();
  await expect(names).toHaveCount(97);
  await expect(alphabetical).toHaveAttribute("aria-pressed", "true");
  await expect(names.first()).toHaveText("Albania");
  await alphabetical.click();
  await expect(alphabetical).toHaveAttribute("aria-pressed", "false");
  await expect(names.first()).toHaveText("China");
  await visits.click();
  await expect(names.nth(0)).toHaveText("Canada");
  await expect(names.nth(1)).toHaveText("China");
  await days.click();
  await expect(visits).toHaveAttribute("aria-pressed", "false");
  await expect(names.nth(0)).toHaveText("Canada");
  await expect(names.nth(1)).toHaveText("Australia");
  await days.click();
  await expect(names.first()).toHaveText("China");
  await visited.click();
  await expect(names).toHaveCount(198);
  await chooseFilter(page, "Filter by last visited year", "2025");
  await expect(names.filter({ hasText: /^Austria$/ })).toHaveCount(1);
  await expect(names.filter({ hasText: /^Australia$/ })).toHaveCount(0);
  await chooseFilter(page, "Filter by continent", "Europe");
  await expect(page.locator(".country-row .city-row-country")).toContainText(
    Array(await names.count()).fill("Europe"),
  );
  await chooseFilter(page, "Filter by last visited year", "2024");
  await chooseFilter(page, "Filter by continent", "Oceania");
  await expect(names).toHaveCount(0);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(names).toHaveCount(198);
  await page
    .getByRole("combobox", { name: "Country scoreboard scope", exact: true })
    .click();
  await expect(page.getByRole("option")).toHaveText(["195", "197 (🇽🇰🇹🇼)"]);
  await page.getByRole("option", { name: "197 (🇽🇰🇹🇼)", exact: true }).click();
  await expect(names).toHaveCount(198);
  await expect(page).toHaveURL(/countrySet=197/);
  await expect(scores.locator(".scoreboard-stat-value")).toHaveText([
    "98",
    "126",
    "314.5",
  ]);
  await page.reload();
  await expect(names).toHaveCount(198);
  await chooseFilter(page, "Country scoreboard scope", "195");
  await expect(names).toHaveCount(198);
  const usa = page
    .locator(".country-row")
    .filter({ has: page.getByText("United States", { exact: true }) });
  await expect(usa.locator(".country-row-duration")).toHaveCount(0);
  await expect(
    page.getByLabel("Search countries", { exact: true }),
  ).toHaveCount(0);
  await expect(
    scores.getByRole("combobox", { name: "Country scoreboard scope" }),
  ).toBeVisible();
  for (const width of [320, 650, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator(".country-filter-row")).toHaveCSS(
      "height",
      "24px",
    );
    const labels = await page
      .locator(".country-filter-row .collection-filter-value")
      .evaluateAll((els) =>
        els.map((el) => ({ client: el.clientWidth, scroll: el.scrollWidth })),
      );
    expect(labels.every((el) => el.scroll <= el.client)).toBe(true);
    const scoreLabels = await scores.locator("dt").evaluateAll((els) =>
      els.map((el) => ({
        label: el.getBoundingClientRect(),
        cell: el.parentElement!.getBoundingClientRect(),
      })),
    );
    expect(
      scoreLabels.every(
        (x) => x.label.left >= x.cell.left && x.label.right <= x.cell.right,
      ),
    ).toBe(true);
  }
});

test("country row visit-order badges align beside city counts and leave room for wrapped names", async ({
  page,
}) => {
  await withoutGlobe(page);
  await page.goto("/?panel=countries");
  const rows = page.locator(".country-row");
  const countryRow = (name: string) =>
    rows.filter({
      has: page.locator(".city-row-name", { hasText: new RegExp(`^${name}$`) }),
    });
  await expect(rows).toHaveCount(198);
  await expect(rows.locator(".country-order-badge")).toHaveCount(98);
  await expect(countryRow("Kosovo").getByRole("note")).toHaveAttribute(
    "aria-label",
    "Visit order 74*",
  );
  await expect(countryRow("Tajikistan").getByRole("note")).toHaveAttribute(
    "aria-label",
    "Visit order 74",
  );
  await expect(countryRow("Uzbekistan").getByRole("note")).toHaveAttribute(
    "aria-label",
    "Visit order 75",
  );
  const names = await rows.locator(".city-row-name").allTextContents();
  expect(names.indexOf("Kosovo")).toBeLessThan(names.indexOf("Tajikistan"));
  await expect(rows.locator(".country-set-badge")).toHaveCount(2);
  for (const name of ["Kosovo", "Taiwan"])
    await expect(
      countryRow(name).getByRole("img", {
        name: "Included in the 197-country set",
      }),
    ).toBeVisible();
  for (const [index, name] of [
    "China",
    "United States",
    "Canada",
    "United Kingdom",
    "Switzerland",
    "Netherlands",
  ].entries()) {
    await expect(countryRow(name).getByRole("note")).toHaveAttribute(
      "aria-label",
      `Visit order ${index + 1}`,
    );
  }
  for (const name of ["Afghanistan", "Taiwan", "Svalbard"])
    await expect(countryRow(name).locator(".country-order-badge")).toHaveCount(
      0,
    );
  await page.evaluate(() => document.fonts.ready);
  for (const width of [320, 390, 650, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const layout = await rows.evaluateAll((elements) =>
      elements.map((row) => {
        const box = (selector: string) =>
          row.querySelector(selector)!.getBoundingClientRect();
        const name = box(".city-row-name"),
          order = box(".country-row-order"),
          count = box(".country-city-count");
        const bounds = row.getBoundingClientRect();
        return {
          name: row.querySelector(".city-row-name")!.textContent,
          orderLeft: order.left,
          countLeft: count.left,
          fits:
            name.right <= order.left - 7 &&
            order.right <= count.left - 7 &&
            box(".city-row-body").bottom <= bounds.bottom - 2 &&
            row.scrollWidth <= row.clientWidth,
        };
      }),
    );
    expect(
      layout.filter((row) => !row.fits),
      `Country rows fit at ${width}px`,
    ).toEqual([]);
    expect(new Set(layout.map((row) => row.orderLeft)).size).toBe(1);
    expect(new Set(layout.map((row) => row.countLeft)).size).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 320)
      expect(
        (await countryRow("Bosnia & Herzegovina")
          .locator(".city-row-name")
          .boundingBox())!.height,
      ).toBeGreaterThan(20);
  }
  await page
    .getByRole("button", { name: "Sort countries alphabetically", exact: true })
    .click();
  await expect(rows.first().locator(".city-row-name")).toHaveText(
    "Afghanistan",
  );
  await expect(countryRow("Honduras").getByRole("note")).toHaveAttribute(
    "aria-label",
    "Visit order 97",
  );
  await chooseFilter(page, "Country scoreboard scope", "197 (🇽🇰🇹🇼)");
  await expect(countryRow("Kosovo").getByRole("note")).toHaveAttribute(
    "aria-label",
    "Visit order 74*",
  );
  await expect(countryRow("Tajikistan").getByRole("note")).toHaveAttribute(
    "aria-label",
    "Visit order 75",
  );
  await countryRow("Honduras").click();
  await expect(
    page.locator(".country-detail-heading .country-order-badge"),
  ).toHaveText("#98");
});

test("country badge shapes, compact menus and H styling keep controls aligned", async ({
  page,
}) => {
  await withoutGlobe(page);
  await page.goto("/?panel=countries");
  const hover = page.getByRole("button", {
    name: "Enable country hover",
    exact: true,
  });
  await expect(hover).toHaveAttribute("aria-pressed", "false");
  await expect(hover).toHaveCSS("left", "-18px");
  await expect(hover).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await hover.click();
  await hover.evaluate((element) => element.blur());
  await page.mouse.move(1, 1);
  await expect(hover).toHaveAttribute("aria-pressed", "true");
  await expect(hover).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await hover.click();
  await expect(page.locator(".country-order-badge .lucide-crown")).toHaveCount(
    0,
  );
  const count = page.locator(".country-city-count").first();
  const number = (await count.locator("strong").boundingBox())!;
  const word = (await count.locator("span").boundingBox())!;
  expect(number.y + number.height).toBeLessThanOrEqual(word.y);
  await expect(count.locator("svg path")).toHaveCount(1);
  const scope = page.getByRole("combobox", {
    name: "Country scoreboard scope",
    exact: true,
  });
  await scope.click();
  await expect(page.getByRole("option")).toHaveText(["195", "197 (🇽🇰🇹🇼)"]);
  const menu = page.getByRole("listbox");
  expect((await menu.boundingBox())!.width).toBeLessThan(125);
  await expect(page.getByRole("option").first()).toHaveCSS("height", "24px");
  await page.keyboard.press("Escape");
  await page
    .getByRole("combobox", { name: "Filter by last visited year", exact: true })
    .click();
  expect((await menu.boundingBox())!.width).toBeLessThan(150);
  await expect(page.getByRole("option").first()).toHaveCSS("height", "24px");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 320, height: 1000 });
  await scope.click();
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(8);
  expect(box.x + box.width).toBeLessThanOrEqual(312);
  await page.keyboard.press("Escape");
});

test("every tenth country uses the same crown in rows and profiles, following the displayed country scope", async ({
  page,
}) => {
  await withoutGlobe(page);
  await page.goto("/?panel=countries");
  const row = (name: string) =>
    page
      .locator(".country-row")
      .filter({ has: page.getByText(name, { exact: true }) });
  await expect(row("Portugal").locator(".country-order-crown")).toHaveCount(1);
  await expect(row("Spain").locator(".country-order-crown")).toHaveCount(0);
  await expect(row("Estonia").locator(".country-order-crown")).toHaveCount(0);
  await expect(row("Latvia").locator(".country-order-crown")).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
  const milestoneBadge = row("Portugal").locator(".country-order-badge");
  const ordinaryBadge = row("Spain").locator(".country-order-badge");
  const milestoneBounds = (await milestoneBadge.boundingBox())!;
  const ordinaryBounds = (await ordinaryBadge.boundingBox())!;
  expect(milestoneBounds.width).toBe(ordinaryBounds.width);
  expect(milestoneBounds.height).toBe(ordinaryBounds.height);
  const rowRing = (await milestoneBadge
    .locator(".country-order-medallion-inset")
    .boundingBox())!;
  const rowNumber = (await milestoneBadge
    .locator(".country-order-number")
    .boundingBox())!;
  expect(rowRing.width - rowNumber.width).toBeGreaterThanOrEqual(4);
  const crownPath = await row("Portugal")
    .locator(".country-order-crown path")
    .first()
    .getAttribute("d");
  await row("Portugal").click();
  await expect(
    page.locator(".country-detail-heading .country-order-badge--milestone"),
  ).toHaveText("#10");
  const profileBadge = page.locator(
    ".country-detail-heading .country-order-badge",
  );
  const profileBounds = (await profileBadge.boundingBox())!;
  expect(profileBounds.width).toBe(50);
  expect(profileBounds.height).toBe(56.25);
  const profileRing = (await profileBadge
    .locator(".country-order-medallion-inset")
    .boundingBox())!;
  const profileNumber = (await profileBadge
    .locator(".country-order-number")
    .boundingBox())!;
  expect(profileRing.width - profileNumber.width).toBeGreaterThanOrEqual(6);
  expect(
    await page
      .locator(".country-detail-heading .country-order-crown path")
      .first()
      .getAttribute("d"),
  ).toBe(crownPath);
  await page
    .getByRole("button", { name: "Back to countries", exact: true })
    .click();
  await chooseFilter(page, "Country scoreboard scope", "197 (🇽🇰🇹🇼)");
  await expect(row("Estonia").locator(".country-order-crown")).toHaveCount(1);
  await expect(row("Latvia").locator(".country-order-crown")).toHaveCount(0);
  await row("Estonia").click();
  await expect(
    page.locator(".country-detail-heading .country-order-badge--milestone"),
  ).toHaveText("#80");
});

test("phone country controls keep A and scoped visited filtering while omitting H", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 900 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    const page = await context.newPage();
    await withoutGlobe(page);
    await page.goto("http://127.0.0.1:4173/?panel=countries");
    const scores = page.locator(".country-overview");
    const visited = scores.getByRole("button", { name: /^Countries visited / });
    const alphabetical = scores.getByRole("button", {
      name: "Sort countries alphabetically",
      exact: true,
    });
    const names = page.locator(".country-row .city-row-name");
    await expect(
      page.getByRole("button", { name: "Enable country hover", exact: true }),
    ).toHaveCount(0);
    await expect(alphabetical).toHaveCSS("font-size", "10px");
    await expect(scores.locator("dl")).toHaveCSS("height", "49px");
    await expect(names).toHaveCount(198);
    await visited.tap();
    await expect(names).toHaveCount(97);
    await expect(names.filter({ hasText: /^Kosovo$/ })).toHaveCount(0);
    await alphabetical.tap();
    await expect(names.first()).toHaveText("Albania");
    await expect(visited).toHaveAttribute("aria-pressed", "true");
    await scores
      .getByRole("combobox", { name: "Country scoreboard scope", exact: true })
      .tap();
    await page.getByRole("option", { name: "197 (🇽🇰🇹🇼)", exact: true }).tap();
    await expect(names).toHaveCount(98);
    await expect(names.filter({ hasText: /^Kosovo$/ })).toHaveCount(1);
    await scores
      .getByRole("combobox", { name: "Country scoreboard scope", exact: true })
      .tap();
    await page.getByRole("option", { name: "195", exact: true }).tap();
    await expect(names).toHaveCount(97);
    await visited.tap();
    await expect(names).toHaveCount(198);
    await expect(names.filter({ hasText: /^Svalbard$/ })).toHaveCount(1);
    await expect(names.filter({ hasText: /^Kosovo$/ })).toHaveCount(1);
    await expect(alphabetical).toHaveAttribute("aria-pressed", "true");
    await expect(names.first()).toHaveText("Afghanistan");
    await visited.tap();
    await expect(names).toHaveCount(97);
    await expect(alphabetical).toHaveAttribute("aria-pressed", "true");
    await expect(names.first()).toHaveText("Albania");
    await visited.tap();
    await expect(names).toHaveCount(198);
    await alphabetical.tap();
    await expect(alphabetical).toHaveAttribute("aria-pressed", "false");
    await expect(names.first()).toHaveText("China");
    const a = (await alphabetical.boundingBox())!;
    const scope = (await scores
      .getByRole("combobox", { name: "Country scoreboard scope", exact: true })
      .boundingBox())!;
    expect(a.x >= scope.x + scope.width || a.y + a.height <= scope.y).toBe(
      true,
    );
    await openCountry(page, "Taiwan");
    await expect(
      page.getByRole("heading", { name: "Taiwan", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Back to countries", exact: true })
      .tap();
    await page.setViewportSize({ width: 390, height: 900 });
    await expect(
      page.getByRole("button", { name: "Enable country hover", exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await context.close();
  }
});

test("country and city duration exceptions are explicit while normal stays remain uncluttered", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      return type.includes("webgl")
        ? null
        : original.apply(this, [type, ...args] as never);
    } as typeof original;
  });
  for (const [code, count, days, text, marker] of [
    ["SG", "2", "7", "11 – 12 September 2026", "1*"],
    ["KR", "1", "6.5", "15 – 21 July 2025", "6.5*"],
    ["GB", "3", "13", "1 – 3 May 2026", "2.5*"],
    ["NZ", "1", "5.5", "5 – 8 August 2025", "3.5*"],
    ["CZ", "2", "4", "12 – 13 May 2024", "1*"],
  ]) {
    await page.goto(`/?panel=countries&country=${code}`);
    await expect(page.locator(".country-statistics dd")).toHaveText([
      count,
      days,
      String(
        data.cities.filter(
          (city) => city.countryCode === code && city.visit === "visited",
        ).length,
      ),
    ]);
    await expect(page.locator(".country-visit-list")).toContainText(text);
    await expect(
      page.locator(".visit-period-duration").filter({
        hasText: new RegExp(`^${marker.replace(/[.*]/g, "\\$&")}$`),
      }),
    ).toHaveCount(1);
    await expect(page.locator(".visit-total")).not.toContainText(["days"]);
    if (code === "GB") {
      await expect(page.locator(".visit-year-circle")).toHaveText([
        "2026",
        "2025",
        "2023",
      ]);
      await expect(page.locator(".visit-total strong")).toHaveText([
        "2.5",
        "1",
        "9.5",
      ]);
      await expect(
        page.locator(
          '.visit-timeline-year[data-year="2025"] .visit-year-circle',
        ),
      ).toHaveCSS("color", "rgb(223, 191, 0)");
      await expect(page.getByLabel("Actual stays for visit 1")).toContainText(
        "14 – 17 December 2023",
      );
    }
    if (code === "NZ")
      await expect(
        page
          .getByLabel("Actual stays for visit 1")
          .locator(".visit-period")
          .first(),
      ).not.toHaveAttribute("data-exception");
    if (code === "SG") {
      const stays = page
        .getByLabel("Actual stays for visit 2")
        .locator(".visit-period");
      await expect(stays).toHaveCount(4);
      await expect(stays.nth(2)).toContainText("3 September 2026");
      await expect(stays.nth(0)).not.toHaveAttribute("data-exception");
      const oneDay = stays.nth(3);
      await expect(oneDay.locator(".visit-period-point")).toHaveCount(1);
      await expect(oneDay.locator(".visit-period-point")).toHaveCSS(
        "background-color",
        "rgb(38, 120, 79)",
      );
      await expect(oneDay.locator(".visit-period-line")).toHaveCount(0);
      await expect(oneDay.locator(".visit-period-dates")).toHaveText("11–12");
    }
  }
  await page.goto("/?city=shanghai-china");
  await expect(page.locator(".city-statistics dd")).toHaveText(["1", "2.5"]);
  await expect(page.locator(".city-visit-list")).toContainText(
    "30 – 31 August 2026",
  );
  await expect(page.locator(".visit-period").last()).toContainText(
    "1 September 2026",
  );
  await expect(page.locator(".visit-period-duration")).toHaveText(["1.5*"]);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/?panel=countries&country=NZ");
  await expect(page.locator(".visit-period-duration")).toContainText(["3.5*"]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/?panel=countries");
  await expect(
    page.locator('.country-last-visit[data-year="2025"]').first(),
  ).toHaveCSS("color", "rgb(223, 191, 0)");
});
function city(name: string) {
  const found = data.cities.find((record) => record.name === name);
  if (!found) throw new Error(`Missing collection record: ${name}`);
  return found;
}

test("approved city histories show corrected dates and half-days on a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      return type.includes("webgl")
        ? null
        : get.apply(this, [type, ...args] as never);
    } as typeof get;
  });
  for (const [id, text, total] of [
    ["london-uk", "1 – 3 May 2026", "6.5"],
    ["seoul-south-korea", "17 – 21 July 2025", "4.5"],
    ["auckland-new-zealand", "5 – 8 August 2025", "4.5"],
    ["singapore-singapore", "11 – 12 September 2026", "7"],
    ["prague-czechia", "5 – 6 May 2024", "4"],
    ["panama-city-panama", "24 March 2025", "2"],
    ["boston-usa", "20 August 2021", "4.5"],
    ["los-angeles-usa", "30 January – 2 February 2022", "7.5"],
    ["orlando-usa", "1 – 6 March 2022", "5.5"],
    ["san-francisco-usa", "1 – 2 November 2025", "5"],
    ["rome-italy", "16 – 17 August 2024", "3"],
    ["vatican-city-vatican-city", "17 August 2024", "2"],
  ]) {
    await page.goto(`/?city=${id}`);
    await expect(page.locator(".city-visit-list")).toContainText(text);
    await expect(page.locator(".city-statistics dd").nth(1)).toHaveText(total);
    expect(
      await page
        .locator(".city-detail")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
  }
  await page.goto("/?city=auckland-new-zealand");
  await expect(page.locator(".city-visit-list")).toContainText("28 July 2025");
  await expect(page.locator(".visit-period-duration")).toHaveText(["3.5*"]);
  await page.goto("/?panel=countries&country=GB");
  await expect(page.locator(".country-visit-list")).toContainText(
    "1 – 3 May 2026",
  );
  await expect(page.locator(".country-statistics")).toContainText("13");
});
async function openCountry(page: Page, name: string) {
  await page
    .locator(".country-row")
    .filter({ has: page.getByText(name, { exact: true }) })
    .click();
}

async function withoutGlobe(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      return type.includes("webgl")
        ? null
        : original.apply(this, [type, ...args] as never);
    } as typeof original;
  });
}

async function openCity(page: Page, name: string) {
  await page
    .getByRole("textbox", { name: "Search cities and countries" })
    .fill(name);
  const exactName = page
    .locator(".city-row-name")
    .and(page.getByText(name, { exact: true }));
  await page.locator(".city-row").filter({ has: exactName }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}
async function back(page: Page) {
  await page.getByRole("button", { name: backName, exact: true }).click();
}

test.beforeEach(async ({ context, page, baseURL }) => {
  await context.route("https://tiles.openfreemap.org/**", (route) =>
    route.abort(),
  );
  await context.route("https://www.google.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<p>External map navigation test. Live Google content is not verified here.</p>",
    }),
  );
  await page.addInitScript(
    ({ key, origin }) => {
      if (window !== window.top || location.origin !== origin) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          "moscow-russia": "Update",
          "warsaw-poland": "Unfinished",
        }),
      );
    },
    { key: MAP_STATUS_STORAGE_KEY, origin: new URL(baseURL!).origin },
  );
});

test("the default globe loads cities and places with approved city visits and no saved demo statuses", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".city-row")).toHaveCount(entries.length);
  await expect(page.locator(".city-total")).toHaveText("343");
  await expect(page.locator(".visit-marker-not-yet")).toHaveCount(
    entries.filter((entry) => !["visited", "planned"].includes(entry.visit))
      .length,
  );
  await expect(
    page.locator(".visit-marker-visited, .visit-marker-planned"),
  ).toHaveCount(174);
  await expect(page.locator(".collection-bottom")).toHaveText(
    /Visited\s*98\s*countries\s*174\s*cities/,
  );
  await expect(page.locator(".city-row .status-complete")).toHaveCount(
    mapCount("Complete"),
  );
  await expect(page.locator(".city-row .status-unfinished")).toHaveCount(
    mapCount("Unfinished"),
  );
  await expect(page.locator(".city-row .status-not-started")).toHaveCount(
    entries.filter((entry) => entry.status === "Not Started").length,
  );
  await expect(page.locator('[data-testid="map-canvas"]')).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: 30000 },
  );
});

test("every status and continent filter and country search work on the full collection", async ({
  page,
}) => {
  await page.goto("/");
  for (const [status, count] of [
    ["Complete", mapCount("Complete")],
    ["Unfinished", mapCount("Unfinished")],
    [
      "Not Started",
      entries.filter((entry) => entry.status === "Not Started").length,
    ],
    ["Update", mapCount("Update")],
  ] as const) {
    await setMapFilter(page, status);
    await expect(page.locator(".city-row")).toHaveCount(count);
  }
  await setMapFilter(page, "all");
  for (const continent of [
    ...new Set(data.cities.map((record) => record.continent)),
  ]) {
    await chooseFilter(page, "Filter by continent", continent);
    await expect(page.locator(".city-row")).toHaveCount(
      entries.filter((record) => record.continent === continent).length,
    );
  }
  await chooseFilter(page, "Filter by continent", "All continents");
  for (const country of ["Russia", "Ukraine", "Svalbard", "Uganda"]) {
    await page.getByRole("textbox").fill(country);
    await expect(page.locator(".city-row")).toHaveCount(
      data.cities.filter((record) => record.country === country).length,
    );
  }
});

test("updated names and reviewed locations retain correct coordinates and country labels", async ({
  page,
}) => {
  await page.goto("/");
  for (const name of [
    "Johannesburg",
    "Kingstown",
    "Belize City",
    "Frankfurt am Main",
    "Krong Siem Reap",
    "Longyearbyen",
    "Sevastopol",
  ]) {
    await openCity(page, name);
    const record = city(name);
    const [longitude, latitude] = record.coordinates!;
    await expect(page.locator(".detail-coordinates")).toContainText(
      `${Math.abs(latitude).toFixed(4)}° ${latitude >= 0 ? "N" : "S"}`,
    );
    await expect(page.locator(".detail-coordinates")).toContainText(
      `${Math.abs(longitude).toFixed(4)}° ${longitude >= 0 ? "E" : "W"}`,
    );
    await expect(page.locator(".detail-country")).toContainText(
      record.country.replace(/\band\b/gi, "&"),
    );
    await expect(page.locator(".visit-value")).toHaveText(
      record.visit === "visited" ? "Visited" : "Not Yet",
    );
    await expect(page.locator(".notes-section")).toHaveCount(0);
    await back(page);
  }
});

test("Nice and Vienna open their own correct maps and the viewer stays lazy", async ({
  page,
}) => {
  await page.goto("/");
  const mapIds: Record<string, string | null> = {};
  for (const name of ["Nice", "Vienna"]) {
    await openCity(page, name);
    await expect(page.locator("iframe")).toHaveCount(0);
    const record = city(name);
    await page
      .getByRole("button", { name: "View My Map", exact: true })
      .click();
    await expect(page.locator("iframe")).toHaveAttribute(
      "src",
      record.map!.embedUrl,
    );
    await expect(
      page.getByRole("link", { name: "Open in Google My Maps" }),
    ).toHaveAttribute("href", record.map!.viewerUrl);
    mapIds[name] = new URL(record.map!.embedUrl).searchParams.get("mid");
    await page.getByRole("button", { name: "Back to globe" }).click();
    await expect(page.locator("iframe")).toHaveCount(0);
    await back(page);
  }
  expect(mapIds.Nice).toBe("1VgVwKHS5nWFFAesEvKnpHjZEcn6wa4Y");
  expect(mapIds.Nice).not.toBe(mapIds.Vienna);
});

test("the two unplaced regions remain accessible without invented positions", async ({
  page,
}) => {
  await page.goto("/");
  for (const name of ["Iguazu", "Lofoten"]) {
    await openCity(page, name);
    await expect(page.locator(".detail-coordinates")).toHaveCount(0);
    await expect(
      page.getByText("Not yet recorded", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "View My Map", exact: true }),
    ).toBeVisible();
    await back(page);
  }
});

test("long names fit from 320px to desktop without clipped coordinates or dropdowns", async ({
  page,
}) => {
  for (const width of [320, 360, 700, 1600]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`/?city=${encodeURIComponent(city("Kingstown").id)}`);
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const bounds = await page.locator(".city-detail").evaluate((element) => ({
      scroll: element.scrollWidth,
      client: element.clientWidth,
    }));
    expect(bounds.scroll).toBeLessThanOrEqual(bounds.client);
    const card = (await page.locator(".detail-place-card").boundingBox())!;
    const coordinates = (await page
      .locator(".detail-coordinates")
      .boundingBox())!;
    expect(coordinates.x + coordinates.width).toBeLessThanOrEqual(
      card.x + card.width,
    );
    const facts = (await page.locator(".detail-facts").boundingBox())!;
    const picker = (await page.locator(".status-picker").boundingBox())!;
    expect(picker.x + picker.width).toBeLessThanOrEqual(facts.x + facts.width);
  }
});

test("names wrap between words while coordinates stay anchored and shrink only when needed", async ({
  page,
}) => {
  const cases = [
    { width: 1600, name: "Longyearbyen" },
    { width: 1440, name: "Longyearbyen" },
    { width: 1000, name: "Longyearbyen" },
    { width: 700, name: "Longyearbyen" },
    { width: 360, name: "Longyearbyen" },
    { width: 320, name: "Longyearbyen" },
    { width: 700, name: "Yekaterinburg" },
    { width: 1600, name: "Krong Siem Reap" },
    { width: 700, name: "Krong Siem Reap" },
    { width: 320, name: "Krong Siem Reap" },
    { width: 1600, name: "Bandar Seri Begawan" },
    { width: 700, name: "Bandar Seri Begawan" },
    { width: 320, name: "Bandar Seri Begawan" },
    { width: 1600, name: "Moscow" },
    { width: 700, name: "Moscow" },
  ];
  for (const { width, name } of cases) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`/?city=${encodeURIComponent(city(name).id)}`);
    await page.evaluate(() => document.fonts.ready);
    const heading = page.getByRole("heading", { name, exact: true });
    const words = await heading.evaluate((element) => {
      const text = element.firstChild!;
      return [...element.textContent!.matchAll(/\S+/g)].map((word) => {
        const range = document.createRange();
        range.setStart(text, word.index!);
        range.setEnd(text, word.index! + word[0].length);
        return {
          word: word[0],
          lines: [...range.getClientRects()].filter((rect) => rect.width > 0)
            .length,
          left: range.getBoundingClientRect().left,
          right: range.getBoundingClientRect().right,
        };
      });
    });
    const title = (await heading.boundingBox())!;
    for (const word of words) {
      expect(word.lines, `${width}px: ${name} / ${word.word}`).toBe(1);
      expect(word.left).toBeGreaterThanOrEqual(title.x);
      expect(word.right).toBeLessThanOrEqual(title.x + title.width + 0.5);
    }
    await expect(heading).toHaveCSS(
      "font-size",
      `${width >= 1600 ? 34 : width > 600 && width <= 760 ? 30 : 32}px`,
    );
    const coordinates = (await page
      .locator(".detail-coordinates")
      .boundingBox())!;
    const card = (await page.locator(".detail-place-card").boundingBox())!;
    expect(title.x + title.width).toBeLessThanOrEqual(card.x + card.width);
    expect(coordinates.x + coordinates.width).toBeLessThanOrEqual(
      card.x + card.width,
    );
    const overlapping =
      title.x < coordinates.x + coordinates.width &&
      coordinates.x < title.x + title.width &&
      title.y < coordinates.y + coordinates.height &&
      coordinates.y < title.y + title.height;
    expect(overlapping).toBe(false);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(coordinates.x + coordinates.width).toBeCloseTo(
      card.x + card.width - 17,
      0,
    );
    const stacked = await page.locator(".detail-identity--stacked").count();
    if (stacked) {
      expect(coordinates.y + coordinates.height).toBeLessThanOrEqual(title.y);
    } else {
      expect(coordinates.x).toBeGreaterThanOrEqual(title.x + title.width);
      expect(coordinates.y).toBeGreaterThanOrEqual(title.y);
      expect(coordinates.y).toBeLessThan(title.y + title.height);
    }
    if (["Moscow", "Krong Siem Reap", "Bandar Seri Begawan"].includes(name)) {
      expect(stacked).toBe(0);
      await expect(page.locator(".detail-coordinates")).toHaveCSS(
        "font-size",
        "12px",
      );
    }
    if (name === "Longyearbyen" && [1600, 1440, 360].includes(width)) {
      expect(stacked).toBe(0);
      await expect(page.locator(".detail-coordinates")).toHaveCSS(
        "font-size",
        "10px",
      );
    }
  }
});

for (const { name, before, after } of [
  { name: "Ivano-Frankivsk", before: "Ivano-", after: "Frankivsk" },
  { name: "Rostov-on-Don", before: "Rostov-", after: "on-Don" },
  { name: "Yuzhno-Sakhalinsk", before: "Yuzhno-", after: "Sakhalinsk" },
]) {
  test(`hyphenated name ${name} wraps as ${before} / ${after}`, async ({
    page,
  }) => {
    for (const width of [1600, 1440, 700, 360, 320, 600]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/?city=${encodeURIComponent(city(name).id)}`);
      await page.evaluate(() => document.fonts.ready);
      const heading = page.getByRole("heading", { name, exact: true });
      await expect(heading).toHaveText(name);
      const parts = heading.locator(".detail-name-part");
      await expect(parts).toHaveText([before, after]);
      const title = (await heading.boundingBox())!;
      const prefix = (await parts.nth(0).boundingBox())!;
      const suffix = (await parts.nth(1).boundingBox())!;
      for (const part of [prefix, suffix]) {
        expect(part.x).toBeGreaterThanOrEqual(title.x);
        expect(part.x + part.width).toBeLessThanOrEqual(
          title.x + title.width + 0.5,
        );
        expect(part.height).toBeCloseTo(prefix.height, 0);
      }
      if (prefix.width + suffix.width > title.width + 0.5) {
        expect(suffix.y).toBeGreaterThan(prefix.y);
        expect(suffix.x).toBeCloseTo(prefix.x, 0);
      } else {
        expect(suffix.y).toBeCloseTo(prefix.y, 0);
      }
      const coordinates = page.locator(".detail-coordinates");
      const location = (await coordinates.boundingBox())!;
      expect(location.x).toBeGreaterThanOrEqual(title.x + title.width);
      expect(location.y).toBeGreaterThanOrEqual(title.y);
      expect(location.y).toBeLessThan(title.y + title.height);
      await expect(page.locator(".detail-identity--stacked")).toHaveCount(0);
      if (width === 1600 || width === 600)
        await expect(coordinates).toHaveCSS("font-size", "12px");
      await expect(heading).toHaveCSS(
        "font-size",
        `${width >= 1600 ? 34 : width > 600 && width <= 760 ? 30 : 32}px`,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  });
}

test("coordinate sizing resets when space or the selected city changes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/?city=${encodeURIComponent(city("Longyearbyen").id)}`);
  const coordinates = page.locator(".detail-coordinates");
  for (const { width, size } of [
    { width: 1600, size: "10px" },
    { width: 600, size: "12px" },
    { width: 1440, size: "10px" },
    { width: 600, size: "12px" },
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => document.fonts.ready);
    await expect(coordinates).toHaveCSS("font-size", size);
  }
  await page.setViewportSize({ width: 1600, height: 900 });
  await expect(coordinates).toHaveCSS("font-size", "10px");
  await back(page);
  await openCity(page, "Bandar Seri Begawan");
  await expect(coordinates).toHaveCSS("font-size", "12px");
  await expect(page.locator(".detail-identity--regular")).toBeVisible();
});

test("real status edits persist and sync separately from demo edits without changing visits", async ({
  page,
  context,
}) => {
  await page.goto("/?city=moscow-russia");
  const status = page.getByRole("combobox", {
    name: "Map status",
    exact: true,
  });
  await expect(status).toHaveValue("Complete");
  await status.selectOption("Unfinished");
  await page.reload();
  await expect(status).toHaveValue("Unfinished");
  const saved = await page.evaluate(
    ({ demo, collection }) => ({
      demo: JSON.parse(localStorage.getItem(demo)!),
      collection: JSON.parse(localStorage.getItem(collection)!),
    }),
    { demo: MAP_STATUS_STORAGE_KEY, collection: COLLECTION_STATUS_STORAGE_KEY },
  );
  expect(saved.demo["moscow-russia"]).toBe("Update");
  expect(saved.collection["moscow-russia"]).toBe("Unfinished");
  await back(page);
  await setMapFilter(page, "Unfinished");
  await expect(page.locator(".city-row")).toHaveCount(8);
  await expect(page.locator(".collection-bottom")).toHaveText(
    /Visited\s*98\s*countries\s*174\s*cities/,
  );
  await setMapFilter(page, "all");
  await openCity(page, "Moscow");
  const other = await context.newPage();
  await other.goto("/?city=moscow-russia");
  await expect(
    other.getByRole("combobox", { name: "Map status", exact: true }),
  ).toHaveValue("Unfinished");
  await status.selectOption("Complete");
  await expect(
    other.getByRole("combobox", { name: "Map status", exact: true }),
  ).toHaveValue("Complete");
  await other.close();
  await back(page);
  await page.getByRole("textbox").fill("");
  await expect(page.locator(".city-row .status-complete")).toHaveCount(
    mapCount("Complete"),
  );
  await expect(page.locator(".visit-marker-not-yet")).toHaveCount(
    entries.filter((entry) => !["visited", "planned"].includes(entry.visit))
      .length,
  );
});

test("the full collection and corrected map links remain usable without WebGL", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type.includes("webgl")) return null;
      return original.apply(this, [type, ...args] as never);
    } as typeof original;
  });
  await page.goto("/");
  await expect(
    page.getByText("The interactive globe needs WebGL.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".city-row")).toHaveCount(entries.length);
  await openCity(page, "Nice");
  await expect(
    page.getByRole("button", { name: "View My Map", exact: true }),
  ).toBeVisible();
});

test("the Countries tab has labelled counts, independent filters, and reloadable navigation", async ({
  page,
}) => {
  await withoutGlobe(page);
  await page.goto("/");
  const tabs = page.getByRole("tablist", { name: "Collection view" });
  await expect(page.locator(".collection-count-main")).toHaveText("343 cities");
  await expect(page.locator(".collection-count small")).toHaveText("1 place");
  await page.getByLabel("Search cities and countries").fill("Adelaide");
  await expect(page.locator(".collection-count")).toHaveText("1 city");
  await tabs.getByRole("tab", { name: "Countries", exact: true }).click();
  await expect(page).toHaveURL(/panel=countries/);
  await expect(page.locator(".country-row")).toHaveCount(198);
  await expect(page.locator(".collection-count")).toHaveText("198 countries");
  await expect(
    page.getByText("Sample country data", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Search countries", { exact: true }),
  ).toHaveCount(0);
  await chooseFilter(page, "Filter by continent", "Oceania");
  const oceanianCount = await page.locator(".country-row").count();
  expect(oceanianCount).toBeGreaterThan(0);
  await expect(page.locator(".collection-count")).toHaveText(
    `${oceanianCount} countries`,
  );
  await tabs.getByRole("tab", { name: "Cities", exact: true }).click();
  await expect(page.getByLabel("Search cities and countries")).toHaveValue(
    "Adelaide",
  );
  await tabs.getByRole("tab", { name: "Countries", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Filter by continent", exact: true }),
  ).toContainText("Oceania");
  await chooseFilter(page, "Filter by continent", "All continents");
  await page
    .locator(".country-overview")
    .getByRole("button", { name: /^Countries visited / })
    .click();
  await expect(page.locator(".country-row")).toHaveCount(97);
  await expect(page.locator(".collection-count")).toHaveText("97 countries");
  await chooseFilter(page, "Filter by last visited year", "2024");
  await chooseFilter(page, "Filter by continent", "Oceania");
  await expect(
    page.getByRole("heading", { name: "No countries found" }),
  ).toBeVisible();
  await expect(page.locator(".collection-count")).toHaveText("0 countries");
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(page.locator(".country-row")).toHaveCount(198);
  await page.reload();
  await expect(
    tabs.getByRole("tab", { name: "Countries", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.goBack();
  await expect(
    tabs.getByRole("tab", { name: "Cities", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("countries open their own details and keep their tab through city details and reload", async ({
  page,
}) => {
  await withoutGlobe(page);
  await page.goto("/?panel=countries");
  await openCountry(page, "Algeria");
  await expect(page).toHaveURL(/country=DZ/);
  const countryTab = page.getByRole("tab", { name: "Countries", exact: true });
  await expect(countryTab).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("heading", { name: "Algeria", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Country visit statistics")).not.toContainText(
    "Visit order",
  );
  await expect(page.getByLabel("Country visit statistics")).toContainText(
    "Visits",
  );
  await expect(page.getByLabel("Country visit statistics")).toContainText(
    "Days spent",
  );
  await expect(
    page.getByRole("heading", { name: "Visit history", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".city-row")).toHaveCount(3);
  await expect(page.locator(".country-cities-heading")).toHaveText(
    "Cities3 cities",
  );
  await page
    .locator(".city-row")
    .filter({ has: page.getByText("Algiers", { exact: true }) })
    .click();
  await expect(
    page.getByRole("heading", { name: "Algiers", exact: true }),
  ).toBeVisible();
  await expect(countryTab).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(countryTab).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("heading", { name: "Algiers", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View My Map", exact: true }).click();
  await page
    .getByRole("button", { name: "Back to globe", exact: true })
    .click();
  await expect(countryTab).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("button", { name: "Algeria (3 cities)", exact: true })
    .click();
  await expect(page.locator(".city-row")).toHaveCount(3);
  await expect(
    page.getByRole("heading", { name: "Algeria", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".city-row")).toHaveCount(3);
  await expect(countryTab).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("button", { name: "Back to countries", exact: true })
    .click();
  await expect(
    page.getByLabel("Search countries", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".country-row")).toHaveCount(198);
  await expect(page).not.toHaveURL(/country=/);
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Algeria", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(
    page.getByRole("combobox", {
      name: "Filter by last visited year",
      exact: true,
    }),
  ).toBeVisible();
});

test("Patagonia reuses the city row and profile with both countries and preserves city statistics", async ({
  page,
  context,
  baseURL,
}) => {
  await withoutGlobe(page);
  await page.goto("/");
  await expect(
    page.locator(".city-overview-totals .scoreboard-stat-value"),
  ).toHaveText(["174", "222", "401"]);
  await expect(page.locator(".collection-count-main")).toHaveText("343 cities");
  await expect(page.locator(".collection-count small")).toHaveText("1 place");
  const patagonia = page.locator(".city-row").filter({
    has: page.locator(".city-row-name", { hasText: /^Patagonia$/ }),
  });
  await expect(patagonia.locator(".city-row-name")).toHaveText("Patagonia");
  await expect(
    patagonia.locator(".entry-country > span:last-child"),
  ).toHaveText(["Argentina", "Chile"]);
  await expect(patagonia.locator(".status")).toHaveText("Not Started");
  await expect(patagonia).toHaveAttribute("href", /place=patagonia/);
  await patagonia.click();
  await expect(page).toHaveURL(/place=patagonia/);
  await expect(
    page.getByRole("heading", { name: "Patagonia", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".detail-country")).toContainText("Argentina");
  await expect(page.locator(".detail-country")).toContainText("Chile");
  await expect(
    page.getByRole("button", { name: "View My Map", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("A map in the making", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Patagonia", exact: true }),
  ).toBeVisible();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  for (const [code, name] of [
    ["AR", "Argentina"],
    ["CL", "Chile"],
  ]) {
    await page.goto(`/?panel=countries&country=${code}&countrySet=197`);
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await expect(page.locator(".country-cities-heading")).toContainText(
      "1 place",
    );
    const row = page
      .locator(".city-row")
      .filter({ has: page.getByText("Patagonia", { exact: true }) });
    const href = (await row.getAttribute("href"))!;
    expect(new URL(href, baseURL).searchParams.get("country")).toBe(code);
    expect(new URL(href, baseURL).searchParams.get("place")).toBe("patagonia");
    const tab = await context.newPage();
    await withoutGlobe(tab);
    await tab.goto(new URL(href, baseURL).href);
    await expect(
      tab.getByRole("heading", { name: "Patagonia", exact: true }),
    ).toBeVisible();
    await expect(
      tab.getByRole("tab", { name: "Countries", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await tab.close();
  }
  await page.goto("/?panel=countries");
  for (const code of ["AR", "CL"]) {
    const country = data.cities.find((city) => city.countryCode === code)!;
    const row = page
      .locator(".country-row")
      .filter({ has: page.getByText(country.country, { exact: true }) });
    await expect(row.locator(".country-city-count strong")).toHaveText(
      String(data.cities.filter((city) => city.countryCode === code).length),
    );
  }
  await expect(page.locator(".collection-bottom")).toHaveText(
    /Visited\s*98\s*countries\s*174\s*cities/,
  );
});

test("country and city rows support native new tabs while ordinary clicks preserve panel state", async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      return type.includes("webgl")
        ? null
        : original.apply(this, [type, ...args] as never);
    } as typeof original;
  });
  await page.goto("/?panel=countries&countrySet=197");
  const alphabetical = page.getByRole("button", {
    name: "Sort countries alphabetically",
    exact: true,
  });
  await alphabetical.click();
  const kosovo = page
    .locator("a.country-row")
    .filter({ has: page.getByText("Kosovo", { exact: true }) });
  await expect(kosovo).toHaveAttribute("href", /country=XK/);
  await kosovo.click({ button: "right" });
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/country=XK/);
  const countryPopup = context.waitForEvent("page");
  await kosovo.click({ modifiers: ["ControlOrMeta"] });
  const countryTab = await countryPopup;
  await expect(
    countryTab.getByRole("heading", { name: "Kosovo", exact: true }),
  ).toBeVisible();
  await expect(countryTab).toHaveURL(/countrySet=197/);
  await expect(
    countryTab.locator(".country-detail-heading .country-order-badge"),
  ).toHaveText("#74*");
  await expect(page).not.toHaveURL(/country=XK/);
  await countryTab.close();
  await kosovo.click();
  await expect(
    page.getByRole("heading", { name: "Kosovo", exact: true }),
  ).toBeVisible();
  const city = page.locator("a.city-row").first();
  const cityName = await city.locator(".city-row-name").innerText();
  await expect(city).toHaveAttribute("href", /country=XK/);
  const cityPopup = context.waitForEvent("page");
  await city.click({ button: "middle" });
  const cityTab = await cityPopup;
  await expect(
    cityTab.getByRole("heading", { name: cityName, exact: true }),
  ).toBeVisible();
  await expect(cityTab).toHaveURL(/country=XK/);
  await expect(cityTab).toHaveURL(/countrySet=197/);
  await expect(
    cityTab.getByRole("tab", { name: "Countries", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page).not.toHaveURL(/city=/);
  await cityTab.close();
  await page
    .getByRole("button", { name: "Back to countries", exact: true })
    .click();
  await expect(alphabetical).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".country-row .city-row-name").first()).toHaveText(
    "Afghanistan",
  );
  await page.getByRole("tab", { name: "Cities", exact: true }).click();
  const globalCity = page.locator("a.city-row").first();
  const globalName = await globalCity.locator(".city-row-name").innerText();
  const globalPopup = context.waitForEvent("page");
  await globalCity.click({ modifiers: ["ControlOrMeta"] });
  const globalTab = await globalPopup;
  await expect(
    globalTab.getByRole("heading", { name: globalName, exact: true }),
  ).toBeVisible();
  expect(new URL(globalTab.url()).searchParams.has("country")).toBe(false);
  await expect(globalTab).toHaveURL(/countrySet=197/);
  await expect(page).not.toHaveURL(/city=/);
  await globalTab.close();
});

test("whole-country hover stays stable over lifted land, opens its panel and clears during globe dragging", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const stats = { loads: 0, reloads: 0 };
    Object.assign(window, { countryHoverWorkerStats: stats });
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      this: Worker,
      ...args: Parameters<Worker["postMessage"]>
    ) {
      const message = args[0];
      if (message?.data?.source === "atlas-countries") {
        if (message.type === "LT") stats.loads++;
        if (message.type === "RT") stats.reloads++;
      }
      return post.apply(this, args);
    } as Worker["postMessage"];
  });
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.abort(),
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?country=LY");
  const globe = page.getByTestId("map-canvas");
  await expect(globe).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await expect(page.locator(".coordinates")).toContainText("26.5° N");
  await page
    .getByRole("button", { name: "Back to countries", exact: true })
    .click();
  const box = (await globe.boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const before = await globe.screenshot();
  const hoverToggle = page.getByRole("button", {
    name: "Enable country hover",
    exact: true,
  });
  await expect(hoverToggle).toHaveAttribute("aria-pressed", "false");
  await page.mouse.move(point.x, point.y);
  await expect(globe).toHaveAttribute("data-hover-country", "");
  await expect(page.locator(".country-row")).toHaveCount(198);
  await hoverToggle.click();
  await page.evaluate(() => {
    const stats = (
      window as unknown as Window & {
        countryHoverWorkerStats: { loads: number; reloads: number };
      }
    ).countryHoverWorkerStats;
    if (!stats.loads) throw new Error("Country tile tracking is inactive");
    stats.reloads = 0;
  });
  await page.mouse.move(point.x, point.y);
  await expect(globe).toHaveAttribute("data-hover-country", "LY");
  await expect(page.locator(".country-row .city-row-name")).toHaveText([
    "Libya",
  ]);
  await expect(page.locator(".country-globe-preview")).toHaveCount(0);
  await hoverToggle.hover();
  await expect(globe).toHaveAttribute("data-hover-country", "");
  await expect(page.locator(".country-row .city-row-name")).toHaveText([
    "Libya",
  ]);
  await hoverToggle.click();
  await expect(page.locator(".country-row")).toHaveCount(198);
  await page.mouse.move(point.x, point.y);
  await expect(globe).toHaveAttribute("data-hover-country", "");
  await expect(page.locator(".country-row")).toHaveCount(198);
  await hoverToggle.click();
  await page.mouse.move(point.x, point.y);
  await expect(globe).toHaveAttribute("data-hover-country", "LY");
  await expect(page.locator(".maplibregl-canvas")).toHaveCSS(
    "cursor",
    "pointer",
  );
  await expect
    .poll(async () => Buffer.compare(await globe.screenshot(), before))
    .not.toBe(0);
  // The full 160 ms lift must not rebuild country tiles and drop their outlines.
  await page.waitForTimeout(200);
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as Window & {
            countryHoverWorkerStats: { reloads: number };
          }
        ).countryHoverWorkerStats.reloads,
    ),
  ).toBe(0);
  // A queued hit test must not restore a hover after the pointer has left.
  await page.evaluate(({ x, y }) => {
    const canvas = document.querySelector(".maplibregl-canvas")!;
    canvas.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, clientX: x, clientY: y }),
    );
    canvas.dispatchEvent(new MouseEvent("mouseleave"));
  }, point);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(globe).toHaveAttribute("data-hover-country", "");
  await page.mouse.move(point.x + 18, point.y + 12);
  await expect(globe).toHaveAttribute("data-hover-country", "LY");
  await page.mouse.click(point.x + 18, point.y + 12);
  await expect(page).toHaveURL(/panel=countries.*country=LY/);
  await expect(
    page.getByRole("heading", { name: "Libya", exact: true }),
  ).toBeVisible();
  await page.getByRole("heading", { name: "Libya", exact: true }).hover();
  await expect(globe).toHaveAttribute("data-hover-country", "");
  await expect(globe).toHaveAttribute("data-selected-country", "LY");
  let hoverOffset = 0;
  await expect
    .poll(async () => {
      // Country hit testing resumes when the profile's camera animation ends.
      await page.mouse.move(
        box.x + box.width * 0.96 + (hoverOffset++ % 2),
        point.y,
      );
      return globe.getAttribute("data-hover-country");
    })
    .toBe("EG");
  await expect(globe).toHaveAttribute("data-selected-country", "LY");
  await expect(
    page.getByRole("heading", { name: "Libya", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to countries", exact: true })
    .click();
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 85, point.y + 20, { steps: 8 });
  await page.mouse.up();
  await expect(page).not.toHaveURL(/country=LY/);
  await expect(globe).toHaveAttribute("data-hover-country", "");
  await page.locator(".country-overview").hover();
  await expect(globe).toHaveAttribute("data-hover-country", "");
  expect(errors).toEqual([]);
});

test("striped-country hover clears over the sea and city pins retain click priority", async ({
  page,
}) => {
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.abort(),
  );
  await page.goto("/?country=IE");
  const globe = page.getByTestId("map-canvas");
  await expect(globe).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await expect(page.locator(".coordinates")).not.toHaveText(
    /43\.0° N.*25\.0° E/,
  );
  await page
    .getByRole("button", { name: "Back to countries", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Enable country hover", exact: true })
    .click();
  let box = (await globe.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(globe).toHaveAttribute("data-hover-country", "IE");
  await page.mouse.move(box.x + 20, box.y + box.height * 0.45);
  await expect(globe).toHaveAttribute("data-hover-country", "");
  await page.goto("/?city=reykjavik-iceland");
  await expect(globe).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await expect(page.locator(".coordinates")).toContainText("64.1° N");
  await page
    .getByRole("button", { name: "All cities (343)", exact: true })
    .click();
  box = (await globe.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(globe).toHaveAttribute("data-hover-country", "");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page).toHaveURL(/city=reykjavik-iceland/);
  await expect(
    page.getByRole("heading", { name: "Reykjavik", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Cities", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("touch taps open country panels with reduced motion and do not leave a hover state", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
  });
  try {
    const page = await context.newPage();
    await page.route("https://tiles.openfreemap.org/**", (route) =>
      route.abort(),
    );
    await page.goto("http://127.0.0.1:4173/?country=LY");
    const globe = page.getByTestId("map-canvas");
    await expect(globe).toHaveAttribute("data-ready", "true", {
      timeout: 30000,
    });
    await expect(page.locator(".coordinates")).toContainText("26.5° N");
    await page
      .getByRole("button", { name: "Back to countries", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Enable country hover", exact: true }),
    ).toHaveCount(0);
    await expect(globe).toHaveAttribute("data-hover-available", "false");
    const box = (await globe.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(
      page.getByRole("heading", { name: "Libya", exact: true }),
    ).toBeVisible();
    await expect(globe).toHaveAttribute("data-hover-country", "");
  } finally {
    await context.close();
  }
});

test("country selection frames its boundaries and legacy country links open country details", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?country=AL");
  await expect(
    page.getByRole("tab", { name: "Countries", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("heading", { name: "Albania", exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-testid="map-canvas"]')).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: 30000 },
  );
  await expect(page.locator(".coordinates")).toHaveText(
    /41\.\d° N\s*\/\s*20\.\d° E/,
  );
  await page
    .getByRole("button", { name: "Back to countries", exact: true })
    .click();
  await openCountry(page, "Australia");
  await expect(
    page.getByRole("heading", { name: "Australia", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".coordinates")).toHaveText(
    /\d+\.\d° S\s*\/\s*\d+\.\d° E/,
  );
  await page
    .getByRole("button", { name: "Back to countries", exact: true })
    .click();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Australia", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to countries", exact: true })
    .click();
  await openCountry(page, "Albania");
  await expect(page.locator(".coordinates")).toHaveText(
    /41\.\d° N\s*\/\s*20\.\d° E/,
  );
  await page
    .getByRole("button", { name: "Back to countries", exact: true })
    .click();
  await openCountry(page, "France");
  await expect(page.locator(".coordinates")).toHaveText(
    /4\d\.\d° N\s*\/\s*\d\.\d° E/,
  );
});

test("country pages preserve city filters and fit narrow panels without overflow", async ({
  page,
}) => {
  await withoutGlobe(page);
  await page.goto("/");
  await page.getByLabel("Search cities and countries").fill("Adelaide");
  await setMapFilter(page, "Unfinished");
  await page.getByRole("tab", { name: "Countries", exact: true }).click();
  await openCountry(page, "Saint Vincent & the Grenadines");
  await expect(page.locator(".city-row")).toHaveCount(1);
  for (const width of [1440, 740, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const bounds = await page
      .locator(".country-detail")
      .evaluate((el) => ({ width: el.clientWidth, scroll: el.scrollWidth }));
    expect(bounds.scroll).toBeLessThanOrEqual(bounds.width);
    await expect(
      page.getByRole("heading", {
        name: "Saint Vincent & the Grenadines",
        exact: true,
      }),
    ).toBeVisible();
  }
  await page.getByRole("tab", { name: "Cities", exact: true }).click();
  await expect(page.getByLabel("Search cities and countries")).toHaveValue(
    "Adelaide",
  );
  await expect(mapFilterButton(page, "Unfinished")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("tab", { name: "Countries", exact: true }).click();
  await openCountry(page, "Albania");
  await page.keyboard.press("Control+k");
  await expect(
    page.getByLabel("Search cities and countries", { exact: true }),
  ).toBeFocused();
  await expect(page).not.toHaveURL(/country=/);
});

test("collection tabs work with a keyboard and the compact header fits narrow panels", async ({
  page,
}) => {
  await withoutGlobe(page);
  await page.goto("/");
  const tabs = page.getByRole("tablist", { name: "Collection view" });
  await tabs.getByRole("tab", { name: "Cities", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    tabs.getByRole("tab", { name: "Countries", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("combobox", {
      name: "Filter by last visited year",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Home");
  await expect(
    tabs.getByRole("tab", { name: "Cities", exact: true }),
  ).toBeFocused();
  for (const width of [1440, 740, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const view of ["Countries", "Cities"]) {
      await tabs.getByRole("tab", { name: view, exact: true }).click();
      const sizes = await page
        .locator(".collection-controls")
        .evaluate((el) => ({
          width: el.clientWidth,
          scroll: el.scrollWidth,
          height: el.getBoundingClientRect().height,
        }));
      expect(sizes.scroll).toBeLessThanOrEqual(sizes.width);
      expect(sizes.height).toBeLessThanOrEqual(80);
      await expect(page.locator(".collection-count")).toContainText(
        view === "Countries" ? "countries" : "cities",
      );
    }
  }
});

test("country scoreboard scope updates row and profile ranks without inventing missing trip details", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type.includes("webgl")) return null;
      return original.apply(this, [type, ...args] as never);
    } as typeof original;
  });
  await page.goto("/?panel=countries");
  const listSize = page.getByLabel("Country scoreboard scope", { exact: true });
  await expect(listSize).toContainText("195");
  await expect(page.locator(".country-row")).toHaveCount(198);
  await expect(page.locator(".collection-bottom")).toHaveText(
    /Visited\s*98\s*countries\s*174\s*cities/,
  );
  await openCountry(page, "Honduras");
  await expect(
    page.getByRole("heading", { name: "Honduras", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".country-detail-heading .country-order-badge"),
  ).toHaveText("#97");
  await expect(page.locator(".country-statistics dd")).toHaveText([
    "1",
    "1",
    "1",
  ]);
  await expect(page.locator(".country-visit-list")).toContainText(
    "26 September 2026",
  );
  await page
    .getByRole("button", { name: "Back to countries", exact: true })
    .click();
  await chooseFilter(page, "Country scoreboard scope", "197 (🇽🇰🇹🇼)");
  await expect(page).toHaveURL(/countrySet=197/);
  await openCountry(page, "Honduras");
  await expect(
    page.locator(".country-detail-heading .country-order-badge"),
  ).toHaveText("#98");
  await page.reload();
  await expect(
    page.locator(".country-detail-heading .country-order-badge"),
  ).toHaveText("#98");
  await page
    .getByRole("button", { name: "Back to countries", exact: true })
    .click();
  await expect(listSize).toContainText("197");
  await expect(page.locator(".country-row")).toHaveCount(198);
  await expect(page.locator(".collection-bottom")).toHaveText(
    /Visited\s*98\s*countries\s*174\s*cities/,
  );
  await openCountry(page, "Kosovo");
  await expect(
    page.locator(".country-detail-heading .country-order-badge"),
  ).toHaveText("#74*");
  await page
    .getByRole("button", { name: "Back to countries", exact: true })
    .click();
  await openCountry(page, "Taiwan");
  await expect(
    page.locator(".country-statistics .country-value-missing"),
  ).toHaveCount(2);
  await expect(
    page.locator(".country-detail-heading .country-order-badge"),
  ).toHaveCount(0);
  await expect(page.locator(".country-visit-list")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Back to countries", exact: true })
    .click();
  await chooseFilter(page, "Country scoreboard scope", "195");
  await expect(page.locator(".country-row")).toHaveCount(198);
  await page.goBack();
  await expect(listSize).toContainText("197");
  await expect(page.locator(".country-row")).toHaveCount(198);
});

test("country profile titles keep whole words and center the inset shield beside short and wrapped names", async ({
  page,
}) => {
  await withoutGlobe(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    for (const code of ["EG", "AE", "CH", "LI", "BA", "MK"]) {
      await page.goto(`/?panel=countries&country=${code}`);
      await page.evaluate(() => document.fonts.ready);
      const heading = page.locator(".country-detail-heading");
      const title = heading.locator("h1");
      await expect(title).toHaveCSS("font-family", /Fraunces/);
      await expect(page.locator(".country-reference-section")).toHaveCSS(
        "font-family",
        /Alegreya Sans/,
      );
      const card = (await page.locator(".country-place-card").boundingBox())!;
      const badge = (await heading
        .locator(".country-order-badge")
        .boundingBox())!;
      const titleBox = (await title.boundingBox())!;
      const identity = (await heading
        .locator(".country-detail-identity")
        .boundingBox())!;
      expect(badge.x + badge.width).toBeCloseTo(card.x + card.width - 19, 0);
      expect(badge.y + badge.height / 2).toBeCloseTo(
        identity.y + identity.height / 2 + 4,
        0,
      );
      expect(badge.y).toBeGreaterThan(identity.y);
      expect(badge.x).toBeGreaterThan(titleBox.x + titleBox.width);
      const ending = title.locator(".country-name-ending");
      const lastWord = (await ending
        .locator(".country-name-word")
        .boundingBox())!;
      const flag = (await ending.locator(".country-flag").boundingBox())!;
      expect(flag.x).toBeGreaterThan(lastWord.x + lastWord.width);
      expect(flag.x + flag.width).toBeLessThanOrEqual(
        titleBox.x + titleBox.width + 1,
      );
      for (const word of await title.locator(".country-name-word").all()) {
        const box = (await word.boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(
          titleBox.x + titleBox.width + 1,
        );
        expect(
          await word.evaluate((node) => {
            const range = document.createRange();
            range.selectNodeContents(node);
            return range.getClientRects().length;
          }),
        ).toBe(1);
      }
      await expect(page.locator(".country-status-badge")).toHaveCount(0);
      await expect(heading.locator(".country-order-number")).toHaveCSS(
        "font-weight",
        "900",
      );
      await expect(
        page.getByRole("button", { name: "Back to countries", exact: true }),
      ).toHaveText("");
      await expect(page.locator(".country-statistics dd")).toHaveCount(3);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
});

test("supplied workbook metrics and median rows render offline without changing travel statistics", async ({
  page,
}) => {
  await withoutGlobe(page);
  const referenceRequests: string[] = [];
  page.on("request", (request) => {
    if (
      /country[-_]reference|country[-_]metrics|country[-_]highlights/.test(
        request.url(),
      )
    )
      referenceRequests.push(request.url());
  });
  await page.route("https://gbgkxgdreftzhxeprryc.supabase.co/**", (route) =>
    route.abort(),
  );
  await page.goto("/?panel=countries&country=CH");
  await expect(page.locator('[data-metric="gdpPerCapita"]')).toHaveCount(1);
  await page
    .getByRole("button", { name: "Show total GDP", exact: true })
    .click();
  await expect(page.locator(".country-reference-value")).toHaveText([
    "9M",
    "41.3K",
    "1,140B",
  ]);
  await expect(
    page.locator(".country-reference-medians--raw strong"),
  ).toHaveText(["9.1M", "5.65M", "118K", "65.3K", "53.16B", "198B"]);
  await expect(page.locator(".country-index-label strong")).toHaveText([
    "27.7 / 100",
    "18.2 / 100",
    "59.3 / 100",
  ]);
  await expect(
    page.locator(".country-reference-medians--index strong"),
  ).toHaveText(["27.9", "21.8", "28.4", "21.6", "23.4", "38.2"]);
  await expect(page.locator('[data-metric="area"] dt')).toHaveText(
    "Total area (km²)",
  );
  await expect(page.locator(".country-reference-unit")).toHaveCount(0);
  await expect(page.getByText("🌍 median", { exact: true })).toHaveCount(6);
  await expect(
    page.locator(
      ".country-reference-vintage, .country-reference-info, .country-reference-explanation",
    ),
  ).toHaveCount(0);
  await expect(page.getByRole("meter")).toHaveCount(3);
  await expect(page.locator(".country-highlights ul li")).toHaveText([
    "Capital: Bern",
    "Swiss franc",
    "Landlocked",
  ]);
  await expect(page.locator(".country-statistics dd")).toHaveText([
    "2",
    "11",
    "8",
  ]);
  const values = await page
    .locator(".country-index-label strong")
    .allTextContents();
  await page.goto("/?panel=countries&country=CH&countrySet=197");
  await expect(page.locator(".country-index-label strong")).toHaveText(values);
  expect(referenceRequests).toEqual([]);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const sections = await page
      .locator('[data-metric="population"] .country-reference-metric-body')
      .evaluate((element) =>
        [...element.children].map((child) => ({
          className: child.className,
          top: child.getBoundingClientRect().top,
        })),
      );
    expect(
      sections.find((s) => s.className.includes("medians--raw"))!.top,
    ).toBeLessThan(
      sections.find((s) => s.className.includes("index-label"))!.top,
    );
    expect(
      sections.find((s) => s.className.includes("medians--index"))!.top,
    ).toBeGreaterThan(
      sections.find((s) => s.className.includes("index-track"))!.top,
    );
  }
  await page.goto("/?panel=countries&country=US");
  await expect(
    page.locator('[data-metric="gdp"] .country-reference-value'),
  ).toHaveText("32,640B");
  await expect(page.locator(".country-statistics dd")).toHaveText([
    "—",
    "—",
    String(
      data.cities.filter(
        (city) => city.countryCode === "US" && city.visit === "visited",
      ).length,
    ),
  ]);
  await page.goto("/?panel=countries&country=TW");
  await expect(
    page.locator('[data-metric="gdp"] .country-reference-value'),
  ).toHaveText("1,020B");
  for (const [code, population] of [
    ["CN", "1.41B"],
    ["IN", "1.48B"],
  ]) {
    await page.goto(`/?panel=countries&country=${code}`);
    await expect(
      page.locator('[data-metric="population"] .country-reference-value'),
    ).toHaveText(population);
  }
  await page.goto("/?panel=countries&country=SJ");
  await expect(page.locator(".country-reference-value")).toHaveText([
    "N/A",
    "N/A",
    "N/A",
  ]);
  await expect(page.getByRole("meter")).toHaveCount(0);
  await page.goto("/?panel=countries&country=RU");
  await expect(page.locator(".country-place-card")).toHaveClass(
    /country-place-card--unvisited/,
  );
  await expect(page.locator(".country-place-card")).toHaveCSS(
    "background-color",
    "rgb(225, 229, 230)",
  );
  await page.goto("/?panel=countries&country=TR");
  await expect(page.getByText("EU median", { exact: true })).toHaveCount(6);
  await expect(page.getByText("AS median", { exact: true })).toHaveCount(0);
  await expect(
    page.locator('[data-metric="gdp"] .country-reference-medians--raw strong'),
  ).toHaveText(["53.16B", "198B"]);
  await page
    .getByRole("button", { name: "Show GDP per capita", exact: true })
    .click();
  await expect(
    page.locator(
      '[data-metric="gdpPerCapita"] .country-reference-medians--raw strong',
    ),
  ).toHaveText(["8.53K", "41.34K"]);
  await expect(
    page.locator(
      '[data-metric="gdpPerCapita"] .country-reference-medians--index strong',
    ),
  ).toHaveText(["35.6", "65.0"]);
});

test("GDP toggles to saved per-capita figures in the same third column and remembers the choice", async ({
  page,
}) => {
  await withoutGlobe(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() =>
    localStorage.setItem("ciudad-mundo-country-gdp-display-v1", "gdp"),
  );
  await page.route("https://gbgkxgdreftzhxeprryc.supabase.co/**", (route) =>
    route.abort(),
  );
  await page.goto("/?panel=countries&country=CH");
  const columns = page.locator(".country-reference-metric");
  await expect(columns).toHaveCount(3);
  const perCapita = page.locator('[data-metric="gdpPerCapita"]');
  await expect(page.getByText("In perspective", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator(".country-reference-section")).toHaveCSS(
    "border-top-style",
    "solid",
  );
  await expect(page.locator(".country-reference-section")).toHaveCSS(
    "border-radius",
    "0px",
  );
  await expect(page.locator(".country-index-label").first()).toHaveCSS(
    "border-top-style",
    "dashed",
  );
  await expect(columns).toHaveCount(3);
  await expect(page.locator('[data-metric="gdp"]')).toHaveCount(0);
  await expect(page.locator(".country-reference-value")).toHaveText([
    "9M",
    "41.3K",
    "127K",
  ]);
  await expect(
    perCapita.locator(".country-reference-medians--raw strong"),
  ).toHaveText(["8.53K", "41.34K"]);
  await expect(perCapita.locator(".country-index-label strong")).toHaveText(
    "87.2 / 100",
  );
  await expect(
    perCapita.locator(".country-reference-medians--index strong"),
  ).toHaveText(["35.6", "65.0"]);
  await expect(
    page.getByRole("button", { name: "Show total GDP", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    expect(
      await columns.evaluateAll((elements) => {
        const bounds = elements.map((element) =>
          element.getBoundingClientRect(),
        );
        const indexRows = elements.map(
          (element) =>
            element
              .querySelector(".country-index-label")!
              .getBoundingClientRect().top,
        );
        return (
          bounds.every((rect) => Math.abs(rect.top - bounds[0].top) < 1) &&
          indexRows.every((top) => Math.abs(top - indexRows[0]) < 1) &&
          elements.every((element) =>
            [
              ...element.querySelectorAll(
                "dt, .country-reference-value, .country-reference-medians strong",
              ),
            ].every(
              (child) =>
                child.getBoundingClientRect().right <=
                element.getBoundingClientRect().right + 1,
            ),
          ) &&
          elements.every((element) =>
            [...element.querySelectorAll(".country-reference-medians p")].every(
              (row) => {
                const label = row
                  .querySelector("span")!
                  .getBoundingClientRect();
                const value = row
                  .querySelector("strong")!
                  .getBoundingClientRect();
                return (
                  Math.abs(label.top - value.top) < 3 &&
                  label.right + 1 <= value.left
                );
              },
            ),
          ) &&
          document.documentElement.scrollWidth <= innerWidth
        );
      }),
    ).toBe(true);
  }
  await page.reload();
  await expect(perCapita.locator(".country-reference-value")).toHaveText(
    "127K",
  );
  await page.goto("/?panel=countries&country=CN");
  await expect(perCapita.locator(".country-reference-value")).toHaveText(
    "15.25K",
  );
  await expect(
    page.locator('[data-metric="population"] .country-reference-value'),
  ).toHaveText("1.41B");
  await page.goto("/?panel=countries&country=SJ");
  await expect(page.locator(".country-reference-value")).toHaveText([
    "N/A",
    "N/A",
    "N/A",
  ]);
  await expect(page.getByRole("meter")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Show total GDP", exact: true })
    .click();
  await page.goto("/?panel=countries&country=CH");
  await expect(page.locator(".country-reference-value")).toHaveText([
    "9M",
    "41.3K",
    "1,140B",
  ]);
});

test("country history shows stays and corrected dates without explanatory copy or notes", async ({
  page,
}) => {
  await withoutGlobe(page);
  for (const [code, visits, days] of [
    ["AT", 2, 5],
    ["DK", 1, 3],
    ["AU", 2, 14],
    ["NZ", 1, 5.5],
    ["GB", 3, 13],
  ] as const) {
    await page.goto(`/?panel=countries&country=${code}`);
    await expect(page.locator(".country-statistics dd")).toHaveText([
      String(visits),
      String(days),
      String(
        data.cities.filter(
          (city) => city.countryCode === code && city.visit === "visited",
        ).length,
      ),
    ]);
    await expect(
      page.getByText("These totals cover recorded trips", { exact: false }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Recorded yearbook visit", { exact: false }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Notes", exact: true }),
    ).toHaveCount(0);
    if (code === "AT")
      await expect(
        page.locator('.visit-timeline-entry[data-visit-number="1"]'),
      ).toContainText("10 – 12 May 2024");
    if (code === "DK")
      await expect(
        page.locator('.visit-timeline-entry[data-visit-number="1"]'),
      ).toContainText("30 December 2023 – 1 January 2024");
    if (code === "AU") {
      await expect(page.getByLabel("Actual stays for visit 1")).toContainText(
        "24 – 27 July 2025",
      );
      await expect(page.getByLabel("Actual stays for visit 1")).toContainText(
        "29 July – 3 August 2025",
      );
      await expect(
        page.locator(
          '.visit-timeline-entry[data-visit-number="1"] .visit-total strong',
        ),
      ).toHaveText("10");
    }
    if (code === "GB") {
      const first = page.locator(
        '.visit-timeline-entry[data-visit-number="1"]',
      );
      await expect(first.locator(".visit-period")).toHaveCount(2);
      await expect(first.locator(".visit-period").nth(0)).toContainText(
        "14 – 17 December 2023",
      );
      await expect(first.locator(".visit-period").nth(1)).toContainText(
        "21 – 26 December 2023",
      );
      await expect(first.locator(".visit-period-duration")).toHaveText([
        "3.5*",
        "6",
      ]);
      await expect(first.locator(".visit-period-gap")).toHaveCount(1);
      await expect(first.locator(".visit-total strong")).toHaveText("9.5");
      await expect(first.locator(":scope > p")).toHaveCount(0);
      await expect(
        first.getByText("Actual stays", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.locator('.visit-timeline-entry[data-visit-number="3"]'),
      ).toContainText("1 – 3 May 2026");
    }
  }
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/?panel=countries&country=AU");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("visit history rows keep their default height and only grow for extra content", async ({
  page,
}) => {
  await withoutGlobe(page);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    for (const query of [
      "city=dubai-uae",
      "city=london-uk",
      "city=shanghai-china",
      "city=singapore-singapore",
      "city=new-york-city-usa",
      "panel=countries&country=CA",
      "panel=countries&country=CH",
      "panel=countries&country=SG",
      "panel=countries&country=DK",
    ]) {
      await page.goto(`/?${query}`);
      await expect(page.locator(".visit-timeline-entry").first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const layout = await page
        .locator(".visit-timeline-entry")
        .evaluateAll((rows) =>
          rows.map((row) => {
            const bounds = row.getBoundingClientRect();
            const content = row
              .querySelector(".visit-months")!
              .getBoundingClientRect();
            const style = getComputedStyle(row);
            const total = row
              .querySelector(".visit-total")!
              .getBoundingClientRect();
            return {
              height: bounds.height,
              expectedHeight: Math.max(
                parseFloat(style.minHeight) || 0,
                Math.max(content.height, total.height) +
                  parseFloat(style.paddingTop) +
                  parseFloat(style.paddingBottom),
              ),
              top: style.paddingTop,
              bottom: style.paddingBottom,
              balance: Math.abs(
                content.top - bounds.top - (bounds.bottom - content.bottom),
              ),
              overflow: row.scrollHeight > row.clientHeight + 1,
            };
          }),
        );
      expect(
        layout.every(
          (row) => Math.abs(row.height - row.expectedHeight) <= 0.02,
        ),
        `${width}px ${query} content only determines its own row height`,
      ).toBe(true);
      if (query === "city=dubai-uae")
        expect(layout.map((row) => row.height)).toEqual([56, 56, 56]);
      if (query === "panel=countries&country=SG")
        expect(layout.map((row) => row.height)).toEqual([88, 48]);
      expect(
        layout.every(
          (row) =>
            row.top === row.bottom && row.balance <= 0.02 && !row.overflow,
        ),
        `${width}px ${query} centered content`,
      ).toBe(true);
      expect(
        await page
          .locator(".visit-timeline")
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      const anchors = await page.locator(".visit-timeline").evaluate((root) => {
        const center = (box: DOMRect) => box.left + box.width / 2;
        let dates = true,
          ranges = true,
          connections = true,
          borders = true;
        for (const period of root.querySelectorAll(".visit-period")) {
          const points = [
            ...period.querySelectorAll(".visit-period-point"),
          ].map((point) => point.getBoundingClientRect());
          const labels = [
            ...period.querySelectorAll(
              ".visit-period-date-point, .visit-period-date-start, .visit-period-date-end",
            ),
          ].map((label) => label.getBoundingClientRect());
          dates &&=
            points.length === labels.length &&
            points.every(
              (point, index) =>
                Math.abs(center(point) - center(labels[index])) <= 0.1,
            );
          if (points.length === 2)
            ranges &&=
              Math.abs(
                period
                  .querySelector(".visit-period-axis")!
                  .getBoundingClientRect().width -
                  (period.classList.contains("visit-period--month-dates")
                    ? 84
                    : 76),
              ) <= 0.02;
        }
        for (const group of root.querySelectorAll(".visit-timeline-year")) {
          borders &&=
            getComputedStyle(group.querySelector(".visit-year-card")!)
              .outlineColor ===
            getComputedStyle(group.querySelector(".visit-year-circle")!).color;
          for (const entry of [
            ...group.querySelectorAll(".visit-timeline-entry"),
          ].slice(1)) {
            borders &&=
              getComputedStyle(entry, "::before").borderTopColor ===
              getComputedStyle(group.querySelector(".visit-year-circle")!)
                .color;
          }
        }
        for (const row of root.querySelectorAll(".visit-month-periods")) {
          const origin = row.getBoundingClientRect();
          const periods = [...row.querySelectorAll(".visit-period")];
          const lines = [
            ...row.querySelectorAll<SVGLineElement>(".visit-period-gap"),
          ];
          let expected = 0;
          for (let index = 1; index < periods.length; index++) {
            const previous = [
              ...periods[index - 1].querySelectorAll(".visit-period-point"),
            ]
              .at(-1)!
              .getBoundingClientRect();
            const next = periods[index]
              .querySelector(".visit-period-point")!
              .getBoundingClientRect();
            const sameRow =
              Math.abs(
                previous.top + previous.height / 2 - next.top - next.height / 2,
              ) <= 0.5;
            const line = lines.find(
              (item) => item.dataset.to === String(index),
            );
            if (!sameRow) {
              connections &&= !line;
              continue;
            }
            expected++;
            if (!line) {
              connections = false;
              continue;
            }
            const [dash, gap] = line
              .getAttribute("stroke-dasharray")!
              .split(" ")
              .map(Number);
            connections &&=
              Math.abs(line.x1.baseVal.value + origin.left - previous.right) <=
                0.1 &&
              Math.abs(line.x2.baseVal.value + origin.left - next.left) <=
                0.1 &&
              Math.abs(4 * dash + 3 * gap - (next.left - previous.right)) <=
                0.02 &&
              gap === 1;
          }
          connections &&= lines.length === expected;
        }
        return { dates, ranges, connections, borders };
      });
      expect(
        anchors,
        `${width}px ${query} circle-aligned labels and connected dashes`,
      ).toEqual({
        dates: true,
        ranges: true,
        connections: true,
        borders: true,
      });
    }
  }
});

test("country stay segments name matching cities above the plot and fit narrow panels", async ({
  page,
}) => {
  await withoutGlobe(page);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto("/?panel=countries&country=CA");
    await expect(page.locator(".visit-period-cities")).toHaveText([
      "Ottawa",
      "Toronto",
      "Vancouver",
    ]);
    await expect(page.locator(".visit-year-count")).toHaveCSS(
      "font-size",
      "9px",
    );
    await expect(page.locator(".country-statistics dd")).toHaveText([
      "3",
      "22",
      "3",
    ]);
    await page.goto("/?panel=countries&country=CH");
    await expect(page.locator(".visit-period-cities")).toHaveCount(4);
    expect(
      await page
        .locator(".country-detail")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    expect(
      await page.locator(".visit-period--with-cities").evaluateAll((elements) =>
        elements.every((element) => {
          const cities = element
            .querySelector(".visit-period-cities")!
            .getBoundingClientRect();
          const axis = element
            .querySelector(".visit-period-axis")!
            .getBoundingClientRect();
          return (
            cities.bottom < axis.top &&
            cities.right <= element.getBoundingClientRect().right + 1
          );
        }),
      ),
    ).toBe(true);
    await page.goto("/?city=london-uk");
    await expect(page.locator(".visit-period-cities")).toHaveCount(0);
    await expect(page.locator(".visit-timeline-entry")).toHaveCount(4);
  }
});

test("grouped city visits show only actual periods, preserve partial days and fit mobile", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      return type.includes("webgl")
        ? null
        : original.apply(this, [type, ...args] as never);
    } as typeof original;
  });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [id, count, days, group, periods] of [
      ["london-uk", "4", "6.5", 1, ["14 December 2023", "16 December 2023"]],
      [
        "shanghai-china",
        "1",
        "2.5",
        1,
        ["30 – 31 August 2026 (1.5 days)", "1 September 2026"],
      ],
      ["bern-switzerland", "3", "6", 2, ["5 August 2024", "7 – 8 August 2024"]],
      ["boston-usa", "2", "4.5", 1, ["15 August 2021", "20 August 2021"]],
      ["panama-city-panama", "1", "2", 1, ["21 March 2025", "24 March 2025"]],
      [
        "singapore-singapore",
        "4",
        "7",
        2,
        ["18 – 20 August 2026", "25 August 2026"],
      ],
    ] as const) {
      await page.goto(`/?city=${id}`);
      await expect(page.locator(".city-statistics dd")).toHaveText([
        count,
        days,
      ]);
      const history = page.locator(".city-visit-list");
      await expect(history.locator(".visit-timeline-entry")).toHaveCount(
        Number(count),
      );
      const actual = page.getByRole("list", {
        name: `Stays for visit ${group}`,
        exact: true,
      });
      await expect(actual.locator(".visit-period")).toHaveCount(periods.length);
      for (const [index, text] of periods.entries()) {
        const [range, exception] = text.split(" (");
        const period = actual.locator(".visit-period").nth(index);
        await expect(period).toContainText(range);
        if (exception)
          await expect(period.locator(".visit-period-duration")).toHaveText(
            `${exception.split(" ")[0]}*`,
          );
      }
      if (id === "london-uk") {
        const year = history.locator('[data-year="2023"]');
        await expect(year.locator(".visit-year-count")).toHaveText("2 visits");
        await expect(year.locator(".visit-timeline-entry")).toHaveCount(2);
        await expect(year.locator(".visit-total strong")).toHaveText([
          "1",
          "2",
        ]);
      }
      await expect(actual.locator("..").locator(":scope > p")).toHaveCount(0);
      await expect(history).not.toContainText("Actual stays");
      expect(
        await history.evaluate(
          (element) =>
            element.scrollWidth <= element.clientWidth &&
            document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
});
