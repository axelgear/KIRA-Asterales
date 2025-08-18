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
			refresh: 'wait_for',
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
				approvalStatus, // Add approval status to the indexed document
				createdAt: novel.createdAt,
				updatedAt: novel.updatedAt,
			}
		})
	},
	async deleteNovel(novelId: number) {
		const client = getElasticsearchClient()
		await client.delete({ index: NOVEL_INDEX, id: String(novelId), refresh: 'wait_for' })
	},
	async search(params: { q?: string | undefined; tagIds?: number[] | undefined; genreIds?: number[] | undefined; language?: string | undefined; status?: string | undefined; approvalStatus?: string | undefined; source?: number[] | undefined; from?: number | undefined; size?: number | undefined; sort?: 'recent' | 'popular' | undefined }) {
		try {
			const client = getElasticsearchClient()
			const { q, tagIds, genreIds, language, status, approvalStatus, source, from = 0, size = 20, sort = 'recent' } = params
			const must: any[] = []
			
			// Handle approval status filtering
			if (approvalStatus && approvalStatus !== 'all') {
				// If specific approval status is requested, include it
				must.push({ term: { approvalStatus } })
			} else {
				// Default: exclude approved, rejected, and deleted
				must.push({ 
					bool: { 
						must_not: [
							{ term: { approvalStatus: 'rejected' } },
							{ term: { approvalStatus: 'deleted' } }
						]
					}
				})
			}
			
			if (q) must.push({ multi_match: { query: q, fields: ['title^3', 'description'], operator: 'and' } })
			if (tagIds?.length) must.push({ terms: { tagIds } })
			if (genreIds?.length) must.push({ terms: { genreIds } })
			if (language && language !== 'all') must.push({ term: { language } })
			if (status && status !== 'all') must.push({ term: { status } })
			if (source?.length) must.push({ terms: { source } }) // Search by source IDs
			
			const sortClause = sort === 'popular' ? [{ upvoteCount: 'desc' }, { favoritesCount: 'desc' }, { updatedAt: 'desc' }] : [{ updatedAt: 'desc' }]
			
			const result = await client.search({
				index: NOVEL_INDEX,
				from,
				size,
				body: {
					query: must.length ? { bool: { must } } : { match_all: {} },
					sort: sortClause,
					track_total_hits: true // Ensure we get the actual total count, not limited to 10,000
				}
			})
			
			const items = result.hits.hits.map((h: any) => h._source)
			const total = typeof result.hits.total === 'number' ? result.hits.total : result.hits.total?.value || 0
			
			return { items, total, from, size }
		} catch (error) {
			console.warn('⚠️ Elasticsearch search failed, falling back to MongoDB:', error)
			return await this.searchMongoDB(params) // Fallback to MongoDB
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