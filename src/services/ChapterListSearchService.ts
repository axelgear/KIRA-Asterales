import { getElasticsearchClient } from '../infrastructure/elasticsearch.js'
import { ChapterModel } from '../infrastructure/models/Chapter.js'

const CHAPTER_LIST_INDEX = 'chapter_lists'

export const ChapterListSearchService = {
	async ensureIndex() {
		const client = getElasticsearchClient()
		const exists = await client.indices.exists({ index: CHAPTER_LIST_INDEX })
		if (!exists) {
			await client.indices.create({
				index: CHAPTER_LIST_INDEX,
				body: {
					settings: {
						number_of_shards: 1,
						number_of_replicas: 0,
						refresh_interval: '5s',
						// Increase inner result window for pagination
						'index.max_inner_result_window': 90000
					},
					mappings: {
						properties: {
							novelUuid: { type: 'keyword' },
							novelId: { type: 'integer' },
							chapterCount: { type: 'integer' },
							chapters: {
								type: 'nested',
								properties: {
									uuid: { type: 'keyword' },
									title: { type: 'text', analyzer: 'standard' },
									sequence: { type: 'integer' },
									publishedAt: { type: 'date' },
									wordCount: { type: 'integer' },
									isPublished: { type: 'boolean' }
								}
							}
						}
					}
				}
			})
			console.log('✅ Chapter list index created with increased inner result window')
		} else {
			// Update existing index settings if needed
			try {
				await client.indices.putSettings({
					index: CHAPTER_LIST_INDEX,
					body: {
						settings: {
							'index.max_inner_result_window': 10000
						}
					}
				})
				console.log('✅ Updated existing index with increased inner result window')
			} catch (error) {
				console.log('ℹ️ Index settings update not needed or failed:', error instanceof Error ? error.message : String(error))
			}
		}
	},

	// Rebuild one novel's chapter list from Mongo and index as a single ES doc
	async rebuildNovel(novelUuid: string, novelId?: number) {
		await this.ensureIndex()
		
		// Get ALL chapters for this novel (not batched)
		const chapters = await ChapterModel.find({ novelUuid, isPublished: true })
			.select('uuid title sequence publishedAt wordCount isPublished')
			.sort({ sequence: 1 })
			.lean()
		
		const chapterCount = chapters.length
		console.log(`📚 Indexing ${chapterCount} chapters for novel ${novelUuid}`)
		
		const client = getElasticsearchClient()
		await client.index({
			index: CHAPTER_LIST_INDEX,
			id: novelUuid,
			body: {
				novelUuid,
				novelId: novelId ?? null,
				chapterCount,
				chapters // Store ALL chapters in one document
			}
		})
		
		console.log(`✅ Indexed ${chapterCount} chapters for novel ${novelUuid}`)
		return { chapterCount }
	},

	// Paginated listing via nested inner_hits (only returns requested slice)
	async listByNovel(novelUuid: string, from = 0, size = 50) {
		await this.ensureIndex()
		const client = getElasticsearchClient()
		
		console.log(`🔍 ES Query: novelUuid=${novelUuid}, from=${from}, size=${size}`)
		
		const result = await client.search({
			index: CHAPTER_LIST_INDEX,
			request_cache: true,
			body: {
				// Match the novel doc
				query: {
					bool: {
						filter: [ { term: { novelUuid } } ],
						must: [
							{
								nested: {
									path: 'chapters',
									query: { match_all: {} },
									inner_hits: {
										from,
										size,
										sort: [{ 'chapters.sequence': 'asc' }],
										_source: true // Get all fields for debugging
									}
								}
							}
						]
					}
				},
				_source: ['chapterCount'],
				size: 1,
				track_total_hits: false
			}
		})
		
		console.log(`🔍 ES Raw result:`, JSON.stringify(result, null, 2))
		
		const hit = (result.hits.hits as any[])[0]
		if (!hit) {
			console.log(`❌ No ES hit found for novelUuid: ${novelUuid}`)
			return { items: [], total: 0, from, size }
		}
		
		const chapterCount = hit._source?.chapterCount || 0
		console.log(`📊 ES chapterCount: ${chapterCount}`)
		
		const inner = hit.inner_hits?.chapters?.hits?.hits || []
		console.log(`🔍 ES inner hits: ${inner.length} items`)
		
		// Debug: log the first few inner hits to see structure
		if (inner.length > 0) {
			console.log(`📋 First inner hit:`, JSON.stringify(inner[0], null, 2))
		}
		
		const items = inner.map((h: any) => {
			// Extract the source data and clean it up
			const source = h._source
			// Remove MongoDB _id and chapterId fields, keep only needed fields
			const { _id, chapterId, ...cleanSource } = source
			return cleanSource
		})
		
		console.log(`✅ ES returning ${items.length} items`)
		
		return { items, total: chapterCount, from, size }
	},

	async deleteByNovel(novelUuid: string) {
		const client = getElasticsearchClient()
		await client.delete({ index: CHAPTER_LIST_INDEX, id: novelUuid })
	},

	// Get full chapter manifest for a novel (all chapters stored in single ES doc)
	async getManifestByNovel(novelUuid: string): Promise<{ chapters: any[]; total: number }> {
		await this.ensureIndex()
		const client = getElasticsearchClient()
		try {
			const res = await client.get({ index: CHAPTER_LIST_INDEX, id: novelUuid })
			const source: any = (res as any)?._source || {}
			const chapters = Array.isArray(source.chapters) ? source.chapters : []
			const total = typeof source.chapterCount === 'number' ? source.chapterCount : chapters.length
			return { chapters, total }
		} catch (error) {
			console.warn(`⚠️ ES manifest not found for novel ${novelUuid}:`, error instanceof Error ? error.message : String(error))
			return { chapters: [], total: 0 }
		}
	},

	// Rebuild all novels' chapter lists (for fixing current indexing issue)
	async rebuildAllNovels() {
		await this.ensureIndex()
		
		try {
			const NovelModel = (await import('../infrastructure/models/Novel.js')).NovelModel
			const novels = await NovelModel.find({}).select('uuid novelId').lean()
			
			console.log(`🔄 Rebuilding chapter lists for ${novels.length} novels...`)
			
			let success = 0
			let errors = 0
			
			for (const novel of novels) {
				try {
					await this.rebuildNovel(novel.uuid, novel.novelId)
					success++
					if (success % 10 === 0) {
						console.log(`✅ Progress: ${success}/${novels.length} novels indexed`)
					}
				} catch (error) {
					console.error(`❌ Failed to rebuild novel ${novel.uuid}:`, error)
					errors++
				}
			}
			
			console.log(`🎉 Chapter list rebuild completed!`)
			console.log(`   ✅ Success: ${success} novels`)
			console.log(`   ❌ Errors: ${errors} novels`)
			
			return { success, errors }
		} catch (error) {
			console.error('💥 Failed to rebuild all novels:', error)
			throw error
		}
	},

} 