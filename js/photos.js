import { supabase } from "./supabaseClient.js?v=13";

const BUCKET = "hr-photos";

// Uploads a photo into the current user's private folder and returns the
// storage path (not a public URL - the bucket is private).
export async function uploadPhoto(userId, file, subfolder) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/${subfolder}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "image/jpeg",
  });
  if (error) throw error;
  return path;
}

export async function getSignedUrl(path, expiresInSeconds = 3600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
