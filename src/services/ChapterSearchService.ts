import { getElasticsearchClient } from '../infrastructure/elasticsearch.js'

const CHAPTER_INDEX = 'chapters'

export const ChapterSearchService = {
	async ensureIndex() {
		const client = getElasticsearchClient()
		const exists = await client.indices.exists({ index: CHAPTER_INDEX })
		if (!exists) {
			await client.indices.create({
				index: CHAPTER_INDEX,
				body: {
					mappings: {
						properties: {
							uuid: { type: 'keyword' },           // Unique chapter identifier
							chapterId: { type: 'integer' },      // Numeric ID for sorting
							novelUuid: { type: 'keyword' },      // Link to novel
							title: { type: 'text', analyzer: 'standard' }, // Searchable title
							sequence: { type: 'integer' },       // Chapter order
							publishedAt: { type: 'date' },       // Publication date
							wordCount: { type: 'integer' },      // Word count for stats
							isPublished: { type: 'boolean' },     // Publication status
							createdAt: { type: 'date' },         // Creation timestamp
							updatedAt: { type: 'date' }          // Last update timestamp
						}
					},
					settings: {
						// Optimize for fast listing and filtering
						number_of_shards: 1,
						number_of_replicas: 0,
						refresh_interval: '5s',
						index: {
							// Use dot notation for sort configuration
							"sort.field": "sequence",
							"sort.order": "asc"
						}
					}
				}
			})
			console.log('✅ Chapter index created with optimized settings')
		}
	},

	async indexChapter(chapter: any) {
		const client = getElasticsearchClient()
		
		// Only index lightweight data, NOT content
		await client.index({
			index: CHAPTER_INDEX,
			id: chapter.uuid, // Use UUID as document ID for uniqueness
			routing: chapter.novelUuid,
			body: {
				uuid: chapter.uuid,
				chapterId: chapter.chapterId,
				novelUuid: chapter.novelUuid,
				title: chapter.title,
				sequence: chapter.sequence,
				publishedAt: chapter.publishedAt || chapter.createdAt,
				wordCount: chapter.wordCount || 0,
				isPublished: chapter.isPublished !== false, // Default to true
				createdAt: chapter.createdAt,
				updatedAt: chapter.updatedAt
			}
		})
	},

	async bulkIndexChapters(chapters: any[]) {
		if (chapters.length === 0) return
		
		const client = getElasticsearchClient()
		const operations = chapters.flatMap(chapter => [
			{ index: { _index: CHAPTER_INDEX, _id: chapter.uuid, routing: chapter.novelUuid } },
			{
				uuid: chapter.uuid,
				chapterId: chapter.chapterId,
				novelUuid: chapter.novelUuid,
				title: chapter.title,
				sequence: chapter.sequence,
				publishedAt: chapter.publishedAt || chapter.createdAt,
				wordCount: chapter.wordCount || 0,
				isPublished: chapter.isPublished !== false,
				createdAt: chapter.createdAt,
				updatedAt: chapter.updatedAt
			}
		])

		await client.bulk({ 
			body: operations
		})
		console.log(`✅ Bulk indexed ${chapters.length} chapters`)
	},

	async updateChapter(chapter: any) {
		// Update existing chapter index
		await this.indexChapter(chapter)
	},

	async deleteChapter(uuid: string, novelUuid?: string) {
		const client = getElasticsearchClient()
		await client.delete({ 
			index: CHAPTER_INDEX, 
			id: uuid,
			...(novelUuid ? { routing: novelUuid } : {})
		})
	},

	async deleteByNovelUuid(novelUuid: string) {
		const client = getElasticsearchClient()
		await client.deleteByQuery({
			index: CHAPTER_INDEX,
			body: {
				query: { term: { novelUuid } }
			},
			refresh: true,
			routing: novelUuid
		})
		console.log(`✅ Deleted all chapters for novel: ${novelUuid}`)
	},

	// Fast listing without search - optimized for pagination
	async listChaptersByNovel(novelUuid: string, page = 1, pageSize = 50) {
		try {
			const client = getElasticsearchClient()
			const from = (page - 1) * pageSize
			
			const result = await client.search({
				index: CHAPTER_INDEX,
				from,
				size: pageSize,
				routing: novelUuid,
				request_cache: true,
				body: {
					query: { 
						bool: { 
							filter: [
								{ term: { novelUuid } },
								{ term: { isPublished: true } }
							]
						} 
					},
					sort: [{ sequence: 'asc' }],
					_source: ['uuid', 'chapterId', 'title', 'sequence', 'publishedAt', 'wordCount'],
					track_total_hits: false
				}
			})
			
			const items = result.hits.hits.map((h: any) => h._source)
			const total = typeof result.hits.total === 'number' ? result.hits.total : result.hits.total?.value || 0
			
			return { items, total, from, size: pageSize }
		} catch (error) {
			console.warn('⚠️ Chapter listing from ES failed, falling back to MongoDB:', error)
			return null // Signal to use MongoDB fallback
		}
	},

	// Get chapter by UUID for quick lookups
	async getChapterByUuid(uuid: string, novelUuid?: string) {
		try {
			const client = getElasticsearchClient()
			const result = await client.get({
				index: CHAPTER_INDEX,
				id: uuid,
				...(novelUuid ? { routing: novelUuid } : {})
			})
			return result._source
		} catch (error) {
			console.warn('⚠️ Chapter lookup from ES failed:', error)
			return null
		}
	}
} 