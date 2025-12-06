import type { FastifyRequest } from 'fastify'
import { UpdateRequestService } from '../../services/UpdateRequestService.js'
import { validateJwtToken } from '../../common/jwtAuth.js'

export const UpdateRequestController = {
	// POST /update-requests/create - Create a new update request
	create: async (request: FastifyRequest) => {
		try {
			const authResult = validateJwtToken(request)
			if (!authResult.isValid) {
				return {
					success: false,
					message: `Authentication required - ${authResult.error || 'invalid or missing token'}`
				}
			}

			const body = request.body as any
			const { novelSlug, message } = body

			if (!novelSlug) {
				return { success: false, message: 'Novel slug is required' }
			}

			const result = await UpdateRequestService.createRequest({
				authorUserUuid: authResult.userUuid!,
				novelSlug: String(novelSlug).trim(),
				message: message ? String(message).trim() : ''
			})

			return result
		} catch (error) {
			console.error('❌ Error creating update request:', error)
			return {
				success: false,
				message: 'Error creating update request'
			}
		}
	},

	// GET /update-requests/list - Get update requests with pagination
	list: async (request: FastifyRequest) => {
		try {
			const q = request.query as any
			const page = Number(q.page) || 1
			const limit = Math.min(Number(q.limit) || 20, 100)
			const sortBy = q.sortBy ? String(q.sortBy) : 'votes'

			// Build filters object, only including defined values
			const filters: { status?: string; novelSlug?: string } = {}
			if (q.status) filters.status = String(q.status)
			if (q.novelSlug) filters.novelSlug = String(q.novelSlug)

			// Try to get user UUID for vote status
			let userUuid: string | null = null
			const authResult = validateJwtToken(request)
			if (authResult.isValid) {
				userUuid = authResult.userUuid!
			}

			const result = await UpdateRequestService.getRequests(page, limit, filters, sortBy)

			// Get user's votes for these requests
			let userVotes: Record<string, string> = {}
			if (userUuid && result.items.length > 0) {
				const requestUuids = result.items.map(r => r.uuid)
				userVotes = await UpdateRequestService.getUserVotes(requestUuids, userUuid)
			}

			// Attach user vote status to each item
			const itemsWithVotes = result.items.map(item => ({
				...item,
				userVote: userVotes[item.uuid] || null
			}))

			return {
				success: true,
				result: {
					...result,
					items: itemsWithVotes
				}
			}
		} catch (error) {
			console.error('❌ Error fetching update requests:', error)
			return {
				success: false,
				message: 'Error fetching update requests'
			}
		}
	},

	// GET /update-requests/my - Get user's own requests
	myRequests: async (request: FastifyRequest) => {
		try {
			const authResult = validateJwtToken(request)
			if (!authResult.isValid) {
				return {
					success: false,
					message: `Authentication required - ${authResult.error || 'invalid or missing token'}`
				}
			}

			const q = request.query as any
			const page = Number(q.page) || 1
			const limit = Math.min(Number(q.limit) || 20, 100)

			const result = await UpdateRequestService.getRequests(page, limit, {
				authorUserUuid: authResult.userUuid!
			})

			return {
				success: true,
				result
			}
		} catch (error) {
			console.error('❌ Error fetching user requests:', error)
			return {
				success: false,
				message: 'Error fetching your requests'
			}
		}
	},

	// POST /update-requests/vote - Vote on a request
	vote: async (request: FastifyRequest) => {
		try {
			const authResult = validateJwtToken(request)
			if (!authResult.isValid) {
				return {
					success: false,
					message: `Authentication required - ${authResult.error || 'invalid or missing token'}`
				}
			}

			const body = request.body as any
			const { requestUuid, voteType } = body

			if (!requestUuid) {
				return { success: false, message: 'Request UUID is required' }
			}

			if (!['upvote', 'downvote'].includes(voteType)) {
				return { success: false, message: 'Invalid vote type' }
			}

			const result = await UpdateRequestService.vote(
				String(requestUuid),
				authResult.userUuid!,
				voteType as 'upvote' | 'downvote'
			)

			return result
		} catch (error) {
			console.error('❌ Error voting:', error)
			return {
				success: false,
				message: 'Error voting'
			}
		}
	},

	// DELETE /update-requests/delete - Delete a request
	delete: async (request: FastifyRequest) => {
		try {
			const authResult = validateJwtToken(request)
			if (!authResult.isValid) {
				return {
					success: false,
					message: `Authentication required - ${authResult.error || 'invalid or missing token'}`
				}
			}

			const body = request.body as any
			const { requestUuid } = body

			if (!requestUuid) {
				return { success: false, message: 'Request UUID is required' }
			}

			// TODO: Check if user is admin for isAdmin flag
			const result = await UpdateRequestService.deleteRequest(
				String(requestUuid),
				authResult.userUuid!,
				false
			)

			return result
		} catch (error) {
			console.error('❌ Error deleting request:', error)
			return {
				success: false,
				message: 'Error deleting request'
			}
		}
	},

	// GET /update-requests/top - Get top voted requests
	top: async (request: FastifyRequest) => {
		try {
			const q = request.query as any
			const limit = Math.min(Number(q.limit) || 10, 50)

			const items = await UpdateRequestService.getTopRequests(limit)

			return {
				success: true,
				items
			}
		} catch (error) {
			console.error('❌ Error fetching top requests:', error)
			return {
				success: false,
				message: 'Error fetching top requests'
			}
		}
	},

	// GET /update-requests/check - Check if novel has existing request
	check: async (request: FastifyRequest) => {
		try {
			const q = request.query as any
			const novelSlug = q.novelSlug ? String(q.novelSlug) : ''

			if (!novelSlug) {
				return { success: false, message: 'Novel slug is required' }
			}

			const hasRequest = await UpdateRequestService.hasExistingRequest(novelSlug)

			return {
				success: true,
				hasRequest
			}
		} catch (error) {
			console.error('❌ Error checking request:', error)
			return {
				success: false,
				message: 'Error checking request'
			}
		}
	},

	// PATCH /update-requests/status - Admin: Update request status
	updateStatus: async (request: FastifyRequest) => {
		try {
			const authResult = validateJwtToken(request)
			if (!authResult.isValid) {
				return {
					success: false,
					message: `Authentication required - ${authResult.error || 'invalid or missing token'}`
				}
			}

			// TODO: Add admin role check here

			const body = request.body as any
			const { requestUuid, status, adminResponse } = body

			if (!requestUuid || !status) {
				return { success: false, message: 'Request UUID and status are required' }
			}

			if (!['pending', 'approved', 'rejected', 'completed'].includes(status)) {
				return { success: false, message: 'Invalid status' }
			}

			const result = await UpdateRequestService.updateStatus(
				String(requestUuid),
				status,
				authResult.userUuid!,
				adminResponse ? String(adminResponse) : ''
			)

			return result
		} catch (error) {
			console.error('❌ Error updating status:', error)
			return {
				success: false,
				message: 'Error updating status'
			}
		}
	},

	// GET /update-requests/weekly-info - Get current week info
	weeklyInfo: async (request: FastifyRequest) => {
		try {
			const q = request.query as any
			const weekNumber = q.week ? String(q.week) : undefined

			const weekInfo = UpdateRequestService.getWeekInfo(weekNumber)
			const top3Data = await UpdateRequestService.getWeeklyTop3(weekNumber)

			// Try to get user UUID for vote status
			let userUuid: string | null = null
			const authResult = validateJwtToken(request)
			if (authResult.isValid) {
				userUuid = authResult.userUuid!
			}

			// Get user's votes for top 3
			let userVotes: Record<string, string> = {}
			if (userUuid && top3Data.top3.length > 0) {
				const requestUuids = top3Data.top3.map(r => r.uuid)
				userVotes = await UpdateRequestService.getUserVotes(requestUuids, userUuid)
			}

			// Attach user vote status
			const top3WithVotes = top3Data.top3.map(item => ({
				...item,
				userVote: userVotes[item.uuid] || null
			}))

			return {
				success: true,
				weekNumber: weekInfo.weekNumber,
				weekStart: weekInfo.start.toISOString(),
				weekEnd: weekInfo.end.toISOString(),
				top3: top3WithVotes
			}
		} catch (error) {
			console.error('❌ Error fetching weekly info:', error)
			return {
				success: false,
				message: 'Error fetching weekly info'
			}
		}
	},

	// GET /update-requests/past-winners - Get past weekly winners
	pastWinners: async (request: FastifyRequest) => {
		try {
			const q = request.query as any
			const limit = Math.min(Number(q.limit) || 30, 100)

			const winners = await UpdateRequestService.getPastWinners(limit)

			return {
				success: true,
				winners
			}
		} catch (error) {
			console.error('❌ Error fetching past winners:', error)
			return {
				success: false,
				message: 'Error fetching past winners'
			}
		}
	},

	// GET /update-requests/weeks - Get list of available weeks
	availableWeeks: async (_request: FastifyRequest) => {
		try {
			const weeks = await UpdateRequestService.getAvailableWeeks()

			return {
				success: true,
				weeks,
				currentWeek: UpdateRequestService.getCurrentWeek()
			}
		} catch (error) {
			console.error('❌ Error fetching available weeks:', error)
			return {
				success: false,
				message: 'Error fetching available weeks'
			}
		}
	}
}

