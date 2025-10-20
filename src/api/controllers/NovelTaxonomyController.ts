import type { FastifyRequest, FastifyReply } from 'fastify'
import { NovelTaxonomyService } from '../../services/NovelTaxonomyService.js'

export const NovelTaxonomyController = {
	// Tag operations
	createTag: async (request: FastifyRequest) => {
		const body = request.body as any
		const tag = await NovelTaxonomyService.createTag({
			name: body.name,
			description: body.description,
			color: body.color
		})
		return { success: true, result: { tagId: tag.tagId, uuid: tag.uuid } }
	},

	updateTag: async (request: FastifyRequest) => {
		const body = request.body as any
		const updated = await NovelTaxonomyService.updateTag(Number(body.tagId), {
			name: body.name,
			description: body.description,
			color: body.color
		})
		return { success: !!updated }
	},

	deleteTag: async (request: FastifyRequest) => {
		const body = request.body as any
		const result = await NovelTaxonomyService.deleteTag(Number(body.tagId))
		return { success: result.success }
	},

	listTags: async (request: FastifyRequest) => {
		const q = request.query as any
		const page = Number(q.page) || 1
		const pageSize = Math.min(Number(q.pageSize) || 50, 500) // Max 500 per page
		
		const result = await NovelTaxonomyService.listTags(page, pageSize)
		return { success: true, result }
	},

	getTag: async (request: FastifyRequest) => {
		const params = request.params as any
		const tag = await NovelTaxonomyService.getTag(Number(params.tagId))
		return { success: true, result: tag }
	},

	// Genre operations
	createGenre: async (request: FastifyRequest) => {
		const body = request.body as any
		const genre = await NovelTaxonomyService.createGenre({
			name: body.name,
			description: body.description,
			color: body.color
		})
		return { success: true, result: { genreId: genre.genreId, uuid: genre.uuid } }
	},

	updateGenre: async (request: FastifyRequest) => {
		const body = request.body as any
		const updated = await NovelTaxonomyService.updateGenre(Number(body.genreId), {
			name: body.name,
			description: body.description,
			color: body.color
		})
		return { success: true, result: !!updated }
	},

	deleteGenre: async (request: FastifyRequest) => {
		const body = request.body as any
		const result = await NovelTaxonomyService.deleteGenre(Number(body.genreId))
		return { success: result.success }
	},

	listGenres: async (request: FastifyRequest) => {
		const q = request.query as any
		const page = Number(q.page) || 1
		const pageSize = Math.min(Number(q.pageSize) || 50, 500) // Max 500 per page
		
		const result = await NovelTaxonomyService.listGenres(page, pageSize)
		return { success: true, result }
	},

	getGenre: async (request: FastifyRequest) => {
		const params = request.params as any
		const genre = await NovelTaxonomyService.getGenre(Number(params.genreId))
		return { success: true, result: genre }
	}
} 