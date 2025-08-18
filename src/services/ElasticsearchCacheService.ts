import { getElasticsearchClient } from '../infrastructure/elasticsearch.js'

const NOVEL_INDEX = 'novels'
const CHAPTER_INDEX = 'chapters'

interface CacheService {
	optimizeIndexSettings(): Promise<void>
	warmupCaches(): Promise<void>
	getCacheStats(): Promise<any>
	clearCaches(): Promise<void>
}

export const ElasticsearchCacheService: CacheService = {
	/**
	 * Optimize index settings for better caching and performance
	 */
	async optimizeIndexSettings() {
		try {
			const client = getElasticsearchClient()
			
			// Optimize novel index settings
			await client.indices.putSettings({
				index: NOVEL_INDEX,
				body: {
					settings: {
						// Cache settings
						'index.queries.cache.enabled': true,
						'index.requests.cache.enable': true,
						'index.refresh_interval': '5s', // Balance between real-time and performance
						
						// Performance settings
						'index.number_of_replicas': 0, // For single-node setup
						'index.number_of_shards': 1 // For smaller datasets
					}
				}
			})
			
			// Optimize chapter index settings
			await client.indices.putSettings({
				index: CHAPTER_INDEX,
				body: {
					settings: {
						// Cache settings
						'index.queries.cache.enabled': true,
						'index.requests.cache.enable': true,
						'index.refresh_interval': '5s',
						
						// Performance settings
						'index.number_of_replicas': 0,
						'index.number_of_shards': 1
					}
				}
			})
			
			console.log('✅ Elasticsearch index settings optimized for caching')
		} catch (error) {
			console.error('❌ Failed to optimize index settings:', error)
		}
	},

	/**
	 * Warm up caches with common queries
	 */
	async warmupCaches() {
		try {
			const client = getElasticsearchClient()
			
			// Warm up novel caches with common queries
			const novelWarmupQueries = [
				// Recent novels (most common)
				{
					index: NOVEL_INDEX,
					body: {
						query: { bool: { filter: [{ bool: { must_not: [{ term: { approvalStatus: 'rejected' } }, { term: { approvalStatus: 'deleted' } }] } }] } },
						sort: [{ updatedAt: 'desc' }],
						size: 20
					}
				},
				// Popular novels
				{
					index: NOVEL_INDEX,
					body: {
						query: { bool: { filter: [{ bool: { must_not: [{ term: { approvalStatus: 'rejected' } }, { term: { approvalStatus: 'deleted' } }] } }] } },
						sort: [{ upvoteCount: 'desc' }, { favoritesCount: 'desc' }],
						size: 20
					}
				},
				// English novels
				{
					index: NOVEL_INDEX,
					body: {
						query: { bool: { filter: [{ term: { language: 'en' } }, { bool: { must_not: [{ term: { approvalStatus: 'rejected' } }, { term: { approvalStatus: 'deleted' } }] } }] } },
						sort: [{ updatedAt: 'desc' }],
						size: 20
					}
				}
			]
			
			// Execute warmup queries
			for (const query of novelWarmupQueries) {
				await client.search(query)
			}
			
			console.log('✅ Novel caches warmed up')
		} catch (error) {
			console.error('❌ Failed to warm up caches:', error)
		}
	},

	/**
	 * Get cache statistics
	 */
	async getCacheStats() {
		try {
			const client = getElasticsearchClient()
			
			const stats = await client.indices.stats({
				index: `${NOVEL_INDEX},${CHAPTER_INDEX}`,
				metric: 'query_cache,request_cache,fielddata'
			})
			
			const indices = stats.indices || {}
			
			return {
				novels: {
					queryCache: indices[NOVEL_INDEX]?.total?.query_cache,
					requestCache: indices[NOVEL_INDEX]?.total?.request_cache,
					fielddata: indices[NOVEL_INDEX]?.total?.fielddata
				},
				chapters: {
					queryCache: indices[CHAPTER_INDEX]?.total?.query_cache,
					requestCache: indices[CHAPTER_INDEX]?.total?.request_cache,
					fielddata: indices[CHAPTER_INDEX]?.total?.fielddata
				}
			}
		} catch (error) {
			console.error('❌ Failed to get cache stats:', error)
			return null
		}
	},

	/**
	 * Clear caches (useful for maintenance)
	 */
	async clearCaches() {
		try {
			const client = getElasticsearchClient()
			
			await client.indices.clearCache({
				index: `${NOVEL_INDEX},${CHAPTER_INDEX}`,
				query: true,
				request: true,
				fielddata: true
			})
			
			console.log('✅ Elasticsearch caches cleared')
		} catch (error) {
			console.error('❌ Failed to clear caches:', error)
		}
	}
} 