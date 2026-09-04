import { supabase } from "./supabaseClient.js?v=13";

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password, fullName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = "index.html";
}

export async function getSession() {
  // Guard against the auth client ever hanging on startup: if getSession
  // doesn't resolve quickly, fall back to reading the persisted session
  // straight from localStorage so the app never gets stuck on a blank page.
  try {
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("getSession timeout")), 3000)),
    ]);
    return result.data.session;
  } catch (_) {
    return readPersistedSession();
  }
}

// Reads the session token Supabase persists in localStorage, without touching
// the (possibly stuck) auth client.
function readPersistedSession() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
        const parsed = JSON.parse(localStorage.getItem(key));
        if (parsed && parsed.access_token && parsed.user) return parsed;
      }
    }
  } catch (_) {}
  return null;
}

// Call at the top of any protected page. Redirects to login if not signed in,
// and returns { session, profile } once available.
export async function requireSession() {
  const session = await getSession();
  if (!session) {
    window.location.href = "index.html";
    throw new Error("Not signed in");
  }
  const profile = await getProfile(session.user.id);
  if (!profile) {
    // Auth user exists but the profiles row (created by a DB trigger) hasn't
    // landed yet - this can happen for a split second right after sign-up.
    window.location.href = "index.html";
    throw new Error("Profile not ready");
  }
  return { session, profile };
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, department")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
