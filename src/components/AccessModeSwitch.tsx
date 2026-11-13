import { useEffect, useState } from "react";
import { Eye, LoaderCircle, PenLine } from "lucide-react";

interface Props {
  editing: boolean;
  busy: boolean;
  signingOut: boolean;
  onEditor: () => void;
  onViewer: () => Promise<void>;
}

export default function AccessModeSwitch({
  editing,
  busy,
  signingOut,
  onEditor,
  onViewer,
}: Props) {
  const [error, setError] = useState("");
  useEffect(() => {
    if (!editing && !signingOut) setError("");
  }, [editing, signingOut]);
  return (
    <div className="access-mode-control">
      <div
        className="access-mode-switch"
        role="group"
        aria-label="Access mode"
        aria-busy={busy}
      >
        <button
          type="button"
          aria-pressed={!editing}
          disabled={busy}
          title={
            editing ? "Switch to Viewer and sign out" : "Read-only browsing"
          }
          onClick={async () => {
            // Also clear a session whose editor permission is still loading.
            setError("");
            try {
              await onViewer();
            } catch {
              setError("Couldn’t switch to Viewer. Please try again.");
            }
          }}
        >
          {signingOut ? (
            <LoaderCircle
              size={14}
              className="editor-spinner"
              aria-hidden="true"
            />
          ) : (
            <Eye size={14} aria-hidden="true" />
          )}
          Viewer
        </button>
        <button
          type="button"
          aria-pressed={editing}
          disabled={busy}
          title={editing ? "Editor mode" : "Sign in to edit your atlas"}
          onClick={() => {
            setError("");
            if (!editing) onEditor();
          }}
        >
          <PenLine size={14} aria-hidden="true" />
          Editor
        </button>
      </div>
      {error && (
        <p className="access-mode-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
