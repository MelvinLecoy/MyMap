import { MAP_STATUSES, type MapStatus } from "./types";

export const MAP_STATUS_STORAGE_KEY = "elsewhere:map-statuses:v1";
export const COLLECTION_STATUS_STORAGE_KEY = `${MAP_STATUS_STORAGE_KEY}:collection`;
export type MapStatusOverrides = Record<string, MapStatus>;

export function parseStatusOverrides(value: string | null): MapStatusOverrides {
  try {
    const parsed: unknown = JSON.parse(value ?? "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([id, status]) =>
          id.length > 0 &&
          MAP_STATUSES.some((supported) => supported === status),
      ),
    );
  } catch {
    return {};
  }
}

export function readStatusOverrides(
  key = MAP_STATUS_STORAGE_KEY,
): MapStatusOverrides {
  try {
    return parseStatusOverrides(localStorage.getItem(key));
  } catch {
    return {};
  }
}

export function saveStatusOverrides(
  overrides: MapStatusOverrides,
  key = MAP_STATUS_STORAGE_KEY,
): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(overrides));
    return true;
  } catch {
    return false;
  }
}
