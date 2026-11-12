export function readCloudConfig(url?: string, key?: string) {
  if (!url && !key) return null;
  if (!url || !key)
    throw new Error(
      "Set both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/"
  )
    throw new Error("VITE_SUPABASE_URL must be your HTTPS project URL.");
  if (key.startsWith("sb_secret_"))
    throw new Error("Use the publishable key, never a secret key.");
  if (key.startsWith("eyJ")) {
    try {
      const payload = JSON.parse(
        atob(key.split(".")[1].replaceAll("-", "+").replaceAll("_", "/")),
      );
      if (payload.role !== "anon") throw new Error("Not a public key");
    } catch {
      throw new Error(
        "Only a publishable or legacy anon key can be used in the website.",
      );
    }
  } else if (!key.startsWith("sb_publishable_")) {
    throw new Error("Use a Supabase publishable key.");
  }
  return { url: parsed.origin, key };
}
