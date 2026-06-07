import { app, protocol, net } from 'electron'
import { mkdir, writeFile, unlink, access } from 'fs/promises'
import { join, extname } from 'path'
import { pathToFileURL } from 'url'
import { v4 as uuid } from 'uuid'

const SCHEME = 'posimg'

function imagesDir(): string {
  return join(app.getPath('userData'), 'product-images')
}

async function ensureDir(): Promise<void> {
  await mkdir(imagesDir(), { recursive: true }).catch(() => {})
}

/** Register the posimg:// scheme as privileged. Must run before app `ready`. */
export function registerProductImageScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: false } }
  ])
}

/** Wire up posimg://<filename> → the cached file on disk. Run after app `ready`. */
export async function setupProductImageProtocol(): Promise<void> {
  await ensureDir()
  protocol.handle(SCHEME, async (request) => {
    try {
      const name = decodeURIComponent(new URL(request.url).hostname || request.url.slice(`${SCHEME}://`.length))
      // guard against path traversal — only a bare filename is allowed
      if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
        return new Response('bad name', { status: 400 })
      }
      const file = join(imagesDir(), name)
      return await net.fetch(pathToFileURL(file).toString())
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
}

/** Save raw image bytes (from a renderer file pick) to disk; returns the filename. */
export async function saveProductImage(dataBase64: string, originalName?: string): Promise<string> {
  await ensureDir()
  const ext = (originalName ? extname(originalName) : '').toLowerCase() || '.jpg'
  const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg'
  const filename = `${uuid()}${safeExt}`
  // dataBase64 may be a data URL ("data:image/png;base64,....") or raw base64
  const base64 = dataBase64.includes(',') ? dataBase64.split(',')[1] : dataBase64
  await writeFile(join(imagesDir(), filename), Buffer.from(base64, 'base64'))
  return filename
}

export async function deleteProductImage(filename: string | null | undefined): Promise<void> {
  if (!filename) return
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) return
  await unlink(join(imagesDir(), filename)).catch(() => {})
}

async function fileExists(filename: string): Promise<boolean> {
  try { await access(join(imagesDir(), filename)); return true } catch { return false }
}

/**
 * For a product synced from the cloud that has an image_url but no local cache,
 * download the image and store it. Returns the new local filename, or null on
 * failure / if already cached.
 */
export async function cacheRemoteImage(imageUrl: string, existingFilename?: string | null): Promise<string | null> {
  if (!imageUrl) return null
  if (existingFilename && await fileExists(existingFilename)) return existingFilename
  try {
    await ensureDir()
    const res = await net.fetch(imageUrl)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const urlExt = extname(new URL(imageUrl).pathname).toLowerCase()
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(urlExt) ? urlExt : '.jpg'
    const filename = `${uuid()}${safeExt}`
    await writeFile(join(imagesDir(), filename), buf)
    return filename
  } catch {
    return null
  }
}

/** Read a cached image back as base64 (used when uploading a POS-added image to the cloud). */
export async function readProductImageBase64(filename: string): Promise<string | null> {
  try {
    const { readFile } = await import('fs/promises')
    const buf = await readFile(join(imagesDir(), filename))
    return buf.toString('base64')
  } catch {
    return null
  }
}
