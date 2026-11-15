import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromPlaceRow, type PlaceRow } from "./places";
import type { MapStatus, Place } from "./types";

export function useRemotePlaces(
  initial: Place[],
  client: SupabaseClient | null,
  canEdit: boolean,
) {
  const [places, setPlaces] = useState(initial);
  const [ready, setReady] = useState(!client);
  const [loadError, setLoadError] = useState("");
  const [pending, setPending] = useState<Record<string, MapStatus>>({});
  const [saveError, setSaveError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const alive = useRef(true),
    fetching = useRef(false),
    writeVersion = useRef(0),
    fingerprint = useRef<string | null>(null),
    pendingIds = useRef(new Set<string>());
  if (fingerprint.current === null)
    fingerprint.current = JSON.stringify(initial);
  const refresh = useCallback(async () => {
    if (!client || fetching.current) return;
    fetching.current = true;
    const version = writeVersion.current;
    try {
      const { data, error } = await client.rpc("atlas_places_snapshot");
      if (error || !Array.isArray(data))
        throw error ?? new Error("Invalid place snapshot");
      const next = (data as PlaceRow[]).map(fromPlaceRow),
        key = JSON.stringify(next);
      if (alive.current && version === writeVersion.current) {
        if (key !== fingerprint.current) {
          fingerprint.current = key;
          setPlaces(next);
        }
        setReady(true);
        setLoadError("");
      }
    } catch {
      if (alive.current)
        setLoadError(
          "Couldn’t refresh the saved places. Showing the last available version; editing is paused.",
        );
    } finally {
      fetching.current = false;
    }
  }, [client]);
  useEffect(() => {
    alive.current = true;
    if (!client) return;
    void refresh();
    const onFocus = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const timer = setInterval(onFocus, 30000);
    return () => {
      alive.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [client, refresh]);
  const saveStatus = useCallback(
    async (id: string, status: MapStatus) => {
      if (
        !client ||
        !canEdit ||
        !ready ||
        loadError ||
        pendingIds.current.has(id)
      )
        return;
      pendingIds.current.add(id);
      writeVersion.current++;
      setPending((current) => ({ ...current, [id]: status }));
      setSaveError(null);
      try {
        const { data: before, error: readError } = await client
          .from("places")
          .select("updated_at")
          .eq("id", id)
          .single();
        if (readError || !before)
          throw readError ?? new Error("Place not found");
        const { data, error } = await client
          .from("places")
          .update({ map_status: status })
          .eq("id", id)
          .eq("updated_at", before.updated_at)
          .select("id")
          .single();
        if (error || !data) throw error ?? new Error("Place changed");
        writeVersion.current++;
        fingerprint.current = "";
        if (alive.current)
          setPlaces((current) =>
            current.map((place) =>
              place.id === id ? { ...place, status } : place,
            ),
          );
        void refresh();
      } catch {
        writeVersion.current++;
        if (alive.current)
          setSaveError({
            id,
            message:
              "Status wasn’t saved. Your access or this place may have changed. Refresh and try again.",
          });
        await refresh();
      } finally {
        pendingIds.current.delete(id);
        if (alive.current)
          setPending((current) => {
            const next = { ...current };
            delete next[id];
            return next;
          });
      }
    },
    [client, canEdit, ready, loadError, refresh],
  );
  return {
    places: useMemo(
      () =>
        places.map((place) =>
          pending[place.id] ? { ...place, status: pending[place.id] } : place,
        ),
      [places, pending],
    ),
    ready,
    loadError,
    pending,
    saveError,
    saveStatus,
  };
}
