import type { FastifyRequest, FastifyReply } from 'fastify'
import { buildAllLocales, buildLocale, computeEnHashFromSource, getCachedLocale, listCachedLocales, deleteCachedLocale } from '../../services/i18nTranslation.js'

export class TranslationController {
  static async getEnHash(_req: FastifyRequest, reply: FastifyReply) {
    const enHash = await computeEnHashFromSource()
    return reply.send({ success: true, enHash, timestamp: Date.now() })
  }

  static async listCached(req: FastifyRequest, reply: FastifyReply) {
    const enHash = (req.query as any)?.enHash as string | undefined
    const hash = enHash && enHash.length > 0 ? enHash : await computeEnHashFromSource()
    const items = await listCachedLocales(hash)
    return reply.send({ success: true, enHash: hash, items })
  }

  static async getLocale(req: FastifyRequest, reply: FastifyReply) {
    const { locale } = req.params as { locale: string }
    const enHash = (req.query as any)?.enHash as string | undefined
    const hash = enHash && enHash.length > 0 ? enHash : await computeEnHashFromSource()
    let cached = await getCachedLocale(hash, locale)
    if (!cached) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 120000)
      try {
        const built = await buildLocale(hash, locale, controller.signal)
        cached = built
      } catch (e: any) {
        const message = e?.message || 'Build failed'
        return reply.code(500).send({ success: false, message })
      } finally {
        clearTimeout(timer)
      }
    }
    if (!cached) return reply.code(500).send({ success: false, message: 'Build failed' })
    return reply.send({ success: true, data: cached })
  }

  static async deleteLocale(req: FastifyRequest, reply: FastifyReply) {
    const { locale } = req.params as { locale: string }
    const enHash = (req.query as any)?.enHash as string | undefined
    const hash = enHash && enHash.length > 0 ? enHash : await computeEnHashFromSource()
    const ok = await deleteCachedLocale(hash, locale)
    return reply.send({ success: ok })
  }

  static async buildOne(req: FastifyRequest, reply: FastifyReply) {
    const { locale } = req.params as { locale: string }
    const enHash = (req.query as any)?.enHash as string | undefined
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120000)
    try {
      const payload = await buildLocale(enHash, locale, controller.signal)
      return reply.send({ success: true, data: payload })
    } finally {
      clearTimeout(timer)
    }
  }

  static async buildAll(req: FastifyRequest, reply: FastifyReply) {
    const enHash = (req.query as any)?.enHash as string | undefined
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 600000)
    try {
      const results = await buildAllLocales(enHash, controller.signal)
      return reply.send({ success: true, items: results })
    } finally {
      clearTimeout(timer)
    }
  }
}


