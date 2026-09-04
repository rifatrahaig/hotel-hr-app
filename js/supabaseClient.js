import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js?v=13";

// Pass-through lock: the default uses the browser's navigator LockManager,
// which can deadlock getSession() on startup (a blank page). Staff each use
// their own device / single tab, so a simple pass-through is safe here and
// prevents the app ever hanging on load.
const passthroughLock = async (_name, _acquireTimeout, fn) => fn();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    lock: passthroughLock,
    persistSession: true,
    autoRefreshToken: true,
  },
});
