import type { Page } from "@playwright/test";
import { MAP_STATUS_LABELS, type MapStatus } from "../../src/lib/types";

export function mapFilterButton(page: Page, status: MapStatus) {
  return page
    .getByRole("group", { name: "Map progress filters" })
    .getByRole("button", {
      name: new RegExp(`^${MAP_STATUS_LABELS[status]} \\d+$`),
    });
}

export async function setMapFilter(page: Page, status: MapStatus | "all") {
  if (status === "all") {
    const active = page
      .getByRole("group", { name: "Map progress filters" })
      .getByRole("button", { pressed: true });
    if (await active.count()) await active.click();
  } else {
    const button = mapFilterButton(page, status);
    if ((await button.getAttribute("aria-pressed")) !== "true")
      await button.click();
  }
}

export async function chooseFilter(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
