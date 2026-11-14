import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import {
  Check,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  X,
} from "lucide-react";
import CollectionFooter from "./CollectionFooter";
import { exportCitiesCsv } from "../lib/cloud-data";
import {
  exportCityPeriodsCsv,
  exportCityVisitsCsv,
} from "../lib/city-cloud-data";
import {
  MIN_PASSWORD_LENGTH,
  type RemoteAtlas,
  type StatusImport,
} from "../lib/use-remote-atlas";

type View = "login" | "link" | "reset" | "password" | "import" | "export";

export interface EditorControlsHandle {
  openSignIn: () => void;
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  disabled,
  newPassword = false,
  autoFocus = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  newPassword?: boolean;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="editor-field">
      <label htmlFor={id}>{label}</label>
      <div className="editor-password-field">
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          autoComplete={newPassword ? "new-password" : "current-password"}
          autoFocus={autoFocus}
          minLength={newPassword ? MIN_PASSWORD_LENGTH : undefined}
          required
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="editor-password-toggle"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          aria-controls={id}
          disabled={disabled}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </div>
  );
}

export default function EditorControls({
  cloud,
  countries,
  visited,
  ref,
}: {
  cloud: RemoteAtlas;
  countries: number;
  visited: number;
  ref?: Ref<EditorControlsHandle>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const [formVersion, setFormVersion] = useState(0);
  const [reviewed, setReviewed] = useState<StatusImport[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const saving = Object.keys(cloud.pending).length > 0 || cloud.signingOut;
  const blocked = busy || Boolean(success);
  const open = (next: View) => {
    setView(next);
    setMessage("");
    setIsError(false);
    setSuccess("");
    setPassword("");
    setConfirmation("");
    setFormVersion((version) => version + 1);
    if (next === "import") {
      setReviewed(cloud.migration);
      setChosen(new Set(cloud.migration.map((c) => c.id)));
    }
    if (!dialog.current?.open) dialog.current?.showModal();
    // React's autoFocus runs while the initial form is still in a closed
    // dialog. Focus after the newly selected form has actually rendered.
    window.requestAnimationFrame(() => {
      if (!dialog.current?.open) return;
      dialog.current
        .querySelector<HTMLInputElement>(
          next === "password"
            ? "#editor-new-password"
            : next === "import"
              ? 'input[type="checkbox"]'
              : "#editor-email",
        )
        ?.focus();
    });
  };
  const clearDialog = () => {
    setPassword("");
    setConfirmation("");
    setMessage("");
    setSuccess("");
    cloud.dismissPasswordRecovery();
  };
  useImperativeHandle(ref, () => ({ openSignIn: () => open("login") }));
  useEffect(() => {
    if (cloud.passwordRecovery) open("password");
  }, [cloud.passwordRecovery]);
  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(
      () => dialog.current?.close(),
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650,
    );
    return () => window.clearTimeout(timer);
  }, [success]);
  const heading =
    view === "export"
      ? "Export collection"
      : view === "password"
        ? "Set your password"
        : view === "reset"
          ? "Reset your password"
          : view === "import"
            ? "Import saved statuses"
            : "Editor sign in";
  const download = (kind: "cities" | "visits" | "periods" = "cities") => {
    const url = URL.createObjectURL(
      new Blob(
        [
          "\ufeff",
          kind === "periods"
            ? exportCityPeriodsCsv(cloud.cities)
            : kind === "visits"
              ? exportCityVisitsCsv(cloud.cities)
              : exportCitiesCsv(cloud.cities),
        ],
        {
          type: "text/csv;charset=utf-8",
        },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `ciudad-mundo-${kind === "cities" ? "" : `city-${kind}-`}${new Date().toISOString().slice(0, 10)}.csv`;
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
      {cloud.canEdit && cloud.migration.length > 0 && (
        <div className="cloud-message">
          <span>This browser has local status changes.</span>
          <button
            onClick={() => open("import")}
            disabled={saving || Boolean(cloud.loadError)}
          >
            Import saved ({cloud.migration.length})
          </button>
        </div>
      )}
      {cloud.authError && (
        <p className="cloud-message" role="status">
          {cloud.authError}
        </p>
      )}
      <CollectionFooter
        countries={countries}
        visited={visited}
        actions={
          cloud.canEdit && (
            <div
              className="editor-tools"
              role="group"
              aria-label="Collection tools"
            >
              <button
                onClick={() => open("export")}
                disabled={!cloud.ready || saving}
                aria-label="Export collection CSV"
                title="Export collection CSV"
              >
                <Download size={14} aria-hidden="true" />
                Export
              </button>
              <button
                onClick={() => open("password")}
                disabled={saving}
                aria-label="Set or change password"
                title="Set or change password"
              >
                <KeyRound size={14} aria-hidden="true" />
                Password
              </button>
            </div>
          )
        }
      />
      <dialog
        ref={dialog}
        className="editor-dialog"
        aria-labelledby="editor-dialog-title"
        aria-busy={busy}
        onClose={clearDialog}
        onCancel={(event) => {
          if (blocked) event.preventDefault();
        }}
      >
        <button
          className="editor-close"
          aria-label="Close editor dialog"
          disabled={blocked}
          onClick={() => dialog.current?.close()}
        >
          <X size={19} />
        </button>
        <h2 id="editor-dialog-title">{heading}</h2>
        {success ? (
          <div className="editor-success" role="status">
            <span>
              <Check size={28} aria-hidden="true" />
            </span>
            <p>{success}</p>
          </div>
        ) : view === "export" ? (
          <div className="editor-export-options">
            <button className="editor-primary" onClick={() => download()}>
              <Download size={16} aria-hidden="true" />
              Cities CSV
            </button>
            <button
              className="editor-primary"
              onClick={() => download("visits")}
            >
              <Download size={16} aria-hidden="true" />
              City visit history CSV
            </button>
            <button
              className="editor-primary"
              onClick={() => download("periods")}
            >
              <Download size={16} aria-hidden="true" />
              City stay periods CSV
            </button>
          </div>
        ) : view !== "import" ? (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setMessage("");
              setIsError(false);
              try {
                if (view === "login") {
                  await cloud.signIn(email, password);
                  setPassword("");
                  setSuccess("You’re signed in.");
                } else if (view === "password") {
                  if (password !== confirmation)
                    throw new Error(
                      "The passwords don’t match. Please try again.",
                    );
                  await cloud.updatePassword(password);
                  setPassword("");
                  setConfirmation("");
                  setSuccess(
                    "Password saved. You can sign in directly next time.",
                  );
                } else if (view === "reset") {
                  await cloud.resetPassword(email);
                  setMessage(
                    "If this is your editor email, a reset link is on its way. Open it in this browser to choose a new password.",
                  );
                } else {
                  await cloud.sendSignInLink(email);
                  setMessage(
                    "Check your email for a sign-in link. Open it in this browser. Once signed in, choose Password to set one.",
                  );
                }
              } catch (error) {
                setMessage((error as Error).message);
                setIsError(true);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              {view === "password"
                ? `Choose at least ${MIN_PASSWORD_LENGTH} characters to sign in without an email link.`
                : view === "reset"
                  ? "We’ll email you a link to choose a new password."
                  : view === "link"
                    ? "Use a one-time email link to sign in or set your first password."
                    : "Welcome back. Sign in to save changes to your atlas."}
            </p>
            {view === "password" ? (
              <>
                <PasswordField
                  key={`new-${formVersion}`}
                  id="editor-new-password"
                  label="New password"
                  value={password}
                  onChange={setPassword}
                  disabled={busy}
                  newPassword
                  autoFocus
                />
                <PasswordField
                  key={`confirm-${formVersion}`}
                  id="editor-confirm-password"
                  label="Confirm password"
                  value={confirmation}
                  onChange={setConfirmation}
                  disabled={busy}
                  newPassword
                />
              </>
            ) : (
              <>
                <label htmlFor="editor-email">Email address</label>
                <input
                  id="editor-email"
                  type="email"
                  autoComplete="email"
                  name="email"
                  autoFocus
                  required
                  disabled={busy}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                {view === "login" && (
                  <PasswordField
                    key={`login-${formVersion}`}
                    id="editor-password"
                    label="Password"
                    value={password}
                    onChange={setPassword}
                    disabled={busy}
                  />
                )}
              </>
            )}
            <button className="editor-primary" disabled={busy}>
              {busy && (
                <LoaderCircle
                  size={17}
                  className="editor-spinner"
                  aria-hidden="true"
                />
              )}
              {view === "login"
                ? busy
                  ? "Signing in…"
                  : "Sign in"
                : view === "password"
                  ? busy
                    ? "Saving password…"
                    : "Save password"
                  : view === "reset"
                    ? busy
                      ? "Sending…"
                      : "Send reset link"
                    : busy
                      ? "Sending…"
                      : "Email sign-in link"}
            </button>
            {view === "login" ? (
              <div className="editor-auth-options">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => open("reset")}
                >
                  Forgot password?
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => open("link")}
                >
                  Use an email link instead
                </button>
                <p>
                  First time? Use an email link once, then choose Password to
                  set one.
                </p>
              </div>
            ) : (
              view !== "password" && (
                <button
                  type="button"
                  className="editor-back"
                  disabled={busy}
                  onClick={() => open("login")}
                >
                  Back to password sign in
                </button>
              )
            )}
          </form>
        ) : (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setMessage("");
              setIsError(false);
              try {
                await cloud.importStatuses(
                  reviewed.filter((c) => chosen.has(c.id)),
                );
                dialog.current?.close();
              } catch (error) {
                setMessage((error as Error).message);
                setIsError(true);
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
          <p
            className={
              isError ? "editor-message editor-message-error" : "editor-message"
            }
            role={isError ? "alert" : "status"}
          >
            {message}
          </p>
        )}
      </dialog>
    </>
  );
}
