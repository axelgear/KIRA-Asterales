import type { FastifyInstance } from 'fastify'
import { CacheController } from '../controllers/CacheController.js'
import { createRbacGuard } from '../../plugins/rbac.js'

export default async function cacheRoutes(fastify: FastifyInstance) {
	// Cache statistics (public)
	fastify.get('/cache/stats', CacheController.getStats)
	
	// Cache key management (public)
	fastify.get('/cache/keys', CacheController.getCacheKeys)
	fastify.get('/cache/ttl/:key', CacheController.getCacheTTL)
	fastify.get('/cache/get/:key', CacheController.getCache)
	
	// Cache operations (public)
	fastify.post('/cache/set', CacheController.setCache)
	fastify.delete('/cache/delete/:key', CacheController.deleteCache)
	
	// Chapter-specific cache operations (public)
	fastify.post('/cache/warmup/chapters', CacheController.warmupChapterCache)
	fastify.post('/cache/invalidate/chapter', CacheController.invalidateChapterCache)
	fastify.post('/cache/clear/novel-chapters', CacheController.clearNovelChapterCache)
	
	// Novel-specific cache operations (public)
	fastify.post('/cache/warmup/novels', CacheController.warmupNovelCache)
	fastify.post('/cache/invalidate/novel', CacheController.invalidateNovelCache)
	fastify.post('/cache/clear/novel', CacheController.clearNovelCache)
	
	// Dangerous operations (admin only)
	fastify.post('/cache/flush', { preHandler: [createRbacGuard('both')] }, CacheController.flushAllCaches)
}
