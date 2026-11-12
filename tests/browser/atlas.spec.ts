import { test, expect } from "@playwright/test";
// Test the complete bundled atlas independently of external services.
test.beforeEach(async ({ page }) => {
  await page.route("https://tiles.openfreemap.org/**", (r) => r.abort());
});
test("globe, list, search and every status are functional", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Cities", exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-testid="map-canvas"]')).toHaveAttribute(
    "data-ready",
    "true",
  );
  await expect(page.locator(".city-row")).toHaveCount(5);
  await expect(
    page.locator(".city-row").filter({ hasText: "Helsinki" }),
  ).toContainText("Planned");
  await expect(
    page.locator(".city-row").filter({ hasText: "Kyiv" }),
  ).toContainText("Not Yet");
  await expect(
    page.locator(".city-row").filter({ hasText: "Warsaw" }),
  ).toContainText("Visited");
  await expect(
    page.locator(".city-row").filter({ hasText: "Warsaw" }),
  ).toContainText("2025");
  await expect(page.locator(".collection-bottom")).toHaveText(
    /Visited\s*2\s*countries\s*1\s*city/,
  );
  await expect(page.locator(".city-panel")).not.toContainText(
    /YOUR WORLD|Places explored|Sample data|Visit not recorded/,
  );
  await page
    .getByRole("textbox", { name: "Search cities and countries" })
    .fill("poland");
  await expect(page.locator(".city-row")).toHaveCount(1);
  await expect(page.locator(".city-row")).toContainText("Warsaw");
  await page.getByRole("button", { name: "Clear search" }).click();
  for (const [status, count] of [
    ["Complete", 2],
    ["Update", 1],
    ["Unfinished", 1],
    ["Not Started", 1],
  ] as const) {
    await page.getByLabel("Filter by map status").selectOption(status);
    await expect(page.locator(".city-row")).toHaveCount(count);
  }
  await page.getByLabel("Filter by map status").selectOption("all");
  await page.getByRole("textbox").fill("somewhere-nonexistent");
  await expect(
    page.getByRole("heading", { name: "No cities found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator(".city-row")).toHaveCount(5);
});
test("compact rows keep visits and map status separate at desktop and narrow widths", async ({
  page,
}) => {
  for (const width of [1440, 700, 360, 320]) {
    await page.setViewportSize({ width, height: 720 });
    await page.goto("/");
    await expect(page.locator(".city-row")).toHaveCount(5);
    const rows = await page.locator(".city-row").evaluateAll((elements) =>
      elements.map((el) => {
        const bounds = el.getBoundingClientRect();
        const marker = el
          .querySelector(".visit-marker")!
          .getBoundingClientRect();
        const body = el
          .querySelector(".city-row-body")!
          .getBoundingClientRect();
        const status = el.querySelector(".status")!.getBoundingClientRect();
        const chevron = el
          .querySelector(".row-chevron")!
          .getBoundingClientRect();
        return {
          height: bounds.height,
          ordered:
            marker.right <= body.left &&
            body.right <= status.left &&
            status.right <= chevron.left &&
            chevron.right <= bounds.right,
        };
      }),
    );
    for (const row of rows) {
      expect(row.ordered).toBe(true);
      expect(row.height).toBeGreaterThanOrEqual(72);
      expect(row.height).toBeLessThanOrEqual(90);
    }
    const footer = await page.locator(".collection-bottom").boundingBox();
    expect(footer!.height).toBeLessThanOrEqual(54);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (width > 600) {
      expect(footer!.y + footer!.height).toBeLessThanOrEqual(720);
      await expect(page.locator(".city-row").last()).toBeInViewport();
    }
  }
  await page.setViewportSize({ width: 1024, height: 420 });
  await page.goto("/");
  await expect(page.locator(".collection-bottom")).toBeInViewport();
  await page.locator(".city-row").last().scrollIntoViewIfNeeded();
  await page.locator(".city-row").last().click();
  await expect(
    page.getByRole("heading", { name: "Warsaw", exact: true }),
  ).toBeVisible();
});
test("selecting a city, notes, visits, links, direct URLs and browser history", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".city-row").filter({ hasText: "Warsaw" }).click();
  await expect(page).toHaveURL(/city=warsaw-poland/);
  await expect(
    page.getByRole("heading", { name: "Warsaw", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".detail-facts")).toContainText("Visited");
  await expect(page.locator(".detail-facts")).toContainText("18 June 2025");
  await expect(page.locator(".notes-section")).toContainText(
    "A slow afternoon along the Vistula.",
  );
  await expect(page.getByText("A map in the making")).toBeVisible();
  await page.getByRole("button", { name: "All cities" }).click();
  await expect(page.locator(".city-row")).toHaveCount(5);
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Warsaw", exact: true }),
  ).toBeVisible();
  await page.goto("/?city=kyiv-ukraine");
  await expect(
    page.getByRole("heading", { name: "Kyiv", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "View annotated map" }),
  ).toBeVisible();
  await page.goto("/?city=not-a-real-city&view=map");
  await expect(
    page.getByRole("heading", { name: "Cities", exact: true }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/city=/);
});
test("viewer is lazy, canonical, accessible, and preserves filters and camera", async ({
  page,
}) => {
  await page.route("https://www.google.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<p>Test map content</p>",
    }),
  );
  await page.goto("/");
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByLabel("Filter by map status").selectOption("Complete");
  await page.getByRole("textbox").fill("Kyiv");
  await page.locator(".city-row").click();
  await expect(page.locator(".map-view-badge")).toContainText("Regional view");
  await page.waitForTimeout(1800);
  const position = await page.locator(".coordinates").textContent();
  await page.getByRole("button", { name: "View annotated map" }).click();
  await expect(page).toHaveURL(/city=kyiv-ukraine&view=map/);
  await expect(page.locator("iframe")).toHaveCount(1);
  await expect(page.locator("iframe")).toHaveAttribute(
    "src",
    /https:\/\/www.google.com\/maps\/d\/embed\?mid=/,
  );
  await expect(
    page.getByRole("link", { name: "Open in Google My Maps" }),
  ).toHaveAttribute("href", /\/maps\/d\/viewer\?mid=/);
  await expect(
    page.getByRole("button", { name: "Back to globe" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Back to globe" }).click();
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.locator(".coordinates")).toHaveText(position!);
  await expect(
    page.getByRole("button", { name: "View annotated map" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "All cities" }).click();
  await expect(page.getByRole("textbox")).toHaveValue("Kyiv");
  await expect(page.getByLabel("Filter by map status")).toHaveValue("Complete");
  await expect(page.locator(".city-row")).toHaveCount(1);
  await page.goto("/?city=moscow-russia&view=map");
  await expect(page.locator("iframe")).toHaveCount(1);
  await expect(page.locator(".viewer-title")).toContainText("Moscow");
});
test("camera supports dragging, continuous zoom and reset", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('[data-testid="map-canvas"]')).toHaveAttribute(
    "data-ready",
    "true",
  );
  const initial = await page.locator(".coordinates").textContent();
  const canvas = page.locator(".maplibregl-canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 150,
    box.y + box.height / 2 + 35,
    { steps: 12 },
  );
  await page.mouse.up();
  await page.waitForTimeout(900);
  await expect(page.locator(".coordinates")).not.toHaveText(initial!);
  await page
    .getByRole("button", { name: "Zoom in", exact: true })
    .click({ clickCount: 3, delay: 400 });
  await expect(page.locator(".map-view-badge")).toContainText("Regional view");
  await page.getByRole("button", { name: "Return to globe" }).click();
  await expect(page.locator(".map-view-badge")).toContainText("Globe view");
  await expect(page.locator(".coordinates")).toHaveText(initial!);
});
test("360px layout and keyboard selection", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("textbox").focus();
  await page.keyboard.type("Prague");
  await page.keyboard.press("Tab");
  await page.locator(".city-row").focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Prague", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".detail-facts")).toContainText("Not visited");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("city list and map links survive unavailable WebGL", async ({ page }) => {
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
  await expect(page.locator(".city-row")).toHaveCount(5);
  await page.getByRole("textbox").fill("Moscow");
  await page.locator(".city-row").click();
  await expect(
    page.getByRole("button", { name: "View annotated map" }),
  ).toBeVisible();
});

test("clusters expand and visible pins select their city", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-testid="map-canvas"]')).toHaveAttribute(
    "data-ready",
    "true",
  );
  await page.waitForLoadState("networkidle");
  const canvas = page.locator(".maplibregl-canvas");
  const box = (await canvas.boundingBox())!;
  const initialPosition = await page.locator(".coordinates").textContent();
  // The Central European demo cluster in the documented initial camera.
  await page.mouse.click(
    box.x + box.width / 2 - 13,
    box.y + box.height / 2 - 54,
  );
  await expect(page.locator(".coordinates")).not.toHaveText(initialPosition!);
  await page.locator(".city-row").filter({ hasText: "Kyiv" }).click();
  await expect(page.locator(".coordinates")).toHaveText(/50.5° N.*30.5° E/);
  await page.getByRole("button", { name: "All cities" }).click();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(
    page.getByRole("heading", { name: "Kyiv", exact: true }),
  ).toBeVisible();
});
