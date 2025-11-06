import type { FastifyInstance } from 'fastify'
import { FavoriteController } from '../controllers/FavoriteController.js'
import { createRbacGuard } from '../../plugins/rbac.js'

export default async function favoriteRoutes(fastify: FastifyInstance) {
	// POST /favorites/add - Add novel to favorites (requires authentication)
	fastify.post('/favorites/add', { preHandler: [createRbacGuard('both')] }, FavoriteController.add)

	// POST /favorites/remove - Remove novel from favorites (requires authentication)
	fastify.post('/favorites/remove', { preHandler: [createRbacGuard('both')] }, FavoriteController.remove)

	// GET /favorites/list - Get user's favorites (requires authentication)
	fastify.get('/favorites/list', { preHandler: [createRbacGuard('both')] }, FavoriteController.list)

	// GET /favorites/check/:novelUuid - Check if novel is favorited (requires authentication)
	fastify.get('/favorites/check/:novelUuid', { preHandler: [createRbacGuard('both')] }, FavoriteController.check)

	// GET /favorites/check-slug/:slug - Check favorite by novel slug (requires authentication)
	fastify.get('/favorites/check-slug/:slug', { preHandler: [createRbacGuard('both')] }, FavoriteController.checkBySlug)

	// GET /favorites/count - Get user's favorites count (requires authentication)
	fastify.get('/favorites/count', { preHandler: [createRbacGuard('both')] }, FavoriteController.count)

	// DELETE /favorites/clear - Clear all user favorites (requires authentication)
	fastify.delete('/favorites/clear', { preHandler: [createRbacGuard('both')] }, FavoriteController.clear)

	// GET /favorites/novel/:novelUuid - Get novel's favorites count by UUID (public endpoint)
	fastify.get('/favorites/novel/:novelUuid', FavoriteController.novelCount)
}
