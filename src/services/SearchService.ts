import { getElasticsearchClient } from '../infrastructure/elasticsearch.js'
import type { SearchParams } from '../types/common.js'

export interface NovelSearchFilters {
	genres?: string[]
	tags?: string[]
	status?: string[]
	uploaderId?: number
	published?: boolean
}

export interface ChapterSearchFilters {
	novelId?: number
	minChapter?: number
	maxChapter?: number
	published?: boolean
}

export class SearchService {
	async searchNovels(params: SearchParams & { filters?: NovelSearchFilters }): Promise<{ items: any[]; total: number; page: number; limit: number }> {
		const client = getElasticsearchClient()
		const page = Math.max(1, params.page ?? 1)
		const limit = Math.min(100, Math.max(1, params.limit ?? 20))
		const from = (page - 1) * limit
		const q = (params.q || '').trim()
		const order = (params.order || 'desc').toLowerCase() as 'asc' | 'desc'
		const sortField = params.sort || 'uploadDate'
		const filters = params.filters || {}

		const must: any[] = []
		const should: any[] = []
		const filter: any[] = []

		if (q) {
			should.push(
				{ match: { title: { query: q, fuzziness: 'AUTO', boost: 3 } } },
				{ match: { description: { query: q, fuzziness: 'AUTO', boost: 1 } } },
				{ match: { 'genres.genreName': { query: q, fuzziness: 'AUTO', boost: 0.5 } } },
				{ match: { author: { query: q, fuzziness: 'AUTO', boost: 2 } } }
			)
			must.push({ bool: { should, minimum_should_match: 1 } })
		}

		if (filters.published !== undefined) filter.push({ term: { published: filters.published } })
		if (filters.uploaderId !== undefined) filter.push({ term: { uploaderId: filters.uploaderId } })
		if (filters.status && filters.status.length) filter.push({ terms: { status: filters.status } })
		if (filters.genres && filters.genres.length) filter.push({ terms: { 'genres.genreName.keyword': filters.genres } })
		if (filters.tags && filters.tags.length) filter.push({ terms: { 'tags.tagName.keyword': filters.tags } })

		const body = {
			from,
			size: limit,
			query: {
				bool: {
					must,
					filter
				}
			},
			sort: [
				{ [sortField]: { order } },
				{ popularityScore: { order: 'desc' as const } },
				{ _score: { order: 'desc' as const } }
			],
			aggs: {
				genres: { terms: { field: 'genres.genreName.keyword', size: 50 } },
				tags: { terms: { field: 'tags.tagName.keyword', size: 100 } },
				status: { terms: { field: 'status', size: 10 } }
			},
			track_total_hits: true // Ensure we get the actual total count, not limited to 10,000
		}

		const result = await client.search({ index: 'novels-*', body }) as any
		const items = (result.hits?.hits || []).map((h: any) => ({ id: h._id, score: h._score, ...h._source }))
		const total = typeof result.hits?.total === 'object' ? result.hits.total.value : (result.hits?.total || 0)
		return { items, total, page, limit }
	}

	async searchChapters(params: SearchParams & { filters?: ChapterSearchFilters }): Promise<{ items: any[]; total: number; page: number; limit: number }> {
		const client = getElasticsearchClient()
		const page = Math.max(1, params.page ?? 1)
		const limit = Math.min(100, Math.max(1, params.limit ?? 20))
		const from = (page - 1) * limit
		const q = (params.q || '').trim()
		const order = (params.order || 'desc').toLowerCase() as 'asc' | 'desc'
		const sortField = params.sort || 'publishDateTime'
		const filters = params.filters || {}

		const must: any[] = []
		const filter: any[] = []

		if (q) {
			must.push({ match: { chapterTitle: { query: q, fuzziness: 'AUTO', boost: 2 } } })
			must.push({ match: { content: { query: q, fuzziness: 'AUTO', boost: 1 } } })
		}

		if (filters.published !== undefined) filter.push({ term: { isPublished: filters.published } })
		if (filters.novelId !== undefined) filter.push({ term: { novelId: filters.novelId } })
		if (filters.minChapter !== undefined) filter.push({ range: { chapterNumber: { gte: filters.minChapter } } })
		if (filters.maxChapter !== undefined) filter.push({ range: { chapterNumber: { lte: filters.maxChapter } } })

		const body = {
			from,
			size: limit,
			query: {
				bool: { must, filter }
			},
			sort: [
				{ [sortField]: { order } },
				{ _score: { order: 'desc' as const } }
			],
			track_total_hits: true // Ensure we get the actual total count, not limited to 10,000
		}

		const result = await client.search({ index: 'chapters-*', body }) as any
		const items = (result.hits?.hits || []).map((h: any) => ({ id: h._id, score: h._score, ...h._source }))
		const total = typeof result.hits?.total === 'object' ? result.hits.total.value : (result.hits?.total || 0)
		return { items, total, page, limit }
	}
}

export const searchService = new SearchService() 