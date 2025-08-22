import { redisManager } from '../infrastructure/redis.js'
import { ChapterModel } from '../infrastructure/models/Chapter.js'

export const CacheService = {
	// Get cache statistics for monitoring
	async getCacheStats(): Promise<{ hitRate: number; totalRequests: number; cacheSize: string }> {
		try {
			const client = redisManager.getClient()
			const info = await client.info('stats')
			
			// Parse Redis info for cache statistics
			const lines = info.split('\r\n')
			const stats: any = {}
			
			lines.forEach(line => {
				const [key, value] = line.split(':')
				if (key && value) {
					stats[key] = parseInt(value) || 0
				}
			})
			
			const totalRequests = (stats.total_commands_processed || 0) + (stats.total_net_input_bytes || 0)
			const hitRate = stats.keyspace_hits ? (stats.keyspace_hits / (stats.keyspace_hits + stats.keyspace_misses)) * 100 : 0
			const cacheSize = stats.used_memory_human || '0B'
			
			return {
				hitRate: Math.round(hitRate * 100) / 100,
				totalRequests,
				cacheSize
			}
		} catch (error) {
			console.error('❌ Failed to get cache stats:', error)
			return { hitRate: 0, totalRequests: 0, cacheSize: '0B' }
		}
	},

	// Warm up cache for frequently accessed chapters
	async warmupChapterCache(novelUuid: string, limit: number = 10): Promise<number> {
		try {
			console.log(`🔥 Warming up chapter cache for novel ${novelUuid} (first ${limit} chapters)`)
			
			const chapters = await ChapterModel.find({ novelUuid, isPublished: true })
				.select('uuid title sequence publishedAt wordCount isPublished')
				.sort({ sequence: 1 })
				.limit(limit)
				.lean()
			
			let cached = 0
			for (const chapter of chapters) {
				try {
					const cacheKey = `chapter:${chapter.uuid}`
					await redisManager.set(cacheKey, chapter, 3600)
					cached++
				} catch (cacheError) {
					console.warn(`⚠️ Failed to cache chapter ${chapter.uuid}:`, cacheError)
				}
			}
			
			console.log(`✅ Chapter cache warmed up: ${cached}/${chapters.length} chapters cached`)
			return cached
		} catch (error) {
			console.error(`❌ Failed to warm up chapter cache for novel ${novelUuid}:`, error)
			return 0
		}
	},

	// Invalidate specific chapter cache
	async invalidateChapterCache(uuid: string): Promise<boolean> {
		try {
			const cacheKey = `chapter:${uuid}`
			const deleted = await redisManager.delete(cacheKey)
			if (deleted) {
				console.log(`🗑️ Chapter cache invalidated for ${uuid}`)
			}
			return deleted
		} catch (error) {
			console.error(`❌ Failed to invalidate chapter cache for ${uuid}:`, error)
			return false
		}
	},

	// Clear all chapter caches for a novel
	async clearNovelChapterCache(novelUuid: string): Promise<number> {
		try {
			console.log(`🗑️ Clearing all chapter caches for novel ${novelUuid}`)
			
			const chapters = await ChapterModel.find({ novelUuid })
				.select('uuid')
				.lean()
			
			let cleared = 0
			for (const chapter of chapters) {
				try {
					const cacheKey = `chapter:${chapter.uuid}`
					const deleted = await redisManager.delete(cacheKey)
					if (deleted) cleared++
				} catch (cacheError) {
					console.warn(`⚠️ Failed to clear chapter cache ${chapter.uuid}:`, cacheError)
				}
			}
			
			console.log(`✅ Cleared ${cleared}/${chapters.length} chapter caches for novel ${novelUuid}`)
			return cleared
		} catch (error) {
			console.error(`❌ Failed to clear novel chapter cache for ${novelUuid}:`, error)
			return 0
		}
	},

	// Get cache keys by pattern
	async getCacheKeys(pattern: string): Promise<string[]> {
		try {
			const client = redisManager.getClient()
			const keys = await client.keys(pattern)
			return keys
		} catch (error) {
			console.error(`❌ Failed to get cache keys for pattern ${pattern}:`, error)
			return []
		}
	},

	// Get cache TTL for a key
	async getCacheTTL(key: string): Promise<number> {
		try {
			return await redisManager.ttl(key)
		} catch (error) {
			console.error(`❌ Failed to get TTL for key ${key}:`, error)
			return -1
		}
	},

	// Set cache with custom TTL
	async setCache(key: string, value: any, ttl: number = 3600): Promise<boolean> {
		try {
			return await redisManager.set(key, value, ttl)
		} catch (error) {
			console.error(`❌ Failed to set cache for key ${key}:`, error)
			return false
		}
	},

	// Get cache value
	async getCache(key: string): Promise<any> {
		try {
			return await redisManager.get(key)
		} catch (error) {
			console.error(`❌ Failed to get cache for key ${key}:`, error)
			return null
		}
	},

	// Delete cache key
	async deleteCache(key: string): Promise<boolean> {
		try {
			return await redisManager.delete(key)
		} catch (error) {
			console.error(`❌ Failed to delete cache for key ${key}:`, error)
			return false
		}
	},

	// Flush all caches (dangerous - use with caution)
	async flushAllCaches(): Promise<boolean> {
		try {
			console.log('⚠️ Flushing all caches...')
			const client = redisManager.getClient()
			await client.flushall()
			console.log('✅ All caches flushed')
			return true
		} catch (error) {
			console.error('❌ Failed to flush all caches:', error)
			return false
		}
	}
}
