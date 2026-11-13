import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { fromCityRow, type CityRow } from "./cloud-data";
import {
  attachCityVisits,
  readCitySnapshot,
  type CityVisitRow,
} from "./city-cloud-data";
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

export const MIN_PASSWORD_LENGTH = 12;

export function useRemoteAtlas(
  initial: AtlasData,
  client: SupabaseClient | null,
) {
  const [rows, setRows] = useState<CityRow[]>([]);
  const [visits, setVisits] = useState<CityVisitRow[]>([]);
  const rowsRef = useRef(rows);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(Boolean(client));
  const [loadError, setLoadError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authVersion, setAuthVersion] = useState(0);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [pending, setPending] = useState<Record<string, MapStatus>>({});
  const pendingRef = useRef(new Set<string>());
  const [saveError, setSaveError] = useState<{
    id: string;
    message: string;
  } | null>(null);
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
      const result = await client.rpc("atlas_city_snapshot");
      if (result.error) throw result.error;
      const snapshot = readCitySnapshot(result.data);
      if (alive.current && version === writeVersion.current) {
        replaceRows(snapshot.cities);
        setVisits(snapshot.visits);
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
    client.auth.initialize().then(({ error }) => {
      if (alive.current && error)
        setAuthError(
          "That sign-in link is invalid or expired. Request a new link and open it in the same browser.",
        );
    });
    client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!alive.current) return;
        setUser(data.session?.user ?? null);
        if (error)
          setAuthError("Your session couldn’t be restored. Sign in again.");
      })
      .catch(() => {
        if (alive.current)
          setAuthError("Couldn’t check your sign-in. Try signing in again.");
      });
    const { data: subscription } = client.auth.onAuthStateChange(
      (event, session) => {
        setCanEdit(false);
        setUser(session?.user ?? null);
        // Supabase can emit a new event with the same user object. Always
        // recheck permissions instead of leaving the editor disabled.
        setAuthVersion((version) => version + 1);
        if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
        if (event === "SIGNED_OUT") {
          setPasswordRecovery(false);
          setAuthError("");
        }
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
  }, [client, user, authVersion]);

  const saveStatus = useCallback(
    async (id: string, status: MapStatus) => {
      if (
        !client ||
        !canEdit ||
        signingOut ||
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
    [client, canEdit, signingOut, ready, loadError, refresh, replaceRows],
  );

  const cities = useMemo(
    () =>
      (ready
        ? attachCityVisits(rows.map(fromCityRow), visits)
        : initial.cities
      ).map((city) =>
        pending[city.id] ? { ...city, status: pending[city.id] } : city,
      ),
    [initial, ready, rows, visits, pending],
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
        signingOut ||
        loadError ||
        !changes.length ||
        pendingRef.current.size
      )
        throw new Error("Wait for other saves to finish, then try again.");
      changes.forEach((c) => pendingRef.current.add(c.id));
      writeVersion.current++;
      setPending(Object.fromEntries(changes.map((c) => [c.id, c.status])));
      setSaveError(null);
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
    [client, canEdit, signingOut, loadError, refresh, replaceRows],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!client) throw new Error("Sign-in is unavailable. Try again later.");
      const { error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error)
        throw new Error(
          error.code === "invalid_credentials"
            ? "Email or password is incorrect. Try again or use an email link."
            : error.status === 429
              ? "Too many sign-in attempts. Wait a moment and try again."
              : "Couldn’t sign in. Check your connection and try again.",
        );
    },
    [client],
  );

  const sendSignInLink = useCallback(
    async (email: string) => {
      if (!client) throw new Error("Sign-in is unavailable. Try again later.");
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

  const resetPassword = useCallback(
    async (email: string) => {
      if (!client) throw new Error("Password recovery is unavailable.");
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/`,
      });
      if (error)
        throw new Error(
          "Couldn’t send a reset link. Wait a moment and try again.",
        );
    },
    [client],
  );

  const updatePassword = useCallback(
    async (password: string) => {
      if (!client || !user)
        throw new Error("Sign in again before setting your password.");
      if (password.length < MIN_PASSWORD_LENGTH)
        throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      const { error } = await client.auth.updateUser({ password });
      if (error)
        throw new Error(
          error.code === "same_password"
            ? "Choose a password different from your current one."
            : error.code === "reauthentication_needed" ||
                error.code === "reauthentication_not_valid"
              ? "Sign in again with a fresh email link before changing your password."
              : "Couldn’t save your password. Your password hasn’t changed; try again.",
        );
      setPasswordRecovery(false);
    },
    [client, user],
  );

  const dismissPasswordRecovery = useCallback(
    () => setPasswordRecovery(false),
    [],
  );

  const signOut = useCallback(async () => {
    if (!client) return;
    setSigningOut(true);
    try {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) {
        // Local sign-out clears this browser before remote session revocation.
        // A network failure must not report that an already read-only browser
        // is still in Editor mode.
        const current = await client.auth.getSession();
        if (current.error || current.data.session)
          throw new Error("Couldn’t sign out. Try again.");
      }
      setCanEdit(false);
      setUser(null);
    } finally {
      setSigningOut(false);
    }
  }, [client]);

  return {
    enabled: Boolean(client),
    cities,
    ready,
    loading,
    loadError,
    user,
    canEdit: canEdit && !signingOut,
    signingOut,
    authError,
    passwordRecovery,
    pending,
    saveError,
    migration,
    refresh,
    saveStatus,
    signIn,
    sendSignInLink,
    resetPassword,
    updatePassword,
    dismissPasswordRecovery,
    signOut,
    importStatuses,
  };
}

export type RemoteAtlas = ReturnType<typeof useRemoteAtlas>;
