import type { FastifyInstance } from 'fastify'
import { NovelController } from '../controllers/NovelController.js'
import { createRbacGuard } from '../../plugins/rbac.js'

export default async function novelRoutes(fastify: FastifyInstance) {
	// Novel CRUD
	fastify.post('/novel/create', { preHandler: [createRbacGuard('both')] }, NovelController.create)
	fastify.get('/novel/:slug', NovelController.get)
	fastify.patch('/novel/update', { preHandler: [createRbacGuard('both')] }, NovelController.update)
	fastify.delete('/novel/delete', { preHandler: [createRbacGuard('both')] }, NovelController.remove)

	// Favorite
	fastify.post('/novel/favorite/add', { preHandler: [createRbacGuard('both')] }, NovelController.addFavorite)
	fastify.post('/novel/favorite/remove', { preHandler: [createRbacGuard('both')] }, NovelController.removeFavorite)

	// History
	fastify.post('/novel/history/upsert', { preHandler: [createRbacGuard('both')] }, NovelController.upsertHistory)

	// Comment
	fastify.post('/novel/comment/add', { preHandler: [createRbacGuard('both')] }, NovelController.addComment)

	// Like/Dislike
	fastify.post('/novel/like', { preHandler: [createRbacGuard('both')] }, NovelController.likeNovel)
	fastify.post('/novel/dislike', { preHandler: [createRbacGuard('both')] }, NovelController.likeNovel)
	fastify.post('/novel/comment/like', { preHandler: [createRbacGuard('both')] }, NovelController.likeComment)
	fastify.post('/novel/comment/dislike', { preHandler: [createRbacGuard('both')] }, NovelController.likeComment)

	// Search
	fastify.get('/novel/search', NovelController.search)

	// Search suggestions and analytics
	fastify.get('/novel/search/suggestions', NovelController.searchSuggestions)
	fastify.get('/novel/search/popular', NovelController.popularSearchTerms)
	fastify.get('/novel/search/recent', NovelController.recentSearchTerms)

	// Index management (admin only)
	fastify.post('/novel/rebuild-index', NovelController.rebuildIndex)
	fastify.post('/novel/populate-chapters', NovelController.populateChapterInfo)
	fastify.post('/novel/populate-all-chapters', NovelController.populateAllChapterInfo)

	// Cache management (admin only)
	fastify.post('/novel/cache/clear', NovelController.clearSearchCache)
	fastify.get('/novel/cache/stats', NovelController.getCacheStats)
	fastify.post('/novel/cache/warmup', NovelController.warmupCache)

	// Search terms cleanup (admin only)
	fastify.post('/novel/search/cleanup', NovelController.cleanupSearchTerms)

	// Comment moderation routes
	fastify.get('/novel/comments', { preHandler: [createRbacGuard('both')] }, NovelController.listComments)
	fastify.post('/novel/comment/delete', { preHandler: [createRbacGuard('both')] }, NovelController.deleteComment)
	fastify.post('/novel/comment/restore', { preHandler: [createRbacGuard('both')] }, NovelController.restoreComment)
	fastify.get('/novel/comment/:commentId', { preHandler: [createRbacGuard('both')] }, NovelController.getComment)

	// Public novel comments route (no RBAC protection)
	fastify.get('/novel/:novelId/comments', NovelController.listNovelComments)
} 