import type { MouseEvent } from "react";
import { entryInCountry, isPlace } from "./places";
import type { City } from "./types";

function currentParams() {
  return new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  );
}

function profileHref(params: URLSearchParams) {
  const hash = typeof window === "undefined" ? "" : window.location.hash;
  return `?${params}${hash}`;
}

export function countryProfileHref(code: string) {
  const params = currentParams();
  for (const key of ["city", "place", "view"]) params.delete(key);
  params.set("panel", "countries");
  params.set("country", code);
  return profileHref(params);
}

export function cityProfileHref(city: City) {
  const params = currentParams();
  params.set(isPlace(city) ? "place" : "city", city.id);
  params.delete(isPlace(city) ? "city" : "place");
  params.delete("view");
  if (params.get("country") && entryInCountry(city, params.get("country")!)) {
    params.set("panel", "countries");
  } else {
    params.delete("country");
    params.delete("panel");
  }
  return profileHref(params);
}

export function followProfileLink(
  event: MouseEvent<HTMLAnchorElement>,
  navigate: () => void,
) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  event.preventDefault();
  navigate();
}
