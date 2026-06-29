import { isSupabaseConfigured, supabase } from "./supabase";

/** Public Storage bucket that holds perfume/brand images (see DEPLOY.md to create it). */
export const IMAGE_BUCKET = "images";

/**
 * Upload an image file to Supabase Storage and return its public URL. The URL is
 * what we store in `imageUrl` (instead of a base64 blob), keeping the inventory
 * data small. Throws if Storage isn't configured or the upload fails.
 */
export async function uploadImage(file: File): Promise<string> {
  if (!isSupabaseConfigured || supabase === null) {
    throw new Error("Storage is not configured.");
  }
  const ext =
    (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") ||
    "png";
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
  if (error) throw error;

  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}
