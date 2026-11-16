import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CountrySeed } from "./countries";
import { fromCountrySnapshot } from "./country-cloud-data";
import { loadCollectionPart } from "./collection-snapshot";

export function useRemoteCountries(
  initial: CountrySeed[],
  client: SupabaseClient | null,
) {
  const [countries, setCountries] = useState(initial);
  const [error, setError] = useState("");
  const alive = useRef(true),
    fetching = useRef(false),
    fingerprint = useRef("");
  const refresh = useCallback(async () => {
    if (!client || fetching.current) return;
    fetching.current = true;
    try {
      const data = await loadCollectionPart(client, "countries");
      const next = fromCountrySnapshot(data);
      if (
        next.length !== initial.length ||
        initial.some((c) => !next.some((n) => n.code === c.code))
      )
        throw new Error("Incomplete country snapshot.");
      if (alive.current) {
        const key = JSON.stringify(next);
        if (key !== fingerprint.current) {
          fingerprint.current = key;
          setCountries(next);
        }
        setError("");
      }
    } catch {
      if (alive.current)
        setError(
          "Couldn’t refresh country history. Showing the last available version.",
        );
    } finally {
      fetching.current = false;
    }
  }, [client, initial]);
  useEffect(() => {
    alive.current = true;
    if (!client) return;
    void refresh();
    const focus = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    const timer = window.setInterval(focus, 30000);
    return () => {
      alive.current = false;
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
      window.clearInterval(timer);
    };
  }, [client, refresh]);
  return { countries, error, refresh };
}
