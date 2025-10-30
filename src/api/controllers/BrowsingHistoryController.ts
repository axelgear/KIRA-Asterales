import type { FastifyRequest, FastifyReply } from 'fastify'
import { BrowsingHistoryService } from '../../services/BrowsingHistoryService.js'

export const BrowsingHistoryController = {
	// GET /history/list - Get user's browsing history with pagination
	list: async (request: FastifyRequest) => {
		try {
			const q = request.query as any
			const cookies: any = (request as any).cookies || {}
			const userId = Number(cookies?.uid)
			const page = Number(q.page) || 1
			const limit = Number(q.limit) || 20

			console.log('🔍 Browsing history request:', { userId, page, limit })

			if (!userId || userId <= 0) {
				return { success: false, message: 'User not authenticated' }
			}

			const result = await BrowsingHistoryService.getUserHistory(userId, page, limit)

			console.log(`📋 History result: ${result.items?.length || 0} items, total: ${result.total}`)

			return {
				success: true,
				message: 'Browsing history retrieved successfully',
				result
			}
		} catch (error) {
			console.error('❌ Error fetching browsing history:', error)
			return {
				success: false,
				message: 'Error fetching browsing history',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// GET /history/entry - Get specific history entry
	entry: async (request: FastifyRequest) => {
		try {
			const q = request.query as any
			const cookies: any = (request as any).cookies || {}
			const userId = Number(cookies?.uid)
			const novelSlug = String(q.novelSlug || '').trim()

			console.log('🔍 History entry request:', { userId, novelSlug })

			if (!userId || userId <= 0) {
				return { success: false, message: 'User not authenticated' }
			}

			if (!novelSlug) {
				return { success: false, message: 'Novel slug required' }
			}

			const result = await BrowsingHistoryService.getHistoryEntry(userId, novelSlug)

			if (!result) {
				return { success: false, message: 'History entry not found' }
			}

			return {
				success: true,
				message: 'History entry retrieved successfully',
				result
			}
		} catch (error) {
			console.error('❌ Error fetching history entry:', error)
			return {
				success: false,
				message: 'Error fetching history entry',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// POST /history/upsert - Create or update browsing history entry
	upsert: async (request: FastifyRequest) => {
		try {
			const body = request.body as any
			const cookies: any = (request as any).cookies || {}
			const userId = Number(cookies?.uid)
			const { novelSlug, chapterUuid, progress, device } = body

			console.log('🔄 Upsert history request:', { userId, novelSlug, chapterUuid, progress })

			if (!userId || userId <= 0) {
				return { success: false, message: 'User not authenticated' }
			}

			if (!novelSlug || !chapterUuid) {
				return { success: false, message: 'Novel slug and Chapter UUID required' }
			}

			const result = await BrowsingHistoryService.upsertHistoryEntry({
				userId: userId,
				novelSlug: String(novelSlug).trim(),
				chapterUuid: String(chapterUuid).trim(),
				progress: progress !== undefined ? Number(progress) : 0,
				device: device || ''
			})

			return {
				success: true,
				message: 'History entry upserted successfully',
				result
			}
		} catch (error) {
			console.error('❌ Error upserting history entry:', error)
			return {
				success: false,
				message: 'Error upserting history entry',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// PATCH /history/update - Update existing browsing history entry
	update: async (request: FastifyRequest) => {
		try {
			const body = request.body as any
			const cookies: any = (request as any).cookies || {}
			const userId = Number(cookies?.uid)
			const { novelSlug, progress, device, chapterUuid } = body

			console.log('🔄 Update history request:', { userId, novelSlug, progress })

			if (!userId || userId <= 0) {
				return { success: false, message: 'User not authenticated' }
			}

			if (!novelSlug) {
				return { success: false, message: 'Novel slug required' }
			}

			const updates: any = {}
			if (progress !== undefined) updates.progress = Number(progress)
			if (device !== undefined) updates.device = String(device)
			if (chapterUuid !== undefined) updates.chapterUuid = String(chapterUuid)

			const result = await BrowsingHistoryService.updateHistoryEntry(
				userId,
				String(novelSlug).trim(),
				updates
			)

			if (!result) {
				return { success: false, message: 'History entry not found' }
			}

			return {
				success: true,
				message: 'History entry updated successfully',
				result
			}
		} catch (error) {
			console.error('❌ Error updating history entry:', error)
			return {
				success: false,
				message: 'Error updating history entry',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// DELETE /history/delete - Delete specific history entry
	delete: async (request: FastifyRequest) => {
		try {
			const body = request.body as any
			const cookies: any = (request as any).cookies || {}
			const userId = Number(cookies?.uid)
			const { novelSlug } = body

			console.log('🗑️ Delete history request:', { userId, novelSlug })

			if (!userId || userId <= 0) {
				return { success: false, message: 'User not authenticated' }
			}

			if (!novelSlug) {
				return { success: false, message: 'Novel slug required' }
			}

			const result = await BrowsingHistoryService.deleteHistoryEntry(
				userId,
				String(novelSlug).trim()
			)

			return {
				success: result.success,
				message: result.success ? 'History entry deleted successfully' : 'History entry not found',
				result
			}
		} catch (error) {
			console.error('❌ Error deleting history entry:', error)
			return {
				success: false,
				message: 'Error deleting history entry',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// DELETE /history/clear - Clear all browsing history for a user
	clear: async (request: FastifyRequest) => {
		try {
			const cookies: any = (request as any).cookies || {}
			const userId = Number(cookies?.uid)

			console.log('🗑️ Clear history request:', { userId })

			if (!userId || userId <= 0) {
				return { success: false, message: 'User not authenticated' }
			}

			const result = await BrowsingHistoryService.clearUserHistory(userId)

			return {
				success: result.success,
				message: result.success ? 'All history cleared successfully' : 'No history to clear',
				result
			}
		} catch (error) {
			console.error('❌ Error clearing user history:', error)
			return {
				success: false,
				message: 'Error clearing user history',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// GET /history/stats - Get reading statistics for a user
	stats: async (request: FastifyRequest) => {
		try {
			const cookies: any = (request as any).cookies || {}
			const userId = Number(cookies?.uid)

			console.log('📊 History stats request:', { userId })

			if (!userId || userId <= 0) {
				return { success: false, message: 'User not authenticated' }
			}

			const result = await BrowsingHistoryService.getUserReadingStats(userId)

			return {
				success: true,
				message: 'Reading statistics retrieved successfully',
				result
			}
		} catch (error) {
			console.error('❌ Error fetching reading statistics:', error)
			return {
				success: false,
				message: 'Error fetching reading statistics',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},


}
