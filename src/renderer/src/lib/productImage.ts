
/** True when running inside the Electron desktop app (real preload present). */
export const isElectron =
  typeof window !== 'undefined' &&
  !!(window as any).api &&
  typeof (window as any).api.saveProductImage === 'function'

/**
 * Resolve the best image source for a product.
 * - Desktop (Electron): prefer the locally cached file via posimg://, so it
 *   renders offline; fall back to the cloud URL if no local copy yet.
 * - Web: use the Cloudinary URL.
 * Returns null when the product has no image.
 */
export function productImageSrc(
  product: { image_filename?: string | null; image_url?: string | null }
): string | null {
  // posimg:// only exists in Electron — never emit it on the web, where it
  // would render as a broken image.
  if (isElectron && product.image_filename) {
    return `posimg://${product.image_filename}`
  }
  if (product.image_url) return product.image_url
  return null
}

/** Read a File as a base64 data URL (for the desktop save / cloud upload). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Upload an image to Cloudinary (web admin path). Uses an unsigned upload
 * preset configured via Vite env vars. Returns the secure URL, or null if
 * Cloudinary isn't configured (so callers can degrade gracefully).
 */
export async function uploadToCloudinary(file: File): Promise<string | null> {
  const cloud = (import.meta as any).env?.VITE_CLOUDINARY_CLOUD_NAME
  const preset = (import.meta as any).env?.VITE_CLOUDINARY_UPLOAD_PRESET
  if (!cloud || !preset) return null
  const form = new FormData()
  form.append('file', file)
  form.append('upload_preset', preset)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
    method: 'POST',
    body: form
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.secure_url || null
}
