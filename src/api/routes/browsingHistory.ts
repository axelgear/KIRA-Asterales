import type { FastifyInstance } from 'fastify'
import { BrowsingHistoryController } from '../controllers/BrowsingHistoryController.js'
import { createRbacGuard } from '../../plugins/rbac.js'

export default async function browsingHistoryRoutes(fastify: FastifyInstance) {
	// GET /history/list - Get user's browsing history (public for authenticated users)
	fastify.get('/history/list', BrowsingHistoryController.list)

	// GET /history/entry - Get specific history entry (public for authenticated users)
	fastify.get('/history/entry', BrowsingHistoryController.entry)

	// POST /history/upsert - Create or update browsing history entry (requires authentication)
	fastify.post('/history/upsert', BrowsingHistoryController.upsert)

	// PATCH /history/update - Update existing browsing history entry (requires authentication)
	fastify.patch('/history/update', BrowsingHistoryController.update)

	// DELETE /history/delete - Delete specific history entry (requires authentication)
	fastify.delete('/history/delete', BrowsingHistoryController.delete)

	// DELETE /history/clear - Clear all browsing history for a user (requires authentication)
	fastify.delete('/history/clear', BrowsingHistoryController.clear)

	// GET /history/stats - Get reading statistics for a user (public for authenticated users)
	fastify.get('/history/stats', BrowsingHistoryController.stats)

	// POST /history/bulk-sync - Bulk sync local history entries with server (requires authentication)
	fastify.post('/history/bulk-sync', BrowsingHistoryController.bulkSync)

}
