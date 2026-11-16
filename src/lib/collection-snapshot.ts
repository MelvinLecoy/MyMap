import type { SupabaseClient } from "@supabase/supabase-js";
import { readCitySnapshot, type CitySnapshot } from "./city-cloud-data";
import {
  fromCountrySnapshot,
  type CountrySnapshot,
} from "./country-cloud-data";
import { fromPlaceRow, type PlaceRow } from "./places";

export interface CollectionSnapshot {
  version: 1;
  cities: CitySnapshot;
  countries: CountrySnapshot;
  places: PlaceRow[];
}
type Part = Exclude<keyof CollectionSnapshot, "version">;
const legacyFunctions = {
  cities: "atlas_city_snapshot",
  countries: "atlas_country_snapshot",
  places: "atlas_places_snapshot",
} as const;
interface ReaderState {
  inFlight?: Promise<CollectionSnapshot | null>;
  previous: Partial<CollectionSnapshot>;
  fingerprints: Partial<Record<Part, string>>;
}
const readers = new WeakMap<SupabaseClient, ReaderState>();

/** Post-write reads must never join another hook's pre-write request. */
export function invalidateCollectionReads(client: SupabaseClient) {
  // Existing readers keep their own state until completion; they cannot replace
  // the new reader's confirmed values or clear its in-flight request.
  readers.delete(client);
}

function readerState(client: SupabaseClient) {
  let state = readers.get(client);
  if (!state) {
    state = { previous: {}, fingerprints: {} };
    readers.set(client, state);
  }
  return state;
}

/** Keep React's existing values only after a fresh, successful database read. */
function stablePart<K extends Part>(
  state: ReaderState,
  part: K,
  value: CollectionSnapshot[K],
): CollectionSnapshot[K] {
  const fingerprint = JSON.stringify(value);
  if (fingerprint === state.fingerprints[part])
    return state.previous[part] as CollectionSnapshot[K];
  state.fingerprints[part] = fingerprint;
  state.previous[part] = value;
  return value;
}

function validatePart<K extends Part>(
  part: K,
  value: unknown,
): CollectionSnapshot[K] {
  if (part === "cities")
    return readCitySnapshot(value) as CollectionSnapshot[K];
  if (part === "countries") {
    fromCountrySnapshot(value);
    return value as CollectionSnapshot[K];
  }
  if (!Array.isArray(value)) throw new Error("Invalid place snapshot.");
  value.forEach((row) => fromPlaceRow(row as PlaceRow));
  return value as CollectionSnapshot[K];
}

/** A malformed combined response must not become a mixture of partial reads. */
export function readCollectionSnapshot(value: unknown): CollectionSnapshot {
  if (!value || typeof value !== "object")
    throw new Error("Invalid collection snapshot.");
  const snapshot = value as CollectionSnapshot;
  if (snapshot.version !== 1)
    throw new Error("Unsupported collection snapshot version.");
  const cities = validatePart("cities", snapshot.cities);
  const countries = validatePart("countries", snapshot.countries);
  const places = validatePart("places", snapshot.places);
  const codes = new Set(countries.countries.map((country) => country.code));
  if (
    cities.cities.some(
      (city) => city.country_code && !codes.has(city.country_code),
    ) ||
    places.some((place) =>
      place.countries.some((country) => !codes.has(country.code)),
    )
  )
    throw new Error("Collection snapshot references an unknown country.");
  return { version: 1, cities, countries, places };
}

function missingFunction(error: { code?: string }) {
  return error.code === "PGRST202" || error.code === "42883";
}

function combinedSnapshot(client: SupabaseClient, state: ReaderState) {
  if (state.inFlight) return state.inFlight;
  const request = (async () => {
    const { data, error } = await client.rpc("atlas_collection_snapshot");
    if (error) {
      if (missingFunction(error)) return null;
      throw error;
    }
    const snapshot = readCollectionSnapshot(data);
    return {
      version: 1 as const,
      cities: stablePart(state, "cities", snapshot.cities),
      countries: stablePart(state, "countries", snapshot.countries),
      places: stablePart(state, "places", snapshot.places),
    };
  })();
  state.inFlight = request;
  const clear = () => {
    if (state.inFlight === request) state.inFlight = undefined;
  };
  // Handle both outcomes without leaving a rejected cleanup promise behind.
  void request.then(clear, clear);
  return request;
}

/**
 * The three collection hooks share one in-flight MVCC read, never a TTL cache.
 * Older deployments retain their independent legacy endpoints until migrated.
 * Authentication, transport and validation failures never trigger that fallback.
 */
export async function loadCollectionPart<K extends Part>(
  client: SupabaseClient,
  part: K,
): Promise<CollectionSnapshot[K]> {
  const state = readerState(client);
  const combined = await combinedSnapshot(client, state);
  if (combined) return combined[part];
  const { data, error } = await client.rpc(legacyFunctions[part]);
  if (error) throw error;
  return stablePart(state, part, validatePart(part, data));
}
