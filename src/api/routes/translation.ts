import type { FastifyInstance } from 'fastify'
import { TranslationController } from '../controllers/TranslationController.js'

export default async function translationRoutes(fastify: FastifyInstance) {
  // Hash for current English catalog
  fastify.get('/i18n/en-hash', TranslationController.getEnHash)

  // List cached locale metas
  fastify.get('/i18n/cache', TranslationController.listCached)

  // Get cached locale bundle
  fastify.get('/i18n/cache/:locale', TranslationController.getLocale)

  // Admin-ish operations (no auth for now; can add RBAC later)
  fastify.post('/i18n/build/:locale', TranslationController.buildOne)
  fastify.post('/i18n/build-all', TranslationController.buildAll)
  fastify.delete('/i18n/cache/:locale', TranslationController.deleteLocale)
}


