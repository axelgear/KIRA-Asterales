import { getElasticsearchClient } from '../infrastructure/elasticsearch.js'

const TAG_INDEX = 'tags'
const GENRE_INDEX = 'genres'

export const TaxonomySearchService = {
	// Tag indexing
	async ensureTagIndex() {
		const client = getElasticsearchClient()
		const exists = await client.indices.exists({ index: TAG_INDEX })
		if (!exists) {
			await client.indices.create({
				index: TAG_INDEX,
				body: {
					mappings: {
						properties: {
							tagId: { type: 'integer' },
							slug: { type: 'keyword' },
							names: {
								type: 'object',
								properties: {
									en: { type: 'text', analyzer: 'standard' },
									zh: { type: 'text', analyzer: 'standard' },
									ja: { type: 'text', analyzer: 'standard' }
								}
							},
							description: { type: 'text', analyzer: 'standard' },
							color: { type: 'keyword' },
							usageCount: { type: 'integer' }, // How many novels use this tag
							createdAt: { type: 'date' },
							updatedAt: { type: 'date' }
						}
					},
					settings: {
						number_of_shards: 1,
						number_of_replicas: 0,
						refresh_interval: '1s'
					}
				}
			})
			console.log('✅ Tag index created')
		}
	},

	async indexTag(tag: any) {
		const client = getElasticsearchClient()
		await client.index({
			index: TAG_INDEX,
			id: String(tag.tagId),
			refresh: 'wait_for',
			body: {
				tagId: tag.tagId,
				slug: tag.slug,
				names: tag.names || {},
				description: tag.description || '',
				color: tag.color || '',
				usageCount: tag.usageCount || 0,
				createdAt: tag.createdAt,
				updatedAt: tag.updatedAt
			}
		})
	},

	async updateTagUsageCount(tagId: number, increment: boolean = true) {
		const client = getElasticsearchClient()
		await client.update({
			index: TAG_INDEX,
			id: String(tagId),
			body: {
				script: {
					source: `ctx._source.usageCount += ${increment ? 1 : -1}`,
					lang: 'painless'
				}
			},
			refresh: 'wait_for'
		})
	},

	async listTags(page = 1, pageSize = 100) {
		try {
			const client = getElasticsearchClient()
			const from = (page - 1) * pageSize
			
			const result = await client.search({
				index: TAG_INDEX,
				from,
				size: pageSize,
				body: {
					query: { match_all: {} },
					sort: [{ usageCount: 'desc' }, { tagId: 'asc' }],
					_source: ['tagId', 'slug', 'names', 'description', 'color', 'usageCount']
				}
			})
			
			const items = result.hits.hits.map((h: any) => h._source)
			const total = typeof result.hits.total === 'number' ? result.hits.total : result.hits.total?.value || 0
			
			return { items, total, from, size: pageSize }
		} catch (error) {
			console.warn('⚠️ Tag listing from ES failed:', error)
			return null
		}
	},

	// Genre indexing
	async ensureGenreIndex() {
		const client = getElasticsearchClient()
		const exists = await client.indices.exists({ index: GENRE_INDEX })
		if (!exists) {
			await client.indices.create({
				index: GENRE_INDEX,
				body: {
					mappings: {
						properties: {
							genreId: { type: 'integer' },
							slug: { type: 'keyword' },
							names: {
								type: 'object',
								properties: {
									en: { type: 'text', analyzer: 'standard' },
									zh: { type: 'text', analyzer: 'standard' },
									ja: { type: 'text', analyzer: 'standard' }
								}
							},
							description: { type: 'text', analyzer: 'standard' },
							color: { type: 'keyword' },
							usageCount: { type: 'integer' }, // How many novels use this genre
							createdAt: { type: 'date' },
							updatedAt: { type: 'date' }
						}
					},
					settings: {
						number_of_shards: 1,
						number_of_replicas: 0,
						refresh_interval: '1s'
					}
				}
			})
			console.log('✅ Genre index created')
		}
	},

	async indexGenre(genre: any) {
		const client = getElasticsearchClient()
		await client.index({
			index: GENRE_INDEX,
			id: String(genre.genreId),
			body: {
				genreId: genre.genreId,
				slug: genre.slug,
				names: genre.names || {},
				description: genre.description || '',
				color: genre.color || '',
				usageCount: genre.usageCount || 0,
				createdAt: genre.createdAt,
				updatedAt: genre.updatedAt
			}
		})
	},

	async updateGenreUsageCount(genreId: number, increment: boolean = true) {
		const client = getElasticsearchClient()
		await client.update({
			index: GENRE_INDEX,
			id: String(genreId),
			body: {
				script: {
					source: `ctx._source.usageCount += ${increment ? 1 : -1}`,
					lang: 'painless'
				}
			},
			refresh: 'wait_for'
		})
	},

	async listGenres(page = 1, pageSize = 100) {
		try {
			const client = getElasticsearchClient()
			const from = (page - 1) * pageSize
			
			const result = await client.search({
				index: GENRE_INDEX,
				from,
				size: pageSize,
				body: {
					query: { match_all: {} },
					sort: [{ usageCount: 'desc' }, { genreId: 'asc' }],
					_source: ['genreId', 'slug', 'names', 'description', 'color', 'usageCount']
				}
			})
			
			const items = result.hits.hits.map((h: any) => h._source)
			const total = typeof result.hits.total === 'number' ? result.hits.total : result.hits.total?.value || 0
			
			return { items, total, from, size: pageSize }
		} catch (error) {
			console.warn('⚠️ Genre listing from ES failed:', error)
			return null
		}
	},

	// Bulk operations for initial indexing
	async bulkIndexTags(tags: any[]) {
		if (tags.length === 0) return
		
		const client = getElasticsearchClient()
		const operations = tags.flatMap(tag => [
			{ index: { _index: TAG_INDEX, _id: String(tag.tagId) } },
			{
				tagId: tag.tagId,
				slug: tag.slug,
				names: tag.names || {},
				description: tag.description || '',
				color: tag.color || '',
				usageCount: tag.usageCount || 0,
				createdAt: tag.createdAt,
				updatedAt: tag.updatedAt
			}
		])

		await client.bulk({ 
			body: operations,
			refresh: 'wait_for'
		})
		console.log(`✅ Bulk indexed ${tags.length} tags`)
	},

	async bulkIndexGenres(genres: any[]) {
		if (genres.length === 0) return
		
		const client = getElasticsearchClient()
		const operations = genres.flatMap(genre => [
			{ index: { _index: GENRE_INDEX, _id: String(genre.genreId) } },
			{
				genreId: genre.genreId,
				slug: genre.slug,
				names: genre.names || {},
				description: genre.description || '',
				color: genre.color || '',
				usageCount: genre.usageCount || 0,
				createdAt: genre.createdAt,
				updatedAt: genre.updatedAt
			}
		])

		await client.bulk({ 
			body: operations,
			refresh: 'wait_for'
		})
		console.log(`✅ Bulk indexed ${genres.length} genres`)
	}
} 