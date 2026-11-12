import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
const { demo } = JSON.parse(
  readFileSync(new URL("./src/generated/atlas.json", import.meta.url), "utf8"),
) as { demo: boolean };
const cloudTest = process.env.ATLAS_CLOUD_TEST === "1";
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: cloudTest
    ? "**/cloud.spec.ts"
    : demo
      ? "**/atlas.spec.ts"
      : "**/collection.spec.ts",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: cloudTest ? "http://127.0.0.1:5180" : "http://127.0.0.1:4173",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH ||
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
      args: [
        "--no-sandbox",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        ...(cloudTest ? ["--disable-webgl"] : []),
      ],
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: cloudTest
      ? "npx vite --mode cloud-test --port 5180 --strictPort"
      : "npm run preview -- --port 4173",
    url: cloudTest ? "http://127.0.0.1:5180" : "http://127.0.0.1:4173",
    reuseExistingServer: !cloudTest && !process.env.CI,
    env: cloudTest
      ? {
          VITE_SUPABASE_URL: "https://atlas-test.supabase.co",
          VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser_fixture",
        }
      : undefined,
  },
});
