import { createClient } from "@supabase/supabase-js";
import { readCloudConfig } from "./cloud-config";

const config = readCloudConfig(
  import.meta.env?.VITE_SUPABASE_URL,
  import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY,
);
export const supabase = config
  ? createClient(config.url, config.key, {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
