import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
const { demo } = JSON.parse(
  readFileSync(new URL("./src/generated/atlas.json", import.meta.url), "utf8"),
) as { demo: boolean };
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: demo ? "**/atlas.spec.ts" : "**/collection.spec.ts",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
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
      ],
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run preview -- --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
});
