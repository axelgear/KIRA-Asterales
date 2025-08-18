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
						refresh_interval: '5s'
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
									chapterId: { type: 'integer' },
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
			console.log('✅ Chapter list index created')
		}
	},

	// Rebuild one novel's chapter list from Mongo and index as a single ES doc
	async rebuildNovel(novelUuid: string, novelId?: number) {
		await this.ensureIndex()
		const chapters = await ChapterModel.find({ novelUuid, isPublished: true })
			.select('uuid chapterId title sequence publishedAt wordCount isPublished')
			.sort({ sequence: 1 })
			.lean()
		const chapterCount = chapters.length
		const client = getElasticsearchClient()
		await client.index({
			index: CHAPTER_LIST_INDEX,
			id: novelUuid,
			body: {
				novelUuid,
				novelId: novelId ?? null,
				chapterCount,
				chapters
			}
		})
		return { chapterCount }
	},

	// Paginated listing via nested inner_hits (only returns requested slice)
	async listByNovel(novelUuid: string, page = 1, pageSize = 50) {
		await this.ensureIndex()
		const from = (page - 1) * pageSize
		const client = getElasticsearchClient()
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
										size: pageSize,
										sort: [{ 'chapters.sequence': 'asc' }],
										_source: ['uuid','chapterId','title','sequence','publishedAt','wordCount']
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
		const hit = (result.hits.hits as any[])[0]
		if (!hit) return { items: [], total: 0, from, size: pageSize }
		const chapterCount = hit._source?.chapterCount || 0
		const inner = hit.inner_hits?.chapters?.hits?.hits || []
		const items = inner.map((h: any) => h._source)
		return { items, total: chapterCount, from, size: pageSize }
	},

	async deleteByNovel(novelUuid: string) {
		const client = getElasticsearchClient()
		await client.delete({ index: CHAPTER_LIST_INDEX, id: novelUuid })
	}
} 