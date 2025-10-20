import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

type FlatMessages = Record<string, string>

function getProjectRoot(): string {
  // Resolve project root by current file
  // This file lives in src/services; go up two levels
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  return path.resolve(__dirname, '../../')
}

function getFrontendRoot(): string {
  // Prefer env, otherwise sibling project path
  const envRoot = process.env.FRONTEND_ROOT
  if (envRoot && envRoot.trim().length > 0) return envRoot
  const candidate = path.resolve(getProjectRoot(), '../Novel_Kira')
  return candidate
}

function ensureTrailingSlash(p: string): string {
  return /\/$/.test(p) ? p : p + '/'
}

export interface BuildResultMeta {
  locale: string
  enHash: string
  updatedAt: string
  total: number
}

export interface CachedLocalePayload {
  meta: BuildResultMeta
  flat: FlatMessages
}

function simpleHash(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) >>> 0
  return hash.toString(16)
}

function flattenMessages(obj: Record<string, any>, prefix = ''): FlatMessages {
  const out: FlatMessages = {}
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object') Object.assign(out, flattenMessages(value as Record<string, any>, newKey))
    else if (typeof value === 'string') out[newKey] = value
  }
  return out
}

function maskPlaceholders(text: string): { masked: string; tokens: string[] } {
  const tokens: string[] = []
  const masked = text.replace(/\{[^}]+\}/g, (m) => {
    const idx = tokens.push(m) - 1
    return `__PH_${idx}__`
  })
  return { masked, tokens }
}

function unmaskPlaceholders(text: string, tokens: string[]): string {
  return text.replace(/__PH_(\d+)__/g, (_, i) => tokens[+i] ?? _)
}

function decodeEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

async function translateWithGoogleOne(text: string, target: string, abort?: AbortSignal): Promise<string> {
    const apiKey = process.env.GOOGLE_TRANSLATE_KEY || "AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520"
  if (!apiKey) throw new Error('Google translate key missing (GOOGLE_TRANSLATE_KEY)')
  const htmlText = text.replace(/\n/g, '<br/>')
  const payload = [[[htmlText], 'auto', target], 'wt_lib']
  const res = await fetch('https://translate-pa.googleapis.com/v1/translateHtml', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json+protobuf',
      'X-Goog-API-Key': apiKey,
      'Accept': '*/*',
    },
    body: JSON.stringify(payload),
    signal: abort,
  } as RequestInit)
  if (!res.ok) throw new Error(`Google API error: ${res.status}`)
  const data = await res.json() as any
  let out = Array.isArray(data) && Array.isArray(data[0]) && typeof data[0][0] === 'string' ? (data[0][0] as string) : text
  out = out.replace(/<br\s*\/?>/gi, '\n')
  return decodeEntities(out)
}

async function translateWithGoogleMany(texts: string[], target: string, abort?: AbortSignal, concurrency = 8): Promise<string[]> {
  const results: string[] = new Array(texts.length)
  let index = 0
  async function worker() {
    while (true) {
      const i = index++
      if (i >= texts.length) break
      const original = texts[i] as string
      const { masked, tokens } = maskPlaceholders(original)
      const translated = await translateWithGoogleOne(masked, target, abort)
      results[i] = unmaskPlaceholders(translated, tokens)
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, texts.length) }, () => worker())
  await Promise.all(workers)
  return results
}

function normalizeTargetLocale(locale: string): string {
  if (!locale) return 'en'
  if (locale === 'zhs') return 'zh-CN'
  if (locale === 'zht') return 'zh-TW'
  if (locale === 'iw') return 'he' // legacy code for Hebrew
  const hyphen = locale.indexOf('-')
  return hyphen > 0 ? locale.slice(0, hyphen) : locale
}

async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    const s = await fs.readFile(filePath, 'utf8')
    return s
  } catch {
    return null
  }
}

async function parseEnglishMessages(): Promise<Record<string, any>> {
  // Read the English.ts from frontend project
  const frontendRoot = getFrontendRoot()
  const englishPath = path.resolve(frontendRoot, 'i18n/locales/English.ts')
  const content = await fs.readFile(englishPath, 'utf8')
  // Strip export default and trailing as const
  let code = content.trim()
  // Remove any import/export lines at the top
  code = code.replace(/^export default\s*/m, '')
  code = code.replace(/\s+as const;?\s*$/m, '')
  // Some files end with a trailing comma before closing brace; acceptable in JS
  // Safely evaluate as JS object
  const fn = new Function('return (' + code + ')') as () => Record<string, any>
  const obj = fn()
  if (!obj || typeof obj !== 'object') throw new Error('Parsed English messages is not an object')
  return obj
}

async function parseLanguageOptions(): Promise<string[]> {
  const frontendRoot = getFrontendRoot()
  const optionsPath = path.resolve(frontendRoot, 'utils/language-options.ts')
  const text = await fs.readFile(optionsPath, 'utf8')
  const values: string[] = []
  const regex = /\{\s*value:\s*(["'])(.*?)\1\s*,/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(text))) {
    const v = m[2] as string
    if (v && v !== 'en') values.push(v)
  }
  // Include special in-context locale if needed (not for translation)
  // Filter out empty and duplicates
  const uniq = Array.from(new Set(values.filter((v) => v && v.trim().length > 0)))
  return uniq
}

function getCacheDir(enHash: string): string {
  const root = getProjectRoot()
  const dataDir = path.resolve(root, 'i8n', enHash)
  return dataDir
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

export async function getCachedLocale(enHash: string, locale: string): Promise<CachedLocalePayload | null> {
  const file = path.resolve(getCacheDir(enHash), `${locale}.json`)
  const data = await readFileIfExists(file)
  if (!data) return null
  try {
    return JSON.parse(data) as CachedLocalePayload
  } catch {
    return null
  }
}

export async function listCachedLocales(enHash: string): Promise<BuildResultMeta[]> {
  const dir = getCacheDir(enHash)
  try {
    const files = await fs.readdir(dir)
    const metas: BuildResultMeta[] = []
    for (const f of files) {
      if (!f.endsWith('.json')) continue
      const raw = await readFileIfExists(path.resolve(dir, f))
      if (!raw) continue
      try {
        const parsed = JSON.parse(raw) as CachedLocalePayload
        metas.push(parsed.meta)
      } catch {}
    }
    return metas
  } catch {
    return []
  }
}

export async function deleteCachedLocale(enHash: string, locale: string): Promise<boolean> {
  const file = path.resolve(getCacheDir(enHash), `${locale}.json`)
  try {
    await fs.unlink(file)
    return true
  } catch {
    return false
  }
}

export async function computeEnHashFromSource(): Promise<string> {
  const english = await parseEnglishMessages()
  const hash = simpleHash(JSON.stringify(english))
  return hash
}

export async function buildLocale(enHashInput: string | undefined, locale: string, signal?: AbortSignal): Promise<CachedLocalePayload> {
  const english = await parseEnglishMessages()
  const flatEn = flattenMessages(english)
  const enHash = enHashInput && enHashInput.length > 0 ? enHashInput : simpleHash(JSON.stringify(english))
  const target = normalizeTargetLocale(locale)
  if (target === 'en') {
    const payload: CachedLocalePayload = {
      meta: { locale, enHash, updatedAt: new Date().toISOString(), total: Object.keys(flatEn).length },
      flat: { ...flatEn },
    }
    return payload
  }
  const keys = Object.keys(flatEn)
  const values = keys.map((k) => flatEn[k]!)
  const translated = await translateWithGoogleMany(values, target, signal, 8)
  const flat: FlatMessages = {}
  for (let i = 0; i < keys.length; i++) flat[keys[i] as string] = translated[i] as string
  const payload: CachedLocalePayload = {
    meta: { locale, enHash, updatedAt: new Date().toISOString(), total: keys.length },
    flat,
  }
  // Persist
  const dir = getCacheDir(enHash)
  await ensureDir(dir)
  await fs.writeFile(path.resolve(dir, `${locale}.json`), JSON.stringify(payload), 'utf8')
  return payload
}

export async function buildAllLocales(enHashInput?: string, signal?: AbortSignal): Promise<BuildResultMeta[]> {
  const english = await parseEnglishMessages()
  const enHash = enHashInput && enHashInput.length > 0 ? enHashInput : simpleHash(JSON.stringify(english))
  const locales = await parseLanguageOptions()
  const metas: BuildResultMeta[] = []
  for (const loc of locales) {
    if (!loc || loc === 'en') continue
    try {
      const res = await buildLocale(enHash, loc, signal)
      metas.push(res.meta)
    } catch (e) {
      // Skip failures for individual locales
    }
  }
  return metas
}


