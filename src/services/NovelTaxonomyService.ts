import { randomUUID } from 'node:crypto'
import { NovelTagModel } from '../infrastructure/models/NovelTag.js'
import { NovelGenreModel } from '../infrastructure/models/NovelGenre.js'
import { redisManager } from '../infrastructure/redis.js'
import { TaxonomySearchService } from './TaxonomySearchService.js'

// Cache keys
const CACHE_KEYS = {
  TAGS: 'taxonomy:tags',
  GENRES: 'taxonomy:genres',
  TAG_COUNT: 'taxonomy:tag_count',
  GENRE_COUNT: 'taxonomy:genre_count'
} as const

// Cache TTL (1 hour for static data)
const CACHE_TTL = 3600

export const NovelTaxonomyService = {
	// Tag operations
	async createTag(params: { name: string; description?: string; color?: string }) {
		const tagId = await this.getNextTagId()
		const uuid = randomUUID()
		const slug = params.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
		
		const tag = await NovelTagModel.create({
			tagId,
			uuid,
			slug,
			defaultLocale: 'en',
			names: { en: params.name },
			color: params.color || '#999999',
			description: params.description || ''
		})
		
		// Invalidate cache
		await this.invalidateTagCache()
		
		return tag
	},

	async updateTag(tagId: number, patch: Partial<{ name: string; description: string; color: string }>) {
		const updateData: any = {}
		if (patch.name) updateData['names.en'] = patch.name
		if (patch.description) updateData.description = patch.description
		if (patch.color) updateData.color = patch.color
		
		const updated = await NovelTagModel.findOneAndUpdate(
			{ tagId },
			{ $set: updateData },
			{ new: true }
		)
		
		if (updated) {
			// Invalidate cache
			await this.invalidateTagCache()
		}
		
		return updated
	},

	async deleteTag(tagId: number) {
		const result = await NovelTagModel.deleteOne({ tagId })
		if (result.deletedCount > 0) {
			// Invalidate cache
			await this.invalidateTagCache()
		}
		return { success: result.deletedCount > 0 }
	},

	async listTags(page = 1, pageSize = 500) {
		try {
			// Try Redis cache first
			const cached = await this.getCachedTags(page, pageSize)
			if (cached) return cached
			
			// First try Elasticsearch for fast listing
			await TaxonomySearchService.ensureTagIndex()
			const esResult = await TaxonomySearchService.listTags(page, pageSize)
			if (esResult) {
				await this.cacheTags(page, pageSize, esResult)
				console.log(`✅ Tags listed from ES: ${esResult.items.length}/${esResult.total}`)
				return esResult
			}
			
			// Fallback to MongoDB if ES fails
			console.log('🔄 Falling back to MongoDB for tag listing')
			const skip = (page - 1) * pageSize
			const [items, total] = await Promise.all([
				NovelTagModel.find({})
					.sort({ tagId: 1 })
					.skip(skip)
					.limit(pageSize)
					.lean(),
				NovelTagModel.countDocuments({})
			])
			const result = { items, total, page, pageSize }
			await this.cacheTags(page, pageSize, result)
			return result
		} catch (error) {
			console.error('❌ Tag listing failed:', error)
			return { items: [], total: 0, page, pageSize }
		}
	},

	async getTag(tagId: number) {
		return await NovelTagModel.findOne({ tagId }).lean()
	},

	// Genre operations
	async createGenre(params: { name: string; description?: string; color?: string }) {
		const genreId = await this.getNextGenreId()
		const uuid = randomUUID()
		const slug = params.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
		
		const genre = await NovelGenreModel.create({
			genreId,
			uuid,
			slug,
			defaultLocale: 'en',
			names: { en: params.name },
			color: params.color || '#6666ff',
			description: params.description || ''
		})
		
		// Invalidate cache
		await this.invalidateGenreCache()
		
		return genre
	},

	async updateGenre(genreId: number, patch: Partial<{ name: string; description: string; color: string }>) {
		const updateData: any = {}
		if (patch.name) updateData['names.en'] = patch.name
		if (patch.description) updateData.description = patch.description
		if (patch.color) updateData.color = patch.color
		
		const updated = await NovelGenreModel.findOneAndUpdate(
			{ genreId },
			{ $set: updateData },
			{ new: true }
		)
		
		if (updated) {
			// Invalidate cache
			await this.invalidateGenreCache()
		}
		
		return updated
	},

	async deleteGenre(genreId: number) {
		const result = await NovelGenreModel.deleteOne({ genreId })
		if (result.deletedCount > 0) {
			// Invalidate cache
			await this.invalidateGenreCache()
		}
		return { success: result.deletedCount > 0 }
	},

	async listGenres(page = 1, pageSize = 500) {
		try {
			// Try Redis cache first
			const cached = await this.getCachedGenres(page, pageSize)
			if (cached) return cached
			
			// First try Elasticsearch for fast listing
			await TaxonomySearchService.ensureGenreIndex()
			const esResult = await TaxonomySearchService.listGenres(page, pageSize)
			if (esResult) {
				await this.cacheGenres(page, pageSize, esResult)
				console.log(`✅ Genres listed from ES: ${esResult.items.length}/${esResult.total}`)
				return esResult
			}
			
			// Fallback to MongoDB if ES fails
			console.log('🔄 Falling back to MongoDB for genre listing')
			const skip = (page - 1) * pageSize
			const [items, total] = await Promise.all([
				NovelGenreModel.find({})
					.sort({ genreId: 1 })
					.skip(skip)
					.limit(pageSize)
					.lean(),
				NovelGenreModel.countDocuments({})
			])
			const result = { items, total, page, pageSize }
			await this.cacheGenres(page, pageSize, result)
			return result
		} catch (error) {
			console.error('❌ Genre listing failed:', error)
			return { items: [], total: 0, page, pageSize }
		}
	},

	async getGenre(genreId: number) {
		return await NovelGenreModel.findOne({ genreId }).lean()
	},

	// Utility methods
	async getNextTagId(): Promise<number> {
		const lastTag = await NovelTagModel.findOne({}).sort({ tagId: -1 }).lean()
		return (lastTag?.tagId || 0) + 1
	},

	async getNextGenreId(): Promise<number> {
		const lastGenre = await NovelGenreModel.findOne({}).sort({ genreId: -1 }).lean()
		return (lastGenre?.genreId || 0) + 1
	},

	// Cache management
	async invalidateTagCache(): Promise<void> {
		try {
			const client = redisManager.getClient()
			await client.del(CACHE_KEYS.TAGS, CACHE_KEYS.TAG_COUNT)
		} catch (error) {
			console.warn('Failed to invalidate tag cache:', error)
		}
	},

	async invalidateGenreCache(): Promise<void> {
		try {
			const client = redisManager.getClient()
			await client.del(CACHE_KEYS.GENRES, CACHE_KEYS.GENRE_COUNT)
		} catch (error) {
			console.warn('Failed to invalidate genre cache:', error)
		}
	},

	async getCachedTags(page: number, pageSize: number): Promise<any | null> {
		try {
			const client = redisManager.getClient()
			const cacheKey = `${CACHE_KEYS.TAGS}:${page}:${pageSize}`
			const cached = await client.get(cacheKey)
			return cached ? JSON.parse(cached) : null
		} catch (error) {
			console.warn('Failed to get cached tags:', error)
			return null
		}
	},

	async getCachedGenres(page: number, pageSize: number): Promise<any | null> {
		try {
			const client = redisManager.getClient()
			const cacheKey = `${CACHE_KEYS.GENRES}:${page}:${pageSize}`
			const cached = await client.get(cacheKey)
			return cached ? JSON.parse(cached) : null
		} catch (error) {
			console.warn('Failed to get cached genres:', error)
			return null
		}
	},

	async cacheTags(page: number, pageSize: number, data: any): Promise<void> {
		try {
			const client = redisManager.getClient()
			const cacheKey = `${CACHE_KEYS.TAGS}:${page}:${pageSize}`
			await client.setex(cacheKey, CACHE_TTL, JSON.stringify(data))
		} catch (error) {
			console.warn('Failed to cache tags:', error)
		}
	},

	async cacheGenres(page: number, pageSize: number, data: any): Promise<void> {
		try {
			const client = redisManager.getClient()
			const cacheKey = `${CACHE_KEYS.GENRES}:${page}:${pageSize}`
			await client.setex(cacheKey, CACHE_TTL, JSON.stringify(data))
		} catch (error) {
			console.warn('Failed to cache genres:', error)
		}
	}
} 