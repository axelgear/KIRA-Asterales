import { getElasticsearchClient, elasticsearchManager } from '../infrastructure/elasticsearch.js'
import { getRedisClient } from '../infrastructure/redis.js'
import { NovelModel, SearchTermModel } from '../infrastructure/models/Novel.js'

const NOVEL_INDEX = 'novels'
const SEARCH_CACHE_TTL = 300 // 5 minutes
let novelIndexEnsured = false

// Helper function to generate cache key for search results
function generateSearchCacheKey(params: any): string {
    const { q, tagIds, genreIds, language, status, approvalStatus, source, from, size, sort, sortDirection, order } = params
	const keyData = {
		q: q || '',
		tagIds: tagIds?.sort() || [],
		genreIds: genreIds?.sort() || [],
		language: language || 'all',
		status: status || 'all',
		approvalStatus: approvalStatus || 'all',
		source: source?.sort() || [],
		from: from || 0,
		size: size || 24,
		sort: sort || 'recent',
        sortDirection: sortDirection || 'desc',
        order: order || ''
	}
	return `novel_search:${JSON.stringify(keyData)}`
}

export const NovelSearchService = {
	async ensureIndex() {
		if (novelIndexEnsured) return
		const client = getElasticsearchClient()
		const exists = await client.indices.exists({ index: NOVEL_INDEX })
		if (!exists) {
			await client.indices.create({
				index: NOVEL_INDEX,
				body: {
					settings: {
						number_of_shards: 2,
						number_of_replicas: 1,
						refresh_interval: '30s', // Less frequent refresh for better write performance
						'index.queries.cache.enabled': true,
						'index.requests.cache.enable': true,
						analysis: {
							analyzer: {
								novel_analyzer: {
									type: 'custom',
									tokenizer: 'standard',
									filter: ['lowercase', 'stop']
								}
							}
						}
					},
					mappings: {
						properties: {
							// Core novel information
							novelId: { type: 'long' },
							uuid: { type: 'keyword' },
							ownerUserId: { type: 'long' },

							// Text fields with optimized analysis
							title: {
								type: 'text',
								analyzer: 'novel_analyzer',
								fields: {
									keyword: { type: 'keyword' },
									suggest: { type: 'completion' }
								}
							},
							slug: {
								type: 'keyword',
								normalizer: 'lowercase'
							},
							description: {
								type: 'text',
								analyzer: 'novel_analyzer',
								index_options: 'docs', // Only index document frequency for faster queries
								fields: {
									keyword: { type: 'keyword' }
								}
							},

							// Status and metadata
							status: { type: 'keyword' },
							language: { type: 'keyword' },
							approvalStatus: { type: 'keyword' },

							// Images and assets
							coverImg: { type: 'keyword' },

							// Metrics (optimized for sorting and filtering)
							views: { type: 'long' },
							favoritesCount: { type: 'long' },
							chaptersCount: { type: 'long' },
							wordCount: { type: 'long' },
							upvoteCount: { type: 'long' },
							downvoteCount: { type: 'long' },

							// Arrays for filtering
							source: { type: 'long' }, // Single source ID
							tagIds: { type: 'long' }, // Array of tag IDs
							genreIds: { type: 'long' }, // Array of genre IDs

							// Flattened chapter data (better performance than nested objects)
							firstChapterUuid: { type: 'keyword' },
							firstChapterTitle: { type: 'text', analyzer: 'novel_analyzer' },
							firstChapterSequence: { type: 'long' },

							latestChapterUuid: { type: 'keyword' },
							latestChapterTitle: { type: 'text', analyzer: 'novel_analyzer' },
							latestChapterSequence: { type: 'long' },

							// Timestamps
							createdAt: { type: 'date' },
							updatedAt: { type: 'date' },

							// Search optimization
							searchScore: { type: 'float' },
							popularityScore: { type: 'float' }
						}
					}
				}
			})

			// Optimize index settings for better performance
			await elasticsearchManager.optimizeIndexSettings(NOVEL_INDEX)
		}
		novelIndexEnsured = true
	},
	async indexNovel(novel: any) {
		const client = getElasticsearchClient()

		// Use tagIds and genreIds directly from the novel document
		// These are populated during migration and stored as arrays
		const tagIds = novel.tagIds || []
		const genreIds = novel.genreIds || []

		// Set default approval status if not present
		const approvalStatus = novel.approvalStatus || 'pending'

		// Calculate popularity score for sorting
		const popularityScore = (novel.upvoteCount || 0) * 0.7 +
		                       (novel.favoritesCount || 0) * 0.3 +
		                       (novel.views || 0) * 0.1

		// Prepare flattened chapter data
		const firstChapter = novel.firstChapter || {}
		const latestChapter = novel.latestChapter || {}

		await client.index({
			index: NOVEL_INDEX,
			id: String(novel.novelId),
			// Let index refresh interval handle visibility for write throughput
			body: {
				novelId: novel.novelId,
				uuid: novel.uuid,
				ownerUserId: novel.ownerUserId,
				title: novel.title,
				slug: novel.slug,
				description: novel.description,
				status: novel.status,
				language: novel.language,
				coverImg: novel.coverImg || novel.coverUrl,
				views: novel.views || 0,
				favoritesCount: novel.favoritesCount || 0,
				chaptersCount: novel.chaptersCount || 0,
				wordCount: novel.wordCount || 0,
				upvoteCount: novel.upvoteCount || 0,
				downvoteCount: novel.downvoteCount || 0,
				source: novel.source,
				tagIds,
				genreIds,
				approvalStatus,

				// Flattened chapter data
				firstChapterUuid: firstChapter.uuid,
				firstChapterTitle: firstChapter.title,
				firstChapterSequence: firstChapter.sequence || 0,

				latestChapterUuid: latestChapter.uuid,
				latestChapterTitle: latestChapter.title,
				latestChapterSequence: latestChapter.sequence || 0,

				// Optimization fields
				searchScore: 0, // Will be calculated during search if needed
				popularityScore,

				createdAt: novel.createdAt,
				updatedAt: novel.updatedAt,
			}
		})
	},
	async deleteNovel(novelId: number) {
		const client = getElasticsearchClient()
		await client.delete({ index: NOVEL_INDEX, id: String(novelId) })
		// Clear related cache entries
		await this.clearSearchCache()
	},

	// Rebuild index with new mapping (useful when mapping changes)
	async rebuildIndex() {
		try {
			const client = getElasticsearchClient()
			const exists = await client.indices.exists({ index: NOVEL_INDEX })
			
			if (exists) {
				console.log('🗑️ Deleting existing index for rebuild...')
				await client.indices.delete({ index: NOVEL_INDEX })
			}
			
			console.log('🔨 Rebuilding index with new mapping...')
			await this.ensureIndex()
			
			// Re-index all novels
			const novels = await NovelModel.find({}).lean()
			console.log(`📝 Re-indexing ${novels.length} novels...`)
			
			for (const novel of novels) {
				try {
					await this.indexNovel(novel)
				} catch (error) {
					console.warn(`⚠️ Failed to re-index novel ${novel.slug}:`, error)
				}
			}
			
			console.log(`✅ Index rebuilt successfully with ${novels.length} novels`)

			// Clear search cache after rebuild
			await this.clearSearchCache()

			return { success: true, indexed: novels.length }
		} catch (error) {
			console.error('❌ Failed to rebuild index:', error)
			return { success: false, error: error instanceof Error ? error.message : String(error) }
		}
	},

	// Get novel by slug from Elasticsearch (fast lookup)
	async getNovelBySlug(slug: string) {
		try {
			const client = getElasticsearchClient()
			await this.ensureIndex()
			
			const result = await client.search({
				index: NOVEL_INDEX,
				body: {
					query: {
						term: { slug }
					},
					_source: true,
					size: 1
				}
			})
			
			if (result.hits.hits.length > 0) {
				const hit = result.hits.hits[0]
				if (hit && hit._source) {
					const novel = hit._source
					console.log(`✅ Novel ${slug} found in Elasticsearch`)
					return novel
				}
			}
			
			console.log(`❌ Novel ${slug} not found in Elasticsearch`)
			return null
		} catch (error) {
			console.error(`❌ Elasticsearch lookup failed for novel ${slug}:`, error)
			return null
		}
	},

    async search(params: { q?: string | undefined; tagIds?: number[] | undefined; genreIds?: number[] | undefined; language?: string | undefined; status?: string | string[] | undefined; approvalStatus?: string | undefined; source?: number[] | undefined; from?: number | undefined; size?: number | undefined; sort?: 'recent' | 'popular' | undefined; order?: string | undefined; sortDirection?: 'asc' | 'desc' | 'ASC' | 'DESC' | undefined; trackTotal?: boolean }) {
		try {
			// Check cache first
			const cacheKey = generateSearchCacheKey(params)
			const redis = getRedisClient()
			const cachedResult = await redis.get(cacheKey)

			if (cachedResult) {
				console.log('✅ Cache hit for search query')
				return JSON.parse(cachedResult)
			}

			// Cache miss - perform search
			const result = await this.performElasticsearchSearch(params)

			// Cache the result
			await redis.setex(cacheKey, SEARCH_CACHE_TTL, JSON.stringify(result))
			console.log('📝 Search result cached')

			// Track search term (fire and forget - don't await to avoid blocking)
			if (params.q && params.q.trim()) {
				SearchTermModel.trackSearchTerm(
					params.q,
					{
						tagIds: params.tagIds,
						genreIds: params.genreIds,
						language: params.language,
						status: Array.isArray(params.status) ? params.status.join(',') : params.status
					},
					'elasticsearch'
				).catch((err: Error) => console.warn('Failed to track search term:', err))
			}

			return result
		} catch (error) {
			console.warn('⚠️ Elasticsearch search failed, falling back to MongoDB:', error)
			const result = await this.searchMongoDB(params as any) // Fallback to MongoDB

			// Track search term for MongoDB fallback too
			if (params.q && params.q.trim()) {
				SearchTermModel.trackSearchTerm(
					params.q,
					{
						tagIds: params.tagIds,
						genreIds: params.genreIds,
						language: params.language,
						status: params.status
					},
					'mongodb'
				).catch((err: Error) => console.warn('Failed to track search term:', err))
			}

			return result
		}
	},

	// Internal method to perform actual Elasticsearch search
    async performElasticsearchSearch(params: { q?: string | undefined; tagIds?: number[] | undefined; genreIds?: number[] | undefined; language?: string | undefined; status?: string | string[] | undefined; approvalStatus?: string | undefined; source?: number[] | undefined; from?: number | undefined; size?: number | undefined; sort?: 'recent' | 'popular' | undefined; order?: string | undefined; sortDirection?: 'asc' | 'desc' | 'ASC' | 'DESC' | undefined; trackTotal?: boolean }) {
		const client = getElasticsearchClient()
        const { q, tagIds, genreIds, language, status, approvalStatus, source, from = 0, size = 24, sort = 'recent', order, sortDirection, trackTotal = true } = params
		const must: any[] = []
		const should: any[] = []
		const filter: any[] = []

		// Filters (non-scoring) - these are cached automatically by ES
		if (approvalStatus && approvalStatus !== 'all') {
			filter.push({ term: { approvalStatus } })
		} else {
			filter.push({ bool: { must_not: [ { term: { approvalStatus: 'rejected' } }, { term: { approvalStatus: 'deleted' } } ] } })
		}
		if (tagIds?.length) filter.push({ terms: { tagIds } })
		if (genreIds?.length) filter.push({ terms: { genreIds } })
		if (language && language !== 'all') filter.push({ term: { language } })
		if (status && (Array.isArray(status) ? status.length > 0 : status !== 'all')) {
			if (Array.isArray(status)) {
				filter.push({ terms: { status } })
			} else {
				filter.push({ term: { status } })
			}
		}
		if (source?.length) filter.push({ terms: { source } })

		// Query (scoring) - improved with exact match boosting for better relevance
		if (q) {
			const lowerQ = q.toLowerCase().trim()
			
			should.push(
				// Highest priority: Exact title match (keyword field)
				{ term: { 'title.keyword': { value: q, boost: 100 } } },
				
				// Very high priority: Title starts with the query
				{ prefix: { 'title.keyword': { value: q, boost: 50 } } },
				
				// High priority: Exact phrase match in title
				{ match_phrase: { title: { query: q, boost: 25, slop: 0 } } },
				
				// Medium-high priority: Phrase match with some flexibility
				{ match_phrase: { title: { query: q, boost: 15, slop: 2 } } },
				
				// Medium priority: All words in title (AND)
				{ match: { title: { query: q, boost: 10, operator: 'and' } } },
				
				// Lower priority: Any word in title (OR)
				{ match: { title: { query: q, boost: 3 } } },
				
				// Slug match (useful for partial URL matches)
				{ wildcard: { slug: { value: `*${lowerQ.replace(/\s+/g, '-')}*`, boost: 8 } } },
				
				// Lowest priority: Description match
				{ match: { description: { query: q, boost: 1 } } }
			)
			
			must.push({ bool: { should, minimum_should_match: 1 } })
		}

        const dir = (sortDirection ?? 'desc').toString().toLowerCase() === 'asc' ? 'asc' : 'desc'
        const metric = (order ?? '').toString().toLowerCase()

        let primarySort: any | null = null
        switch (metric) {
			case 'wordcount':
				primarySort = { wordCount: dir }
				break
            case 'bookmarkcount':
            case 'bookmarks':
            case 'favorites':
            case 'favoritescount':
                primarySort = { favoritesCount: dir }
                break
            case 'views':
            case 'dailyviews':
            case 'weeklyviews':
            case 'monthlyviews':
                primarySort = { views: dir }
                break
            case 'upvotes':
            case 'upvotecount':
                primarySort = { upvoteCount: dir }
                break
            case 'chapters':
            case 'chaptercount':
            case 'chapterscount':
                primarySort = { chaptersCount: dir }
                break
            case 'updated':
            case 'recent':
                primarySort = { updatedAt: dir }
                break
            default:
                primarySort = null
        }

        // When there's a search query, prioritize relevance score first
        let sortClause: any[]
        if (q && !primarySort) {
            // For text searches without explicit sort, use relevance score
            sortClause = [{ _score: 'desc' }, { updatedAt: dir }]
        } else if (sort === 'popular') {
            sortClause = [primarySort ?? { popularityScore: 'desc' }, { updatedAt: dir }]
        } else {
            sortClause = [primarySort ?? { updatedAt: dir }]
        }

		const searchResult = await client.search({
			index: NOVEL_INDEX,
			from,
			size,
			request_cache: true,
			body: {
				_source: ['novelId', 'uuid', 'slug', 'title', 'coverImg', 'status', 'language', 'description', 'views', 'favoritesCount', 'chaptersCount', 'wordCount', 'upvoteCount', 'downvoteCount', 'updatedAt', 'approvalStatus', 'tagIds', 'genreIds', 'firstChapterUuid', 'firstChapterTitle', 'firstChapterSequence', 'latestChapterUuid', 'latestChapterTitle', 'latestChapterSequence'],
				query: must.length ? { bool: { must, filter } } : { bool: { filter } },
				sort: sortClause,
				track_total_hits: trackTotal
			}
		})

		const items = searchResult.hits.hits.map((h: any) => {
			const source = h._source
			// Reconstruct nested objects for backward compatibility
			return source
		})

		const rawTotal = typeof searchResult.hits.total === 'number' ? searchResult.hits.total : searchResult.hits.total?.value
		const total = rawTotal != null ? rawTotal : (trackTotal ? 0 : -1)

		return { items, total, from, size }
	},
	
	// MongoDB fallback search method
    async searchMongoDB(params: { q?: string | undefined; tagIds?: number[] | undefined; genreIds?: number[] | undefined; language?: string | undefined; status?: string | string[] | undefined; approvalStatus?: string | undefined; source?: number[] | undefined; from?: number | undefined; size?: number | undefined; sort?: 'recent' | 'popular' | undefined; order?: string | undefined; sortDirection?: 'asc' | 'desc' | 'ASC' | 'DESC' | undefined }) {
		try {
            const { q, tagIds, genreIds, language, status, approvalStatus, source, from = 0, size = 20, sort = 'recent', order, sortDirection } = params
			
			// Build MongoDB query
			const query: any = {}
			
			// Handle approval status filtering - FIXED LOGIC
			if (approvalStatus && approvalStatus !== 'all') {
				// If specific approval status is requested, include it
				query.approvalStatus = approvalStatus
			} else {
				// Default: exclude  rejected, and deleted
				query.approvalStatus = { 
					$nin: ['rejected', 'deleted'] 
				}
			}
			
			if (q) {
				// For MongoDB, we use text search if available, otherwise regex
				// First try exact/near-exact matches, then fallback to regex
				const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
				query.$or = [
					{ title: { $regex: `^${escapedQ}$`, $options: 'i' } }, // Exact match
					{ title: { $regex: `^${escapedQ}`, $options: 'i' } }, // Starts with
					{ title: { $regex: escapedQ, $options: 'i' } }, // Contains
					{ slug: { $regex: escapedQ.replace(/\s+/g, '-'), $options: 'i' } }, // Slug match
					{ description: { $regex: escapedQ, $options: 'i' } }
				]
			}
			
			if (tagIds?.length) query.tagIds = { $in: tagIds }
			if (genreIds?.length) query.genreIds = { $in: genreIds }
			if (language && language !== 'all') query.language = language
			if (status && (Array.isArray(status) ? status.length > 0 : status !== 'all')) {
				if (Array.isArray(status)) {
					query.status = { $in: status }
				} else {
					query.status = status
				}
			}
			if (source?.length) query.source = { $in: source }
			
            // Build sort object
            const dir = (sortDirection ?? 'desc') && String(sortDirection).toLowerCase() === 'asc' ? 1 : -1
            let sortObj: any = {}
            if (sort === 'popular') {
                const metric = (order ?? '').toString().toLowerCase()
                if (['wordcount'].includes(metric)) {
                    sortObj = { wordCount: dir, updatedAt: dir }
                } else if (['bookmarkcount', 'bookmarks', 'favorites', 'favoritescount'].includes(metric)) {
                    sortObj = { favoritesCount: dir, updatedAt: dir }
                } else if (['views', 'dailyviews', 'weeklyviews', 'monthlyviews'].includes(metric)) {
                    sortObj = { views: dir, updatedAt: dir }
                } else if (['upvotes', 'upvotecount'].includes(metric)) {
                    sortObj = { upvoteCount: dir, updatedAt: dir }
                } else if (['chapters', 'chaptercount', 'chapterscount'].includes(metric)) {
                    sortObj = { chaptersCount: dir, updatedAt: dir }
                } else {
                    // popularity fallback approximation
                    sortObj = { upvoteCount: -1, favoritesCount: -1, updatedAt: dir }
                }
            } else {
                sortObj = { updatedAt: dir }
            }
			
			// Execute query with pagination
			const [items, total] = await Promise.all([
				NovelModel.find(query)
					.sort(sortObj)
					.skip(from)
					.limit(size)
					.lean(),
				NovelModel.countDocuments(query)
			])
			
			return { items, total, from, size }
		} catch (error) {
			console.error('❌ MongoDB fallback search failed:', error)
			return { items: [], total: 0, from: 0, size: 0 }
		}
	},

	// Clear search cache (useful after data updates)
	async clearSearchCache() {
		try {
			const redis = getRedisClient()
			const keys = await redis.keys('novel_search:*')
			if (keys.length > 0) {
				await redis.del(...keys)
				console.log(`🗑️ Cleared ${keys.length} search cache entries`)
			}
		} catch (error) {
			console.error('❌ Failed to clear search cache:', error)
		}
	},

	// Get cache statistics
	async getCacheStats() {
		try {
			const redis = getRedisClient()
			const keys = await redis.keys('novel_search:*')
			return {
				totalCachedQueries: keys.length,
				cacheTTL: SEARCH_CACHE_TTL
			}
		} catch (error) {
			console.error('❌ Failed to get cache stats:', error)
			return { totalCachedQueries: 0, cacheTTL: SEARCH_CACHE_TTL }
		}
	},

	// Warm up common search queries
	async warmupCache() {
		try {
			console.log('🔥 Warming up search cache...')
			const commonQueries: Parameters<typeof this.search>[0][] = [
				{ sort: 'recent', size: 24 },
				{ sort: 'popular', size: 24 },
				{ language: 'en', sort: 'recent', size: 24 },
				{ status: 'completed', sort: 'recent', size: 24 }
			]

			for (const query of commonQueries) {
				await this.search(query)
			}

			console.log('✅ Search cache warmed up')
		} catch (error) {
			console.error('❌ Failed to warm up cache:', error)
		}
	},

	// Get search suggestions/autocomplete
	async getSearchSuggestions(prefix: string, limit: number = 10) {
		try {
			if (!prefix || prefix.trim().length < 2) {
				// Return popular terms if no prefix
				return await SearchTermModel.getPopularTerms(limit)
			}

			const suggestions = await SearchTermModel.getSimilarTerms(prefix.trim(), limit)

			// Also check Elasticsearch for completion suggestions if available
			try {
				const client = getElasticsearchClient()
				await this.ensureIndex()

				const esSuggestions = await client.search({
					index: NOVEL_INDEX,
					body: {
						suggest: {
							title_suggestions: {
								text: prefix,
								completion: {
									field: 'title.suggest',
									size: limit
								}
							}
						}
					}
				})

				const esResults = esSuggestions.suggest?.title_suggestions?.[0]?.options || []
				const esTerms = Array.isArray(esResults)
					? esResults.map((opt: any) => ({
						searchTerm: opt.text || opt._source?.title || '',
						searchCount: opt._score || 1,
						source: 'elasticsearch'
					}))
					: []

				// Combine and deduplicate results
				const combinedResults = [...suggestions, ...esTerms]
				const uniqueTerms = new Map()

				combinedResults.forEach(term => {
					const key = term.searchTerm.toLowerCase()
					if (!uniqueTerms.has(key) || uniqueTerms.get(key).searchCount < term.searchCount) {
						uniqueTerms.set(key, term)
					}
				})

				return Array.from(uniqueTerms.values()).slice(0, limit)
			} catch (esError) {
				console.warn('ES suggestions failed, using MongoDB only:', esError)
				return suggestions
			}
		} catch (error) {
			console.error('❌ Failed to get search suggestions:', error)
			return []
		}
	},

	// Get popular search terms
	async getPopularSearchTerms(limit: number = 10) {
		try {
			return await SearchTermModel.getPopularTerms(limit)
		} catch (error) {
			console.error('❌ Failed to get popular search terms:', error)
			return []
		}
	},

	// Get recent search terms
	async getRecentSearchTerms(limit: number = 10) {
		try {
			return await SearchTermModel.getRecentTerms(limit)
		} catch (error) {
			console.error('❌ Failed to get recent search terms:', error)
			return []
		}
	},

	// Clean up old search terms
	async cleanupSearchTerms(keepDays: number = 30, minCount: number = 3) {
		try {
			const result = await SearchTermModel.cleanupOldTerms(keepDays, minCount)
			console.log(`🧹 Cleaned up ${result.deletedCount} old search terms`)
			return result
		} catch (error) {
			console.error('❌ Failed to cleanup search terms:', error)
			return { deletedCount: 0 }
		}
	}
} 