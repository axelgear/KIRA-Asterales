import type { FastifyRequest, FastifyReply } from 'fastify'
import { CacheService } from '../../services/CacheService.js'

export const CacheController = {
	// GET /cache/stats - Get cache statistics
	getStats: async (request: FastifyRequest) => {
		try {
			const stats = await CacheService.getCacheStats()
			return { 
				success: true, 
				message: 'Cache statistics retrieved',
				result: stats
			}
		} catch (error) {
			console.error('❌ Error getting cache stats:', error)
			return { 
				success: false, 
				message: 'Error getting cache statistics',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// POST /cache/warmup/chapters - Warm up chapter cache for a novel
	warmupChapterCache: async (request: FastifyRequest) => {
		try {
			const body = request.body as any
			const { novelUuid, limit = 10 } = body
			
			if (!novelUuid) {
				return { success: false, message: 'novelUuid required' }
			}
			
			console.log(`🔥 Warming up chapter cache for novel: ${novelUuid}`)
			const cached = await CacheService.warmupChapterCache(novelUuid, limit)
			
			return { 
				success: true, 
				message: 'Chapter cache warmup completed',
				result: { cached, novelUuid, limit }
			}
		} catch (error) {
			console.error('❌ Error warming up chapter cache:', error)
			return { 
				success: false, 
				message: 'Error warming up chapter cache',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// POST /cache/invalidate/chapter - Invalidate specific chapter cache
	invalidateChapterCache: async (request: FastifyRequest) => {
		try {
			const body = request.body as any
			const { uuid } = body
			
			if (!uuid) {
				return { success: false, message: 'Chapter UUID required' }
			}
			
			console.log(`🗑️ Invalidating chapter cache: ${uuid}`)
			const result = await CacheService.invalidateChapterCache(uuid)
			
			return { 
				success: result, 
				message: result ? 'Chapter cache invalidated successfully' : 'Failed to invalidate chapter cache',
				result: { uuid, invalidated: result }
			}
		} catch (error) {
			console.error('❌ Error invalidating chapter cache:', error)
			return { 
				success: false, 
				message: 'Error invalidating chapter cache',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// Novel cache management endpoints
	warmupNovelCache: async (request: FastifyRequest) => {
		try {
			const body = request.body as any
			const { slugs } = body
			
			if (!slugs || !Array.isArray(slugs)) {
				return { success: false, message: 'slugs array required' }
			}
			
			console.log(`🔥 Warming up novel cache for ${slugs.length} novels`)
			const { NovelService } = await import('../../services/NovelService.js')
			const cached = await NovelService.warmupNovelCache(slugs)
			
			return { 
				success: true, 
				message: 'Novel cache warmup completed',
				result: { cached, total: slugs.length }
			}
		} catch (error) {
			console.error('❌ Error warming up novel cache:', error)
			return { 
				success: false, 
				message: 'Error warming up novel cache',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	invalidateNovelCache: async (request: FastifyRequest) => {
		try {
			const body = request.body as any
			const { slug } = body
			
			if (!slug) {
				return { success: false, message: 'Novel slug required' }
			}
			
			console.log(`🗑️ Invalidating novel cache: ${slug}`)
			const { NovelService } = await import('../../services/NovelService.js')
			const result = await NovelService.invalidateNovelCache(slug)
			
			return { 
				success: result, 
				message: result ? 'Novel cache invalidated successfully' : 'Failed to invalidate novel cache',
				result: { slug, invalidated: result }
			}
		} catch (error) {
			console.error('❌ Error invalidating novel cache:', error)
			return { 
				success: false, 
				message: 'Error invalidating novel cache',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	clearNovelCache: async (request: FastifyRequest) => {
		try {
			const body = request.body as any
			const { slug } = body
			
			if (!slug) {
				return { success: false, message: 'Novel slug required' }
			}
			
			console.log(`🗑️ Clearing novel cache: ${slug}`)
			const { NovelService } = await import('../../services/NovelService.js')
			const result = await NovelService.invalidateNovelCache(slug)
			
			return { 
				success: result, 
				message: result ? 'Novel cache cleared successfully' : 'Failed to clear novel cache',
				result: { slug, cleared: result }
			}
		} catch (error) {
			console.error('❌ Error clearing novel cache:', error)
			return { 
				success: false, 
				message: 'Error clearing novel cache',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// POST /cache/clear/novel-chapters - Clear all chapter caches for a novel
	clearNovelChapterCache: async (request: FastifyRequest) => {
		try {
			const body = request.body as any
			const { novelUuid } = body
			
			if (!novelUuid) {
				return { success: false, message: 'novelUuid required' }
			}
			
			console.log(`🗑️ Clearing all chapter caches for novel: ${novelUuid}`)
			const cleared = await CacheService.clearNovelChapterCache(novelUuid)
			
			return { 
				success: true, 
				message: 'Novel chapter caches cleared successfully',
				result: { novelUuid, cleared }
			}
		} catch (error) {
			console.error('❌ Error clearing novel chapter caches:', error)
			return { 
				success: false, 
				message: 'Error clearing novel chapter caches',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// GET /cache/keys - Get cache keys by pattern
	getCacheKeys: async (request: FastifyRequest) => {
		try {
			const query = request.query as any
			const pattern = query.pattern || '*'
			
			console.log(`🔍 Getting cache keys for pattern: ${pattern}`)
			const keys = await CacheService.getCacheKeys(pattern)
			
			return { 
				success: true, 
				message: 'Cache keys retrieved',
				result: { pattern, keys, count: keys.length }
			}
		} catch (error) {
			console.error('❌ Error getting cache keys:', error)
			return { 
				success: false, 
				message: 'Error getting cache keys',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// GET /cache/ttl/:key - Get TTL for a cache key
	getCacheTTL: async (request: FastifyRequest) => {
		try {
			const params = request.params as any
			const key = params.key
			
			if (!key) {
				return { success: false, message: 'Cache key required' }
			}
			
			console.log(`⏰ Getting TTL for cache key: ${key}`)
			const ttl = await CacheService.getCacheTTL(key)
			
			return { 
				success: true, 
				message: 'Cache TTL retrieved',
				result: { key, ttl, expiresIn: ttl > 0 ? `${ttl} seconds` : 'Expired/No TTL' }
			}
		} catch (error) {
			console.error('❌ Error getting cache TTL:', error)
			return { 
				success: false, 
				message: 'Error getting cache TTL',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// POST /cache/set - Set cache with custom TTL
	setCache: async (request: FastifyRequest) => {
		try {
			const body = request.body as any
			const { key, value, ttl = 3600 } = body
			
			if (!key || value === undefined) {
				return { success: false, message: 'Cache key and value required' }
			}
			
			console.log(`💾 Setting cache for key: ${key} (TTL: ${ttl}s)`)
			const result = await CacheService.setCache(key, value, ttl)
			
			return { 
				success: result, 
				message: result ? 'Cache set successfully' : 'Failed to set cache',
				result: { key, ttl, set: result }
			}
		} catch (error) {
			console.error('❌ Error setting cache:', error)
			return { 
				success: false, 
				message: 'Error setting cache',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// GET /cache/get/:key - Get cache value
	getCache: async (request: FastifyRequest) => {
		try {
			const params = request.params as any
			const key = params.key
			
			if (!key) {
				return { success: false, message: 'Cache key required' }
			}
			
			console.log(`🔍 Getting cache for key: ${key}`)
			const value = await CacheService.getCache(key)
			
			if (value === null) {
				return { 
					success: false, 
					message: 'Cache key not found',
					result: { key, found: false }
				}
			}
			
			return { 
				success: true, 
				message: 'Cache value retrieved',
				result: { key, value, found: true }
			}
		} catch (error) {
			console.error('❌ Error getting cache:', error)
			return { 
				success: false, 
				message: 'Error getting cache',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// DELETE /cache/delete/:key - Delete cache key
	deleteCache: async (request: FastifyRequest) => {
		try {
			const params = request.params as any
			const key = params.key
			
			if (!key) {
				return { success: false, message: 'Cache key required' }
			}
			
			console.log(`🗑️ Deleting cache for key: ${key}`)
			const result = await CacheService.deleteCache(key)
			
			return { 
				success: result, 
				message: result ? 'Cache deleted successfully' : 'Failed to delete cache',
				result: { key, deleted: result }
			}
		} catch (error) {
			console.error('❌ Error deleting cache:', error)
			return { 
				success: false, 
				message: 'Error deleting cache',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// POST /cache/flush - Flush all caches (dangerous - use with caution)
	flushAllCaches: async (request: FastifyRequest) => {
		try {
			console.log('⚠️ Flushing all caches...')
			const result = await CacheService.flushAllCaches()
			
			return { 
				success: result, 
				message: result ? 'All caches flushed successfully' : 'Failed to flush caches',
				result: { flushed: result }
			}
		} catch (error) {
			console.error('❌ Error flushing caches:', error)
			return { 
				success: false, 
				message: 'Error flushing caches',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	}
}
