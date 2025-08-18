import { getElasticsearchClient } from '../infrastructure/elasticsearch.js'

const CHAPTER_INDEX = 'chapters'
const CHAPTER_LIST_INDEX = 'chapter-lists' // New index for novel chapter lists

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

		// Ensure chapter list index exists
		const listExists = await client.indices.exists({ index: CHAPTER_LIST_INDEX })
		if (!listExists) {
			await client.indices.create({
				index: CHAPTER_LIST_INDEX,
				body: {
					mappings: {
						properties: {
							novelUuid: { type: 'keyword' },      // Novel identifier
							novelId: { type: 'integer' },        // Novel numeric ID
							totalChapters: { type: 'integer' },  // Total chapter count
							lastUpdated: { type: 'date' },       // Last update timestamp
							chapters: {
								type: 'nested',
								properties: {
									uuid: { type: 'keyword' },
									chapterId: { type: 'integer' },
									title: { type: 'text' },
									sequence: { type: 'integer' },
									publishedAt: { type: 'date' },
									wordCount: { type: 'integer' },
									isPublished: { type: 'boolean' }
								}
							}
						}
					},
					settings: {
						number_of_shards: 1,
						number_of_replicas: 0,
						refresh_interval: '5s'
					}
				}
			})
			console.log('✅ Chapter list index created')
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
				routing: novelUuid, // Ensures all chapters of a novel are on same shard
				request_cache: true, // Enable request cache for repeated queries
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
					track_total_hits: true
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
	},

	// Chapter List Management (Single Document Per Novel)
	async indexChapterList(novelUuid: string, novelId: number, chapters: any[]) {
		try {
			const client = getElasticsearchClient()
			
			// Filter published chapters and sort by sequence
			const publishedChapters = chapters
				.filter(ch => ch.isPublished !== false)
				.sort((a, b) => a.sequence - b.sequence)
				.map(ch => ({
					uuid: ch.uuid,
					chapterId: ch.chapterId,
					title: ch.title,
					sequence: ch.sequence,
					publishedAt: ch.publishedAt || ch.createdAt,
					wordCount: ch.wordCount || 0,
					isPublished: ch.isPublished !== false
				}))

			await client.index({
				index: CHAPTER_LIST_INDEX,
				id: novelUuid,
				body: {
					novelUuid,
					novelId,
					totalChapters: publishedChapters.length,
					lastUpdated: new Date(),
					chapters: publishedChapters
				}
			})
			
			console.log(`✅ Indexed chapter list for novel ${novelUuid} with ${publishedChapters.length} chapters`)
		} catch (error) {
			console.error('❌ Failed to index chapter list:', error)
		}
	},

	// Fast chapter listing using single document per novel
	async fastListChaptersByNovel(novelUuid: string, page = 1, pageSize = 50) {
		try {
			const client = getElasticsearchClient()
			const from = (page - 1) * pageSize
			
			const result = await client.search({
				index: CHAPTER_LIST_INDEX,
				body: {
					query: { term: { novelUuid } },
					_source: ['chapters', 'totalChapters'],
					size: 1
				}
			})
			
			const hits = result.hits?.hits || []
			if (hits.length === 0 || !hits[0]?._source) {
				return { items: [], total: 0, from, size: pageSize }
			}
			
			const chapterList = hits[0]._source as any
			const allChapters = chapterList?.chapters || []
			const total = chapterList?.totalChapters || allChapters.length
			
			// Manual pagination on the chapters array
			const items = allChapters.slice(from, from + pageSize)
			
			return { items, total, from, size: pageSize }
		} catch (error) {
			console.warn('⚠️ Fast chapter listing failed, falling back to individual chapters:', error)
			return null // Signal to use fallback
		}
	},

	// Update chapter list when chapters change
	async updateChapterList(novelUuid: string, novelId: number) {
		try {
			// Get all chapters for this novel from MongoDB
			const { ChapterModel } = await import('../infrastructure/models/Chapter.js')
			const chapters = await ChapterModel.find({ novelUuid, isPublished: true })
				.sort({ sequence: 1 })
				.lean()
			
			// Re-index the chapter list
			await this.indexChapterList(novelUuid, novelId, chapters)
		} catch (error) {
			console.error('❌ Failed to update chapter list:', error)
		}
	}
} 