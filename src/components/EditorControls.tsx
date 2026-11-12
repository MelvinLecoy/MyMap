import { useRef, useState } from "react";
import { Download, LogIn, LogOut, X } from "lucide-react";
import { exportCitiesCsv } from "../lib/cloud-data";
import type { RemoteAtlas, StatusImport } from "../lib/use-remote-atlas";

export default function EditorControls({ cloud }: { cloud: RemoteAtlas }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<"login" | "import">("login");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState<StatusImport[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const saving = Object.keys(cloud.pending).length > 0;
  const open = (next: typeof view) => {
    setView(next);
    setMessage("");
    if (next === "import") {
      setReviewed(cloud.migration);
      setChosen(new Set(cloud.migration.map((c) => c.id)));
    }
    dialog.current?.showModal();
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob(["\ufeff", exportCitiesCsv(cloud.cities)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `ciudad-mundo-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      {cloud.loadError && (
        <div className="cloud-message" role="status">
          <span>{cloud.loadError}</span>
          <button onClick={() => void cloud.refresh()}>Retry</button>
        </div>
      )}
      <div className="editor-tools">
        <span role="status">
          {cloud.loading
            ? "Loading latest…"
            : saving
              ? "Saving…"
              : cloud.saved
                ? "Saved"
                : cloud.canEdit
                  ? "Editing"
                  : ""}
        </span>
        <div>
          {cloud.canEdit && cloud.migration.length > 0 && (
            <button
              onClick={() => open("import")}
              disabled={saving || Boolean(cloud.loadError)}
            >
              Import saved ({cloud.migration.length})
            </button>
          )}
          {cloud.canEdit && (
            <button
              onClick={download}
              disabled={!cloud.ready || saving}
              aria-label="Export collection CSV"
              title="Export collection CSV"
            >
              <Download size={14} />
            </button>
          )}
          {cloud.user ? (
            <button
              onClick={() => {
                void cloud.signOut().catch(() => {
                  setMessage("Couldn’t sign out. Try again.");
                  setView("login");
                  dialog.current?.showModal();
                });
              }}
              disabled={saving}
            >
              <LogOut size={13} />
              Sign out
            </button>
          ) : (
            <button onClick={() => open("login")}>
              <LogIn size={13} />
              Editor sign in
            </button>
          )}
        </div>
      </div>
      {cloud.authError && (
        <p className="cloud-message" role="status">
          {cloud.authError}
        </p>
      )}
      <dialog
        ref={dialog}
        className="editor-dialog"
        aria-labelledby="editor-dialog-title"
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <button
          className="editor-close"
          aria-label="Close editor dialog"
          disabled={busy}
          onClick={() => dialog.current?.close()}
        >
          <X size={19} />
        </button>
        <h2 id="editor-dialog-title">
          {view === "login" ? "Editor sign in" : "Import saved statuses"}
        </h2>
        {view === "login" ? (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setMessage("");
              try {
                await cloud.signIn(email);
                setMessage(
                  "Check your email for a sign-in link. Open it in this browser.",
                );
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>Sign in to save changes to your atlas.</p>
            <label htmlFor="editor-email">Email address</label>
            <input
              id="editor-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <button className="editor-primary" disabled={busy}>
              {busy ? "Sending…" : "Email sign-in link"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setMessage("");
              try {
                await cloud.importStatuses(
                  reviewed.filter((c) => chosen.has(c.id)),
                );
                dialog.current?.close();
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              These changes were saved in this browser. Choose which ones to
              copy to your atlas.
            </p>
            <div className="status-import-list">
              {reviewed.map((change) => (
                <label key={change.id}>
                  <input
                    type="checkbox"
                    checked={chosen.has(change.id)}
                    disabled={busy}
                    onChange={(event) =>
                      setChosen((previous) => {
                        const next = new Set(previous);
                        if (event.target.checked) next.add(change.id);
                        else next.delete(change.id);
                        return next;
                      })
                    }
                  />
                  <span>
                    <strong>{change.name}</strong>
                    <small>
                      {change.previous} → {change.status}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            <button
              className="editor-primary"
              disabled={busy || saving || !chosen.size}
            >
              {busy ? "Importing…" : `Import selected (${chosen.size})`}
            </button>
          </form>
        )}
        {message && (
          <p className="editor-message" role="status">
            {message}
          </p>
        )}
      </dialog>
    </>
  );
}
