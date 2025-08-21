import type { FastifyInstance } from 'fastify'
import { NovelTaxonomyController } from '../controllers/NovelTaxonomyController.js'
import { createRbacGuard } from '../../plugins/rbac.js'

export default async function novelTaxonomyRoutes(fastify: FastifyInstance) {
	// Tags
	fastify.post('/novel/tag/create', { preHandler: [createRbacGuard('both')] }, NovelTaxonomyController.createTag)
	fastify.patch('/novel/tag/update', { preHandler: [createRbacGuard('both')] }, NovelTaxonomyController.updateTag)
	fastify.get('/novel/tag/list', NovelTaxonomyController.listTags)
	fastify.get('/novel/tag/:tagId', NovelTaxonomyController.getTag)

	// Genres
	fastify.post('/novel/genre/create', { preHandler: [createRbacGuard('both')] }, NovelTaxonomyController.createGenre)
	fastify.patch('/novel/genre/update', { preHandler: [createRbacGuard('both')] }, NovelTaxonomyController.updateGenre)
	fastify.get('/novel/genre/list', NovelTaxonomyController.listGenres)
	fastify.get('/novel/genre/:genreId', NovelTaxonomyController.getGenre)
} 