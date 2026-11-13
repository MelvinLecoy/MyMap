import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { AtlasData } from "../../src/lib/types";
import {
  MAP_STATUS_STORAGE_KEY,
  COLLECTION_STATUS_STORAGE_KEY,
} from "../../src/lib/status-storage";

const data = JSON.parse(
  readFileSync("src/generated/atlas.json", "utf8"),
) as AtlasData;
const backName = `All cities (${data.cities.length})`;
function city(name: string) {
  const found = data.cities.find((record) => record.name === name);
  if (!found) throw new Error(`Missing collection record: ${name}`);
  return found;
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

test("the default globe loads all 321 real entries without demo visits or saved demo statuses", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".city-row")).toHaveCount(321);
  await expect(page.locator(".city-total")).toHaveText("321");
  await expect(page.locator(".visit-marker-not-yet")).toHaveCount(321);
  await expect(
    page.locator(".visit-marker-visited, .visit-marker-planned"),
  ).toHaveCount(0);
  await expect(page.locator(".collection-bottom")).toHaveText(
    /Visited\s*0\s*countries\s*0\s*cities/,
  );
  await expect(page.locator(".city-row .status-complete")).toHaveCount(253);
  await expect(page.locator(".city-row .status-unfinished")).toHaveCount(7);
  await expect(page.locator(".city-row .status-not-started")).toHaveCount(61);
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
    ["Complete", 253],
    ["Unfinished", 7],
    ["Not Started", 61],
    ["Update", 0],
  ] as const) {
    await page.getByLabel("Filter by map status").selectOption(status);
    await expect(page.locator(".city-row")).toHaveCount(count);
  }
  await page.getByLabel("Filter by map status").selectOption("all");
  for (const continent of [
    ...new Set(data.cities.map((record) => record.continent)),
  ]) {
    await page.getByLabel("Filter by continent").selectOption(continent);
    await expect(page.locator(".city-row")).toHaveCount(
      data.cities.filter((record) => record.continent === continent).length,
    );
  }
  await page.getByLabel("Filter by continent").selectOption("all");
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
    await expect(page.locator(".detail-country")).toContainText(record.country);
    await expect(page.locator(".visit-value")).toHaveText("Not Yet");
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
  await page.getByLabel("Filter by map status").selectOption("Unfinished");
  await expect(page.locator(".city-row")).toHaveCount(8);
  await expect(page.locator(".collection-bottom")).toHaveText(
    /Visited\s*0\s*countries\s*0\s*cities/,
  );
  await page.getByLabel("Filter by map status").selectOption("all");
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
  await expect(page.locator(".city-row .status-complete")).toHaveCount(253);
  await expect(page.locator(".visit-marker-not-yet")).toHaveCount(321);
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
  await expect(page.locator(".city-row")).toHaveCount(321);
  await openCity(page, "Nice");
  await expect(
    page.getByRole("button", { name: "View My Map", exact: true }),
  ).toBeVisible();
});

test("the Countries tab has labelled counts, independent filters, and reloadable navigation", async ({
  page,
}) => {
  await page.goto("/");
  const tabs = page.getByRole("tablist", { name: "Collection view" });
  await expect(page.locator(".collection-count")).toHaveText("321 cities");
  await page.getByLabel("Search cities and countries").fill("Adelaide");
  await expect(page.locator(".collection-count")).toHaveText("1 city");
  await tabs.getByRole("tab", { name: "Countries", exact: true }).click();
  await expect(page).toHaveURL(/panel=countries/);
  await expect(page.locator(".country-row")).toHaveCount(131);
  await expect(page.locator(".collection-count")).toHaveText("131 countries");
  await expect(
    page.getByText("Sample country data", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search countries", { exact: true }).fill("Australia");
  await expect(page.locator(".country-row")).toHaveCount(1);
  await expect(page.locator(".country-row")).toContainText("6 cities");
  await expect(page.locator(".collection-count")).toHaveText("1 country");
  await tabs.getByRole("tab", { name: "Cities", exact: true }).click();
  await expect(page.getByLabel("Search cities and countries")).toHaveValue(
    "Adelaide",
  );
  await tabs.getByRole("tab", { name: "Countries", exact: true }).click();
  await expect(
    page.getByLabel("Search countries", { exact: true }),
  ).toHaveValue("Australia");
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await page
    .getByLabel("Filter by visit status", { exact: true })
    .selectOption("visited");
  await expect(
    page.getByRole("heading", { name: "No countries found" }),
  ).toBeVisible();
  await expect(page.locator(".collection-count")).toHaveText("0 countries");
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(page.locator(".country-row")).toHaveCount(131);
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
  await page.goto("/?panel=countries");
  await page.getByLabel("Search countries", { exact: true }).fill("Algeria");
  await page.locator(".country-row").click();
  await expect(page).toHaveURL(/country=DZ/);
  const countryTab = page.getByRole("tab", { name: "Countries", exact: true });
  await expect(countryTab).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("heading", { name: "Algeria", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Country visit statistics")).toContainText(
    "Visit order",
  );
  await expect(page.getByLabel("Country visit statistics")).toContainText(
    "Times visited",
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
    .getByRole("button", { name: "All countries (131)", exact: true })
    .click();
  await expect(
    page.getByLabel("Search countries", { exact: true }),
  ).toHaveValue("");
  await expect(page.locator(".country-row")).toHaveCount(131);
  await expect(page).not.toHaveURL(/country=/);
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Algeria", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(
    page.getByLabel("Search countries", { exact: true }),
  ).toBeVisible();
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
    .getByRole("button", { name: "All countries (131)", exact: true })
    .click();
  await page.getByLabel("Search countries", { exact: true }).fill("Australia");
  await page.locator(".country-row").click();
  await expect(
    page.getByRole("heading", { name: "Australia", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".coordinates")).toHaveText(
    /\d+\.\d° S\s*\/\s*\d+\.\d° E/,
  );
  await page
    .getByRole("button", { name: "All countries (131)", exact: true })
    .click();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Australia", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "All countries (131)", exact: true })
    .click();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await page.getByLabel("Search countries", { exact: true }).fill("Albania");
  await page.locator(".country-row").click();
  await expect(page.locator(".coordinates")).toHaveText(
    /41\.\d° N\s*\/\s*20\.\d° E/,
  );
  await page
    .getByRole("button", { name: "All countries (131)", exact: true })
    .click();
  await page.getByLabel("Search countries", { exact: true }).fill("France");
  await page.locator(".country-row").click();
  await expect(page.locator(".coordinates")).toHaveText(
    /4\d\.\d° N\s*\/\s*\d\.\d° E/,
  );
});

test("country pages preserve city filters and fit narrow panels without overflow", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Search cities and countries").fill("Adelaide");
  await page.getByLabel("Filter by map status").selectOption("Unfinished");
  await page.getByRole("tab", { name: "Countries", exact: true }).click();
  await page
    .getByLabel("Search countries", { exact: true })
    .fill("St. Vincent");
  await page.locator(".country-row").click();
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
        name: "St. Vincent and the Grenadines",
        exact: true,
      }),
    ).toBeVisible();
  }
  await page.getByRole("tab", { name: "Cities", exact: true }).click();
  await expect(page.getByLabel("Search cities and countries")).toHaveValue(
    "Adelaide",
  );
  await expect(page.getByLabel("Filter by map status")).toHaveValue(
    "Unfinished",
  );
  await page.getByRole("tab", { name: "Countries", exact: true }).click();
  await page.getByLabel("Search countries", { exact: true }).fill("Albania");
  await page.locator(".country-row").click();
  await page.keyboard.press("Control+k");
  await expect(
    page.getByLabel("Search countries", { exact: true }),
  ).toBeFocused();
  await expect(page).not.toHaveURL(/country=/);
});

test("collection tabs work with a keyboard and the compact header fits narrow panels", async ({
  page,
}) => {
  await page.goto("/");
  const tabs = page.getByRole("tablist", { name: "Collection view" });
  await tabs.getByRole("tab", { name: "Cities", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    tabs.getByRole("tab", { name: "Countries", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByLabel("Search countries", { exact: true }),
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
