import { test, expect, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { toCityRow, type CityRow } from "../../src/lib/cloud-data";
import type { AtlasData } from "../../src/lib/types";
import { COLLECTION_STATUS_STORAGE_KEY } from "../../src/lib/status-storage";

const atlas = JSON.parse(
  readFileSync("src/generated/atlas.json", "utf8"),
) as AtlasData;
const ownerId = "11111111-1111-4111-8111-111111111111";
const strangerId = "22222222-2222-4222-8222-222222222222";
const fixtureOrigin = "https://atlas-test.supabase.co";
const sessionKey = "sb-atlas-test-auth-token";
function token(id: string) {
  return [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: id,
        role: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url"),
    "fixture-signature",
  ].join(".");
}
function user(id: string) {
  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: "editor@example.test",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: "2026-01-01T00:00:00Z",
  };
}
function store() {
  return {
    rows: new Map(
      atlas.cities.map((city) => [
        city.id,
        { ...toCityRow(city), updated_at: "2026-11-12T00:00:00.000Z" },
      ]),
    ),
    failRead: false,
    failWrite: false,
    imports: 0,
    otp: null as null | Record<string, unknown>,
    redirect: "",
  };
}
type Store = ReturnType<typeof store>;
function changed(
  row: CityRow,
  status: CityRow["map_status"],
): CityRow & { updated_at: string } {
  return {
    ...row,
    map_status: status,
    updated_at: new Date(Date.parse(row.updated_at!) + 1000).toISOString(),
  };
}
async function backend(
  context: BrowserContext,
  state: Store,
  id?: string,
  local?: Record<string, string>,
) {
  await context.addInitScript(
    ({ id, local, sessionKey, localKey, accessToken }) => {
      if (local && !sessionStorage.getItem("fixture-local-seeded")) {
        localStorage.setItem(localKey, JSON.stringify(local));
        sessionStorage.setItem("fixture-local-seeded", "yes");
      }
      if (id && !sessionStorage.getItem("fixture-auth-seeded")) {
        localStorage.setItem(
          sessionKey,
          JSON.stringify({
            access_token: accessToken,
            refresh_token: "fixture-refresh",
            token_type: "bearer",
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id,
              aud: "authenticated",
              role: "authenticated",
              email: "editor@example.test",
              app_metadata: { provider: "email", providers: ["email"] },
              user_metadata: {},
              identities: [],
              created_at: "2026-01-01T00:00:00Z",
            },
          }),
        );
        sessionStorage.setItem("fixture-auth-seeded", "yes");
      }
    },
    {
      id,
      local,
      sessionKey,
      localKey: COLLECTION_STATUS_STORAGE_KEY,
      accessToken: id ? token(id) : "",
    },
  );
  await context.route("https://tiles.openfreemap.org/**", (r) => r.abort());
  await context.route(`${fixtureOrigin}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const authorization = request.headers().authorization;
    let caller: string | undefined;
    try {
      caller = JSON.parse(
        Buffer.from(
          (authorization ?? "").replace(/^Bearer /, "").split(".")[1],
          "base64url",
        ).toString(),
      ).sub;
    } catch {
      /* Public request. */
    }
    const reply = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
        },
      });
    if (method === "OPTIONS") return reply({});
    if (url.pathname === "/auth/v1/user") return reply(user(caller ?? ownerId));
    if (url.pathname === "/auth/v1/logout")
      return route.fulfill({ status: 204 });
    if (url.pathname === "/auth/v1/otp") {
      state.otp = request.postDataJSON();
      state.redirect = url.searchParams.get("redirect_to") ?? "";
      return reply({});
    }
    if (url.pathname.endsWith("/rpc/atlas_can_edit"))
      return reply(caller === ownerId);
    if (url.pathname.endsWith("/rpc/atlas_import_statuses")) {
      state.imports++;
      const changes = request.postDataJSON().changes as Array<{
        id: string;
        status: CityRow["map_status"];
        updated_at: string;
      }>;
      if (caller !== ownerId) return reply({ code: "42501" }, 403);
      if (
        changes.some((c) => state.rows.get(c.id)?.updated_at !== c.updated_at)
      )
        return reply({ code: "40001", message: "stale import" }, 400);
      const updated = changes.map((c) =>
        changed(state.rows.get(c.id)!, c.status),
      );
      updated.forEach((row) => state.rows.set(row.id, row));
      return reply(updated);
    }
    if (url.pathname === "/rest/v1/cities" && method === "GET") {
      if (state.failRead) return reply({ message: "unavailable" }, 503);
      return reply(
        [...state.rows.values()].sort((a, b) => a.id.localeCompare(b.id)),
      );
    }
    if (url.pathname === "/rest/v1/cities" && method === "PATCH") {
      if (caller !== ownerId) return reply({ code: "42501" }, 403);
      if (state.failWrite) return reply({ message: "unavailable" }, 503);
      const cityId = url.searchParams.get("id")?.slice(3) ?? "";
      const row = state.rows.get(cityId);
      if (
        !row ||
        row.updated_at !== url.searchParams.get("updated_at")?.slice(3)
      )
        return reply({ code: "PGRST116", message: "stale update" }, 406);
      const next = changed(row, request.postDataJSON().map_status);
      state.rows.set(cityId, next);
      return reply(next);
    }
    return reply({ message: "Unexpected mock endpoint" }, 404);
  });
}

test("visitors see saved data and cannot use browser overrides to change the public atlas", async ({
  context,
  page,
}) => {
  await backend(context, store(), undefined, { "moscow-russia": "Update" });
  await page.goto("/?city=moscow-russia");
  await expect(page.getByLabel("Map status", { exact: true })).toHaveValue(
    "Complete",
  );
  await expect(page.getByLabel("Map status", { exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Editor sign in" }),
  ).toBeVisible();
  await expect(page.getByText("Loading latest…")).toHaveCount(0);
});

test("a city added to the database can be opened directly without rebuilding the website", async ({
  context,
  page,
}) => {
  const state = store();
  const extra = {
    ...state.rows.get("moscow-russia")!,
    id: "new-place-test",
    name: "New Place",
  };
  state.rows.set(extra.id, extra);
  await backend(context, state);
  await page.goto("/?city=new-place-test");
  await expect(
    page.getByRole("heading", { name: "New Place", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "All cities (322)", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/city=new-place-test/);
});

test("only the editor can save and a separate device reads the confirmed status", async ({
  browser,
  context,
  page,
  baseURL,
}) => {
  const state = store();
  await backend(context, state, ownerId);
  await page.goto("/?city=moscow-russia");
  const picker = page.getByLabel("Map status", { exact: true });
  await expect(picker).toBeEnabled();
  await picker.selectOption("Update");
  await expect(page.locator(".editor-tools")).toContainText("Saved");
  await page.reload();
  await expect(picker).toHaveValue("Update");
  await expect(page.locator(".visit-value")).toHaveText("Not Yet");
  const otherContext = await browser.newContext();
  try {
    await backend(otherContext, state, strangerId);
    const other = await otherContext.newPage();
    await other.goto(`${baseURL}/?city=moscow-russia`);
    await expect(other.getByLabel("Map status", { exact: true })).toHaveValue(
      "Update",
    );
    await expect(
      other.getByLabel("Map status", { exact: true }),
    ).toBeDisabled();
    await expect(other.getByText(/doesn’t have editor access/)).toBeVisible();
  } finally {
    await otherContext.close();
  }
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(picker).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Editor sign in" }),
  ).toBeVisible();
});

test("failed writes roll back and concurrent edits are not overwritten", async ({
  context,
  page,
}) => {
  const state = store();
  await backend(context, state, ownerId);
  await page.goto("/?city=moscow-russia");
  const picker = page.getByLabel("Map status", { exact: true });
  await expect(picker).toBeEnabled();
  state.failWrite = true;
  await picker.selectOption("Update");
  await expect(page.getByRole("alert")).toContainText("wasn’t saved");
  await expect(picker).toHaveValue("Complete");
  expect(state.rows.get("moscow-russia")!.map_status).toBe("Complete");
  state.failWrite = false;
  state.rows.set(
    "moscow-russia",
    changed(state.rows.get("moscow-russia")!, "Unfinished"),
  );
  await expect(picker).toBeEnabled();
  await picker.selectOption("Update");
  await expect(picker).toHaveValue("Unfinished");
  await expect(page.getByRole("alert")).toContainText("wasn’t saved");
  expect(state.rows.get("moscow-russia")!.map_status).toBe("Unfinished");
});

test("database outages leave the collection browsable and pause editing", async ({
  context,
  page,
}) => {
  const state = store();
  state.failRead = true;
  await backend(context, state, ownerId);
  await page.goto("/?city=moscow-russia");
  await expect(
    page.getByText(/Couldn’t refresh the saved collection/),
  ).toBeVisible();
  await expect(page.getByLabel("Map status", { exact: true })).toBeDisabled();
  state.failRead = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByLabel("Map status", { exact: true })).toBeEnabled();
});

test("a refresh that started before a save cannot replace the confirmed status", async ({
  context,
  page,
}) => {
  const state = store();
  await backend(context, state, ownerId);
  await page.goto("/?city=moscow-russia");
  const picker = page.getByLabel("Map status", { exact: true });
  await expect(picker).toBeEnabled();
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  let intercepted = false;
  await page.route(`${fixtureOrigin}/rest/v1/cities?*`, async (route) => {
    if (route.request().method() !== "GET" || intercepted)
      return route.fallback();
    intercepted = true;
    const old = [...state.rows.values()].map((row) => ({ ...row }));
    started();
    await held;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(old),
      headers: { "access-control-allow-origin": "*" },
    });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await requested;
  await picker.selectOption("Update");
  await expect(page.locator(".editor-tools")).toContainText("Saved");
  const response = page.waitForResponse(
    (r) =>
      r.url().startsWith(`${fixtureOrigin}/rest/v1/cities?`) &&
      r.request().method() === "GET",
  );
  release();
  await (await response).finished();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(picker).toHaveValue("Update");
});

test("browser changes require review and only selected statuses are imported", async ({
  context,
  page,
}) => {
  const state = store();
  await backend(context, state, ownerId, {
    "moscow-russia": "Update",
    "warsaw-poland": "Unfinished",
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import saved (2)", exact: true })
    .click();
  expect(state.imports).toBe(0);
  await page.getByRole("checkbox", { name: /Warsaw/ }).uncheck();
  await page.getByRole("button", { name: "Import selected (1)" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(state.imports).toBe(1);
  expect(state.rows.get("moscow-russia")!.map_status).toBe("Update");
  expect(state.rows.get("warsaw-poland")!.map_status).toBe("Complete");
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      COLLECTION_STATUS_STORAGE_KEY,
    ),
  ).toEqual({ "warsaw-poland": "Unfinished" });
});

test("a stale reviewed import preserves browser data and imports nothing", async ({
  context,
  page,
}) => {
  const state = store();
  const local = { "moscow-russia": "Update", "warsaw-poland": "Unfinished" };
  await backend(context, state, ownerId, local);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import saved (2)", exact: true })
    .click();
  state.rows.set(
    "warsaw-poland",
    changed(state.rows.get("warsaw-poland")!, "Update"),
  );
  await page.getByRole("button", { name: "Import selected (2)" }).click();
  await expect(page.getByText(/Nothing was imported/)).toBeVisible();
  expect(state.rows.get("moscow-russia")!.map_status).toBe("Complete");
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      COLLECTION_STATUS_STORAGE_KEY,
    ),
  ).toEqual(local);
});

test("editor sign-in requests an existing account link and export contains the saved collection", async ({
  context,
  page,
}) => {
  const state = store();
  await backend(context, state);
  await page.goto("/");
  await page.getByRole("button", { name: "Editor sign in" }).click();
  await page.getByLabel("Email address").fill("editor@example.test");
  await page.getByRole("button", { name: "Email sign-in link" }).click();
  await expect(page.getByText(/Check your email/)).toBeVisible();
  expect(state.otp?.create_user).toBe(false);
  expect(state.redirect).toBe("http://127.0.0.1:5180/");
  await page.getByRole("button", { name: "Close editor dialog" }).click();
});

test("the editor can export every city with saved statuses and nullable coordinates", async ({
  context,
  page,
}) => {
  const state = store();
  state.rows.set(
    "moscow-russia",
    changed(state.rows.get("moscow-russia")!, "Update"),
  );
  await backend(context, state, ownerId);
  await page.goto("/");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export collection CSV" }).click();
  const path = await (await download).path();
  const rows = parse(readFileSync(path!, "utf8"), {
    columns: true,
    bom: true,
  }) as Array<Record<string, string>>;
  expect(rows).toHaveLength(321);
  expect(rows.find((c) => c.CityId === "moscow-russia")!.Status).toBe("Update");
  expect(rows.filter((c) => c.Latitude && c.Longitude)).toHaveLength(319);
});
