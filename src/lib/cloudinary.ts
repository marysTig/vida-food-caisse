/**
 * Cloudinary delivers a resized copy when asked: product images are shown in
 * ~100px circles but the originals are up to 1254×1254 PNGs (1.7 MB) — 7.6 MB
 * for the whole menu. `f_auto,q_auto` serves WebP/AVIF at ~12 KB instead.
 * Non-Cloudinary URLs, and URLs that already carry a transformation, pass through.
 */
export function optimizedImageUrl(url: string, size = 240): string {
  const marker = "/image/upload/";
  if (!url.startsWith("https://res.cloudinary.com/")) return url;
  const at = url.indexOf(marker);
  if (at === -1) return url;
  const rest = url.slice(at + marker.length);
  // Already transformed (w_240,c_fill/… comes before the v123… version segment).
  if (!/^v\d+\//.test(rest) && /^[a-z]{1,3}_/.test(rest)) return url;
  return `${url.slice(0, at + marker.length)}w_${size},h_${size},c_fill,f_auto,q_auto/${rest}`;
}

export async function uploadImageToCloudinary(file: File): Promise<string> {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset || cloudName === 'votre_cloud_name' || uploadPreset === 'votre_upload_preset') {
    throw new Error("Configuration Cloudinary manquante dans le fichier .env");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || "Erreur lors du téléchargement de l'image");
  }

  const data = await response.json();
  return data.secure_url;
}
