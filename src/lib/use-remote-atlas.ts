import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { fromCityRow, type CityRow } from "./cloud-data";
import {
  COLLECTION_STATUS_STORAGE_KEY,
  readStatusOverrides,
} from "./status-storage";
import type { AtlasData, MapStatus } from "./types";

export interface StatusImport {
  id: string;
  name: string;
  previous: MapStatus;
  status: MapStatus;
  updated_at: string;
}

export function useRemoteAtlas(
  initial: AtlasData,
  client: SupabaseClient | null,
) {
  const [rows, setRows] = useState<CityRow[]>([]);
  const rowsRef = useRef(rows);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(Boolean(client));
  const [loadError, setLoadError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [authError, setAuthError] = useState("");
  const [pending, setPending] = useState<Record<string, MapStatus>>({});
  const pendingRef = useRef(new Set<string>());
  const [saveError, setSaveError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [saved, setSaved] = useState(false);
  const alive = useRef(true);
  const fetching = useRef(false);
  const fetchAgain = useRef(false);
  const writeVersion = useRef(0);

  const replaceRows = useCallback((next: CityRow[]) => {
    rowsRef.current = next;
    setRows(next);
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    if (!client) return;
    if (fetching.current) {
      fetchAgain.current = true;
      return;
    }
    fetching.current = true;
    const version = writeVersion.current;
    try {
      const next: CityRow[] = [];
      for (let offset = 0; ; offset += 1000) {
        const result = await client
          .from("cities")
          .select("*")
          .order("id")
          .range(offset, offset + 999);
        if (result.error) throw result.error;
        const batch = result.data as CityRow[];
        batch.forEach(fromCityRow);
        next.push(...batch);
        if (batch.length < 1000) break;
      }
      if (!next.length || new Set(next.map((c) => c.id)).size !== next.length)
        throw new Error("The collection is empty or has duplicate IDs.");
      if (alive.current && version === writeVersion.current) {
        replaceRows(next);
        setReady(true);
        setLoadError("");
      }
    } catch {
      if (alive.current)
        setLoadError(
          "Couldn’t refresh the saved collection. Showing the last available version; editing is paused. Try again.",
        );
    } finally {
      fetching.current = false;
      if (alive.current) setLoading(false);
      if (
        alive.current &&
        (fetchAgain.current || version !== writeVersion.current)
      ) {
        fetchAgain.current = false;
        queueMicrotask(() => {
          if (alive.current) void refresh();
        });
      }
    }
  }, [client, replaceRows]);

  useEffect(() => {
    alive.current = true;
    if (!client) return;
    void refresh();
    client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!alive.current) return;
        setUser(data.session?.user ?? null);
        if (error)
          setAuthError("The sign-in link couldn’t be used. Request a new one.");
      })
      .catch(() => {
        if (alive.current)
          setAuthError("Couldn’t check your sign-in. Try signing in again.");
      });
    const { data: subscription } = client.auth.onAuthStateChange(
      (_event, session) => {
        setCanEdit(false);
        setUser(session?.user ?? null);
      },
    );
    const onFocus = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const timer = window.setInterval(onFocus, 30000);
    return () => {
      alive.current = false;
      subscription.subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.clearInterval(timer);
    };
  }, [client, refresh]);

  useEffect(() => {
    setCanEdit(false);
    if (!client || !user) return;
    let cancelled = false;
    client.rpc("atlas_can_edit").then(({ data, error }) => {
      if (cancelled) return;
      setCanEdit(!error && data === true);
      setAuthError(
        error
          ? "Couldn’t check editor access. Sign in again."
          : data === true
            ? ""
            : "This account can view the atlas but doesn’t have editor access.",
      );
    });
    return () => {
      cancelled = true;
    };
  }, [client, user]);

  const saveStatus = useCallback(
    async (id: string, status: MapStatus) => {
      if (
        !client ||
        !canEdit ||
        !ready ||
        loadError ||
        pendingRef.current.has(id)
      )
        return;
      const before = rowsRef.current.find((c) => c.id === id);
      if (!before?.updated_at || before.map_status === status) return;
      pendingRef.current.add(id);
      writeVersion.current++;
      setPending((p) => ({ ...p, [id]: status }));
      setSaved(false);
      setSaveError(null);
      try {
        const { data, error } = await client
          .from("cities")
          .update({ map_status: status })
          .eq("id", id)
          .eq("updated_at", before.updated_at)
          .select("*")
          .single();
        if (error || !data) throw error ?? new Error("No saved row");
        fromCityRow(data as CityRow);
        if (alive.current) {
          replaceRows(
            rowsRef.current.map((row) =>
              row.id === id ? (data as CityRow) : row,
            ),
          );
          setSaved(true);
        }
      } catch {
        if (alive.current) {
          setSaveError({
            id,
            message:
              "Status wasn’t saved. Your access or this city may have changed. Refresh and try again.",
          });
          await refresh();
        }
      } finally {
        pendingRef.current.delete(id);
        writeVersion.current++;
        if (alive.current)
          setPending((p) => {
            const next = { ...p };
            delete next[id];
            return next;
          });
      }
    },
    [client, canEdit, ready, loadError, refresh, replaceRows],
  );

  const cities = useMemo(
    () =>
      (ready ? rows.map(fromCityRow) : initial.cities).map((city) =>
        pending[city.id] ? { ...city, status: pending[city.id] } : city,
      ),
    [initial, ready, rows, pending],
  );

  const migration = useMemo<StatusImport[]>(() => {
    if (!ready || !canEdit) return [];
    const local = readStatusOverrides(COLLECTION_STATUS_STORAGE_KEY);
    return rows.flatMap((row) =>
      local[row.id] && local[row.id] !== row.map_status && row.updated_at
        ? [
            {
              id: row.id,
              name: row.name,
              previous: row.map_status,
              status: local[row.id],
              updated_at: row.updated_at,
            },
          ]
        : [],
    );
  }, [ready, canEdit, rows]);

  const importStatuses = useCallback(
    async (changes: StatusImport[]) => {
      if (
        !client ||
        !canEdit ||
        loadError ||
        !changes.length ||
        pendingRef.current.size
      )
        throw new Error("Wait for other saves to finish, then try again.");
      changes.forEach((c) => pendingRef.current.add(c.id));
      writeVersion.current++;
      setPending(Object.fromEntries(changes.map((c) => [c.id, c.status])));
      setSaveError(null);
      setSaved(false);
      try {
        const { data, error } = await client.rpc("atlas_import_statuses", {
          changes: changes.map(({ id, status, updated_at }) => ({
            id,
            status,
            updated_at,
          })),
        });
        if (error || !Array.isArray(data) || data.length !== changes.length)
          throw error ?? new Error("Incomplete import");
        const updated = new Map(
          (data as CityRow[]).map((row) => {
            fromCityRow(row);
            return [row.id, row];
          }),
        );
        if (alive.current) {
          replaceRows(rowsRef.current.map((row) => updated.get(row.id) ?? row));
          setSaved(true);
        }
        try {
          const remaining = readStatusOverrides(COLLECTION_STATUS_STORAGE_KEY);
          changes.forEach((c) => {
            if (remaining[c.id] === c.status) delete remaining[c.id];
          });
          if (Object.keys(remaining).length)
            localStorage.setItem(
              COLLECTION_STATUS_STORAGE_KEY,
              JSON.stringify(remaining),
            );
          else localStorage.removeItem(COLLECTION_STATUS_STORAGE_KEY);
        } catch {
          /* Confirmed database saves remain valid if browser storage is unavailable. */
        }
      } catch {
        await refresh();
        throw new Error(
          "Nothing was imported. A city may have changed; close this window, refresh, and review again.",
        );
      } finally {
        changes.forEach((c) => pendingRef.current.delete(c.id));
        writeVersion.current++;
        if (alive.current) setPending({});
      }
    },
    [client, canEdit, loadError, refresh, replaceRows],
  );

  const signIn = useCallback(
    async (email: string) => {
      if (!client) return;
      const { error } = await client.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/`,
        },
      });
      if (error)
        throw new Error(
          "Couldn’t send a sign-in link. Check the address or try again later.",
        );
    },
    [client],
  );

  const signOut = useCallback(async () => {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw new Error("Couldn’t sign out. Try again.");
    setCanEdit(false);
    setUser(null);
    setSaved(false);
  }, [client]);

  return {
    enabled: Boolean(client),
    cities,
    ready,
    loading,
    loadError,
    user,
    canEdit,
    authError,
    pending,
    saveError,
    saved,
    migration,
    refresh,
    saveStatus,
    signIn,
    signOut,
    importStatuses,
  };
}

export type RemoteAtlas = ReturnType<typeof useRemoteAtlas>;
