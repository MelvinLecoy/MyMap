import { chromium, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Capture the actual profile component; preview-only fonts never enter the app bundle.
const output = resolve(
  process.env.PROFILE_PREVIEW_OUTPUT ?? ".cache/country-profile-fonts",
);
mkdirSync(output, { recursive: true });
const fonts = [
  {
    id: "a",
    name: "Softer Nunito",
    family: "Nunito Variable",
    description: "Lighter weights and more open spacing",
  },
  {
    id: "b",
    name: "Alegreya Sans",
    family: "Alegreya Sans",
    description: "Flowing humanist shapes · selected body text",
  },
];
const countries = [
  { code: "GB", label: "UK · original country-name font" },
  { code: "EG", label: "Egypt · short name" },
  { code: "AE", label: "UAE · wrapped name" },
  { code: "RU", label: "Russia · unvisited" },
  { code: "PT", label: "Portugal · #10 milestone" },
];
const nunitoBytes = readFileSync(
  "node_modules/@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2",
).toString("base64");
const previewFontFaces = `@font-face{font-family:"Nunito Variable";src:url(data:font/woff2;base64,${nunitoBytes}) format("woff2");font-weight:200 1000;font-style:normal;font-display:block}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-webgl"],
});
const shots: Record<string, Record<string, string>> = {};
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1300 },
    deviceScaleFactor: 2,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://gbgkxgdreftzhxeprryc.supabase.co/**", (route) =>
    route.abort(),
  );
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.abort(),
  );
  for (const country of countries) {
    await page.goto(
      `http://127.0.0.1:4173/?panel=countries&country=${country.code}`,
    );
    await expect(page.locator('[data-metric="gdpPerCapita"]')).toHaveCount(1);
    await page.addStyleTag({
      content: previewFontFaces,
    });
    shots[country.code] = {};
    for (const font of fonts) {
      await page.evaluate(async (family) => {
        document
          .querySelector<HTMLElement>(".country-place-card")!
          .style.setProperty(
            "--country-profile-font",
            `"${family}",sans-serif`,
          );
        await Promise.all(
          [400, 500, 700].map((weight) =>
            document.fonts.load(`${weight} 14px "${family}"`),
          ),
        );
        await document.fonts.ready;
        document.fonts.dispatchEvent(new Event("loadingdone"));
      }, font.family);
      await page.waitForFunction(
        () =>
          document
            .querySelector(".country-place-card h1")!
            .getBoundingClientRect().width > 0,
      );
      const filename = `${font.id}-${country.code.toLowerCase()}.png`;
      const capture = await page
        .locator(".country-place-card")
        .screenshot({ path: resolve(output, filename) });
      shots[country.code][font.id] =
        `data:image/png;base64,${capture.toString("base64")}`;
    }
  }
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Country profile · font options</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f5f7f4;color:#263c37;font-family:system-ui,sans-serif}main{max-width:1160px;margin:auto;padding:30px 22px}h1{font-size:26px;letter-spacing:-.04em;margin:0 0 8px}p{margin:0;color:#657970;font-size:13px}nav{display:flex;gap:8px;flex-wrap:wrap;margin:24px 0}button{font:inherit;font-size:13px;padding:9px 13px;border:1px solid #cbdad0;border-radius:8px;background:white;color:#38584a;cursor:pointer}button[aria-pressed=true]{background:#dcebe0;border-color:#7fa68c}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;align-items:start}article header{display:flex;align-items:baseline;gap:9px;margin:0 0 6px}article strong{display:grid;place-items:center;background:#e0ebe2;border-radius:50%;height:24px;width:24px;font-size:12px}h2{margin:0;font-size:18px}article p{font-size:11px;margin:0 0 12px}img{display:block;width:100%;height:auto;border-radius:12px}footer{margin-top:20px;font-size:12px;color:#64766d}@media(max-width:700px){.grid{grid-template-columns:1fr}main{max-width:430px}article{margin-bottom:16px}}</style>
<main><h1>Country profile · softer body text</h1><p>The original country-name font stays the same. Compare only the statistics, labels and facts below it.</p><nav>${countries.map((country, i) => `<button data-country="${country.code}" aria-pressed="${i === 0}">${country.label}</button>`).join("")}</nav><div class="grid">${fonts.map((font) => `<article><header><strong>${font.id.toUpperCase()}</strong><h2>${font.name}</h2></header><p>${font.description}</p><img id="${font.id}" src="${shots.GB[font.id]}" alt="${font.name} body text with original country title"></article>`).join("")}</div><footer>Original country-title font · GDP per capita by default · square stats box · dashed raw/index divider · inset, vertically centered badges · grey unvisited countries · crowns at every tenth country</footer></main>
<script>const shots=${JSON.stringify(shots)};for(const button of document.querySelectorAll('nav button'))button.onclick=()=>{for(const other of document.querySelectorAll('nav button'))other.setAttribute('aria-pressed',String(other===button));for(const [id,src]of Object.entries(shots[button.dataset.country]))document.getElementById(id).src=src};</script></html>`;
  writeFileSync(resolve(output, "preview.html"), html);
  const comparison = await browser.newPage({
    viewport: { width: 1160, height: 1200 },
    deviceScaleFactor: 1.5,
  });
  await comparison.setContent(html);
  for (const country of countries) {
    await comparison.locator(`button[data-country="${country.code}"]`).click();
    await comparison
      .locator("img")
      .evaluateAll((images) =>
        Promise.all(
          images.map((image) => (image as HTMLImageElement).decode()),
        ),
      );
    await comparison.locator("main").screenshot({
      path: resolve(output, `comparison-${country.code.toLowerCase()}.png`),
    });
  }
  console.log(
    `Saved softer-body-text previews and a self-contained preview.html to ${output}`,
  );
} finally {
  await browser.close();
}
