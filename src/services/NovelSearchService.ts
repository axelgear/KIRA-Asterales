import { getElasticsearchClient } from '../infrastructure/elasticsearch.js'
import { NovelModel } from '../infrastructure/models/Novel.js'

const NOVEL_INDEX = 'novels'

export const NovelSearchService = {
	async ensureIndex() {
		const client = getElasticsearchClient()
		const exists = await client.indices.exists({ index: NOVEL_INDEX })
		if (!exists) {
			await client.indices.create({
				index: NOVEL_INDEX,
				body: {
					mappings: {
						properties: {
							novelId: { type: 'integer' },
							uuid: { type: 'keyword' },
							ownerUserId: { type: 'integer' },
							title: { type: 'text', analyzer: 'standard' },
							slug: { type: 'keyword' },
							description: { type: 'text', analyzer: 'standard' },
							status: { type: 'keyword' },
							language: { type: 'keyword' },
							coverImg: { type: 'keyword' },
							views: { type: 'integer' },
							favoritesCount: { type: 'integer' },
							chaptersCount: { type: 'integer' },
							upvoteCount: { type: 'integer' },
							downvoteCount: { type: 'integer' },
							source: { type: 'integer' }, // Array of source IDs
							tagIds: { type: 'integer' },
							genreIds: { type: 'integer' },
							firstChapter: {
								type: 'object',
								properties: {
									uuid: { type: 'keyword' },
									title: { type: 'text' },
									sequence: { type: 'integer' }
								}
							},
							latestChapter: {
								type: 'object',
								properties: {
									uuid: { type: 'keyword' },
									title: { type: 'text' },
									sequence: { type: 'integer' }
								}
							},
							approvalStatus: { type: 'keyword' }, // Add approval status field
							createdAt: { type: 'date' },
							updatedAt: { type: 'date' }
						}
					}
				}
			})
		}
	},
	async indexNovel(novel: any) {
		const client = getElasticsearchClient()
		
		// Use tagIds and genreIds directly from the novel document
		// These are populated during migration and stored as arrays
		const tagIds = novel.tagIds || []
		const genreIds = novel.genreIds || []
		
		// Set default approval status if not present
		const approvalStatus = novel.approvalStatus || 'pending'
		
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
				views: novel.views,
				favoritesCount: novel.favoritesCount,
				chaptersCount: novel.chaptersCount,
				upvoteCount: novel.upvoteCount,
				downvoteCount: novel.downvoteCount,
				source: novel.source, // Add source to the indexed document
				tagIds,
				genreIds,
				firstChapter: novel.firstChapter,
				latestChapter: novel.latestChapter,
				approvalStatus, // Add approval status to the indexed document
				createdAt: novel.createdAt,
				updatedAt: novel.updatedAt,
			}
		})
	},
	async deleteNovel(novelId: number) {
		const client = getElasticsearchClient()
		await client.delete({ index: NOVEL_INDEX, id: String(novelId) })
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

	async search(params: { q?: string | undefined; tagIds?: number[] | undefined; genreIds?: number[] | undefined; language?: string | undefined; status?: string | undefined; approvalStatus?: string | undefined; source?: number[] | undefined; from?: number | undefined; size?: number | undefined; sort?: 'recent' | 'popular' | undefined; trackTotal?: boolean }) {
		try {
			const client = getElasticsearchClient()
			const { q, tagIds, genreIds, language, status, approvalStatus, source, from = 0, size = 24, sort = 'recent', trackTotal = true } = params
			const must: any[] = []
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
			if (status && status !== 'all') filter.push({ term: { status } })
			if (source?.length) filter.push({ terms: { source } })
			
			// Query (scoring) - only when q provided
			if (q) must.push({ multi_match: { query: q, fields: ['title^3', 'description'], operator: 'and' } })
			
			const sortClause = sort === 'popular' ? [{ upvoteCount: 'desc' }, { favoritesCount: 'desc' }, { updatedAt: 'desc' }] : [{ updatedAt: 'desc' }]
			
			const searchResult = await client.search({
				index: NOVEL_INDEX,
				from,
				size,
				request_cache: true, // Enable request cache for repeated queries
				body: {
					_source: ['novelId', 'uuid', 'slug', 'title', 'coverImg', 'status', 'language','description', 'views', 'favoritesCount', 'chaptersCount', 'upvoteCount', 'downvoteCount', 'updatedAt', 'approvalStatus', 'tagIds', 'genreIds', 'firstChapter', 'latestChapter'],
					query: must.length ? { bool: { must, filter } } : { bool: { filter } },
					sort: sortClause,
					track_total_hits: trackTotal
				}
			})
			
			const items = searchResult.hits.hits.map((h: any) => h._source)
			const total = typeof searchResult.hits.total === 'number' ? searchResult.hits.total : searchResult.hits.total?.value || 0
			
			return { items, total, from, size }
		} catch (error) {
			console.warn('⚠️ Elasticsearch search failed, falling back to MongoDB:', error)
			return await this.searchMongoDB(params as any) // Fallback to MongoDB
		}
	},
	
	// MongoDB fallback search method
	async searchMongoDB(params: { q?: string | undefined; tagIds?: number[] | undefined; genreIds?: number[] | undefined; language?: string | undefined; status?: string | undefined; approvalStatus?: string | undefined; source?: number[] | undefined; from?: number | undefined; size?: number | undefined; sort?: 'recent' | 'popular' | undefined }) {
		try {
			const { q, tagIds, genreIds, language, status, approvalStatus, source, from = 0, size = 20, sort = 'recent' } = params
			
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
				query.$or = [
					{ title: { $regex: q, $options: 'i' } },
					{ description: { $regex: q, $options: 'i' } }
				]
			}
			
			if (tagIds?.length) query.tagIds = { $in: tagIds }
			if (genreIds?.length) query.genreIds = { $in: genreIds }
			if (language && language !== 'all') query.language = language
			if (status && status !== 'all') query.status = status
			if (source?.length) query.source = { $in: source }
			
			// Build sort object
			let sortObj: any = {}
			if (sort === 'popular') {
				sortObj = { upvoteCount: -1, favoritesCount: -1, updatedAt: -1 }
			} else {
				sortObj = { updatedAt: -1 }
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
	}
} 