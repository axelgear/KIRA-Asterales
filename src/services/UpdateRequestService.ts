import { UpdateRequestModel } from '../infrastructure/models/UpdateRequest.js'
import { UpdateRequestVoteModel } from '../infrastructure/models/UpdateRequestVote.js'
import { NovelModel } from '../infrastructure/models/Novel.js'
import { UserModel } from '../infrastructure/models/User.js'
import { v4 as uuidv4 } from 'uuid'

export interface CreateUpdateRequestParams {
	authorUserUuid: string
	novelSlug: string
	message?: string
}

export interface UpdateRequestFilters {
	status?: string | undefined
	novelSlug?: string | undefined
	authorUserUuid?: string | undefined
	weekNumber?: string | undefined
}

// Helper to get current week number in "YYYY-WW" format
function getCurrentWeekNumber(): string {
	const now = new Date()
	const startOfYear = new Date(now.getFullYear(), 0, 1)
	const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000))
	const weekNum = Math.ceil((days + startOfYear.getDay() + 1) / 7)
	return `${now.getFullYear()}-${weekNum.toString().padStart(2, '0')}`
}

// Helper to get week start and end dates
function getWeekDates(weekNumber?: string): { start: Date; end: Date } {
	const week = weekNumber || getCurrentWeekNumber()
	const [year, weekNum] = week.split('-').map(Number)
	
	// Get first day of the year
	const firstDayOfYear = new Date(year, 0, 1)
	// Find the first Sunday of the year
	const firstSunday = new Date(year, 0, 1 + (7 - firstDayOfYear.getDay()) % 7)
	
	// Calculate start of the requested week
	const start = new Date(firstSunday)
	start.setDate(firstSunday.getDate() + (weekNum - 1) * 7)
	
	// End is 7 days later
	const end = new Date(start)
	end.setDate(start.getDate() + 7)
	end.setMilliseconds(-1) // Set to last millisecond of Saturday
	
	return { start, end }
}

export const UpdateRequestService = {
	// Create a new update request
	async createRequest(params: CreateUpdateRequestParams) {
		try {
			const { authorUserUuid, novelSlug, message } = params

			// Check if user already requested this novel
			const existing = await UpdateRequestModel.findOne({
				authorUserUuid,
				novelSlug,
				status: { $in: ['pending', 'approved'] }
			})

			if (existing) {
				return {
					success: false,
					message: 'You have already requested an update for this novel'
				}
			}

			// Get novel details
			const novel = await NovelModel.findOne({ slug: novelSlug })
				.select('uuid slug title coverImg authorNickname status chapterCount')
				.lean()

			if (!novel) {
				return {
					success: false,
					message: 'Novel not found'
				}
			}

			// Reject completed novels - they don't need updates
			if (novel.status?.toLowerCase() === 'completed') {
				return {
					success: false,
					message: 'This novel is already completed and does not need updates'
				}
			}

			// Get user details
			const user = await UserModel.findOne({ userUuid: authorUserUuid })
				.select('username userNickname avatar')
				.lean()

		const request = await UpdateRequestModel.create({
			uuid: uuidv4(),
			authorUserUuid,
			authorUsername: user?.username || '',
			authorNickname: user?.userNickname || '',
			authorAvatar: user?.avatar || '',
			novelSlug: novel.slug,
			novelUuid: novel.uuid || '',
			novelTitle: novel.title,
			novelCover: novel.coverImg || '',
			novelAuthor: novel.authorNickname || '',
			novelStatus: novel.status || '',
			novelChapterCount: novel.chapterCount || 0,
			message: message || '',
			upvoteCount: 1, // Auto-upvote by creator
			weekNumber: getCurrentWeekNumber(),
			status: 'pending'
		})

			// Auto-vote for creator
			await UpdateRequestVoteModel.create({
				requestUuid: request.uuid,
				userUuid: authorUserUuid,
				voteType: 'upvote'
			})

			console.log(`✅ Created update request for ${novelSlug} by ${authorUserUuid}`)

			return {
				success: true,
				message: 'Update request created successfully',
				request
			}
		} catch (error: any) {
			if (error.code === 11000) {
				return {
					success: false,
					message: 'You have already requested an update for this novel'
				}
			}
			console.error('❌ Error creating update request:', error)
			throw error
		}
	},

	// Get current week number
	getCurrentWeek() {
		return getCurrentWeekNumber()
	},

	// Get week dates for display
	getWeekInfo(weekNumber?: string) {
		const week = weekNumber || getCurrentWeekNumber()
		const { start, end } = getWeekDates(week)
		return { weekNumber: week, start, end }
	},

	// Get update requests with pagination and filters
	async getRequests(page = 1, limit = 20, filters: UpdateRequestFilters = {}, sortBy = 'votes') {
		try {
			const skip = (page - 1) * limit
			const query: any = {}

			if (filters.status) query.status = filters.status
			if (filters.novelSlug) query.novelSlug = filters.novelSlug
			if (filters.authorUserUuid) query.authorUserUuid = filters.authorUserUuid
			if (filters.weekNumber) query.weekNumber = filters.weekNumber

			// Default to pending status and current week
			if (!filters.status) query.status = 'pending'
			if (!filters.weekNumber) query.weekNumber = getCurrentWeekNumber()

			// Sort options
			let sortOption: any = { upvoteCount: -1, createdAt: -1 }
			if (sortBy === 'newest') sortOption = { createdAt: -1 }
			if (sortBy === 'oldest') sortOption = { createdAt: 1 }

			const [items, total] = await Promise.all([
				UpdateRequestModel.find(query)
					.sort(sortOption)
					.skip(skip)
					.limit(limit)
					.lean(),
				UpdateRequestModel.countDocuments(query)
			])

			return {
				items,
				total,
				page,
				limit,
				totalPages: Math.ceil(total / limit),
				hasNext: page * limit < total,
				hasPrev: page > 1
			}
		} catch (error) {
			console.error('❌ Error fetching update requests:', error)
			return {
				items: [],
				total: 0,
				page,
				limit,
				totalPages: 0,
				hasNext: false,
				hasPrev: false
			}
		}
	},

	// Get a single request by UUID
	async getRequestByUuid(uuid: string) {
		try {
			return await UpdateRequestModel.findOne({ uuid }).lean()
		} catch (error) {
			console.error('❌ Error fetching request:', error)
			return null
		}
	},

	// Vote on a request
	async vote(requestUuid: string, userUuid: string, voteType: 'upvote' | 'downvote') {
		try {
			// Check if user already voted
			const existingVote = await UpdateRequestVoteModel.findOne({
				requestUuid,
				userUuid
			})

			if (existingVote) {
				if (existingVote.voteType === voteType) {
					// Remove vote (toggle off)
					await UpdateRequestVoteModel.deleteOne({ _id: existingVote._id })
					
					const update = voteType === 'upvote' 
						? { $inc: { upvoteCount: -1 } }
						: { $inc: { downvoteCount: -1 } }
					
					const request = await UpdateRequestModel.findOneAndUpdate(
						{ uuid: requestUuid },
						update,
						{ new: true }
					)

					return {
						success: true,
						action: 'removed',
						voteType: null,
						upvoteCount: request?.upvoteCount ?? 0,
						downvoteCount: request?.downvoteCount ?? 0
					}
				} else {
					// Change vote
					existingVote.voteType = voteType
					await existingVote.save()

					const update = voteType === 'upvote'
						? { $inc: { upvoteCount: 1, downvoteCount: -1 } }
						: { $inc: { upvoteCount: -1, downvoteCount: 1 } }

					const request = await UpdateRequestModel.findOneAndUpdate(
						{ uuid: requestUuid },
						update,
						{ new: true }
					)

					return {
						success: true,
						action: 'changed',
						voteType,
						upvoteCount: request?.upvoteCount ?? 0,
						downvoteCount: request?.downvoteCount ?? 0
					}
				}
			}

			// New vote
			await UpdateRequestVoteModel.create({
				requestUuid,
				userUuid,
				voteType
			})

			const update = voteType === 'upvote'
				? { $inc: { upvoteCount: 1 } }
				: { $inc: { downvoteCount: 1 } }

			const request = await UpdateRequestModel.findOneAndUpdate(
				{ uuid: requestUuid },
				update,
				{ new: true }
			)

			return {
				success: true,
				action: 'added',
				voteType,
				upvoteCount: request?.upvoteCount ?? 0,
				downvoteCount: request?.downvoteCount ?? 0
			}
		} catch (error) {
			console.error('❌ Error voting:', error)
			return {
				success: false,
				message: 'Failed to vote'
			}
		}
	},

	// Get user's vote for a request
	async getUserVote(requestUuid: string, userUuid: string) {
		try {
			const vote = await UpdateRequestVoteModel.findOne({
				requestUuid,
				userUuid
			}).lean()

			return vote?.voteType || null
		} catch (error) {
			return null
		}
	},

	// Get user's votes for multiple requests (batch)
	async getUserVotes(requestUuids: string[], userUuid: string) {
		try {
			const votes = await UpdateRequestVoteModel.find({
				requestUuid: { $in: requestUuids },
				userUuid
			}).lean()

			const voteMap: Record<string, string> = {}
			for (const vote of votes) {
				voteMap[vote.requestUuid] = vote.voteType
			}

			return voteMap
		} catch (error) {
			return {}
		}
	},

	// Delete a request (by author or admin)
	async deleteRequest(requestUuid: string, userUuid: string, isAdmin = false) {
		try {
			const request = await UpdateRequestModel.findOne({ uuid: requestUuid })

			if (!request) {
				return { success: false, message: 'Request not found' }
			}

			if (!isAdmin && request.authorUserUuid !== userUuid) {
				return { success: false, message: 'Not authorized to delete this request' }
			}

			// Delete votes first
			await UpdateRequestVoteModel.deleteMany({ requestUuid })
			// Delete request
			await UpdateRequestModel.deleteOne({ uuid: requestUuid })

			return { success: true, message: 'Request deleted successfully' }
		} catch (error) {
			console.error('❌ Error deleting request:', error)
			return { success: false, message: 'Failed to delete request' }
		}
	},

	// Admin: Update request status
	async updateStatus(requestUuid: string, status: string, adminUserUuid: string, adminResponse?: string) {
		try {
			const request = await UpdateRequestModel.findOneAndUpdate(
				{ uuid: requestUuid },
				{
					$set: {
						status,
						adminResponse: adminResponse || '',
						respondedAt: new Date(),
						respondedByUserUuid: adminUserUuid
					}
				},
				{ new: true }
			)

			if (!request) {
				return { success: false, message: 'Request not found' }
			}

			return { success: true, request }
		} catch (error) {
			console.error('❌ Error updating status:', error)
			return { success: false, message: 'Failed to update status' }
		}
	},

	// Get top voted requests (for homepage/featured)
	async getTopRequests(limit = 10) {
		try {
			return await UpdateRequestModel.find({ status: 'pending' })
				.sort({ upvoteCount: -1 })
				.limit(limit)
				.lean()
		} catch (error) {
			console.error('❌ Error fetching top requests:', error)
			return []
		}
	},

	// Check if a novel already has a pending request
	async hasExistingRequest(novelSlug: string) {
		try {
			const count = await UpdateRequestModel.countDocuments({
				novelSlug,
				status: 'pending'
			})
			return count > 0
		} catch (error) {
			return false
		}
	},

	// Get top 3 requests for the current week
	async getWeeklyTop3(weekNumber?: string) {
		try {
			const week = weekNumber || getCurrentWeekNumber()
			const top3 = await UpdateRequestModel.find({
				weekNumber: week,
				status: 'pending'
			})
				.sort({ upvoteCount: -1, createdAt: 1 })
				.limit(3)
				.lean()

			return {
				weekNumber: week,
				weekDates: getWeekDates(week),
				top3
			}
		} catch (error) {
			console.error('❌ Error fetching weekly top 3:', error)
			return {
				weekNumber: weekNumber || getCurrentWeekNumber(),
				weekDates: getWeekDates(weekNumber),
				top3: []
			}
		}
	},

	// Get past week winners (for history)
	async getPastWinners(limit = 10) {
		try {
			return await UpdateRequestModel.find({
				isWeeklyWinner: true
			})
				.sort({ weekNumber: -1, weeklyRank: 1 })
				.limit(limit)
				.lean()
		} catch (error) {
			console.error('❌ Error fetching past winners:', error)
			return []
		}
	},

	// Process end of week - mark top 3 as winners (run via cron job)
	async processWeeklyWinners(weekNumber: string) {
		try {
			// Get top 3 for the specified week
			const top3 = await UpdateRequestModel.find({
				weekNumber,
				status: 'pending'
			})
				.sort({ upvoteCount: -1, createdAt: 1 })
				.limit(3)
				.lean()

			// Mark them as winners
			for (let i = 0; i < top3.length; i++) {
				await UpdateRequestModel.updateOne(
					{ uuid: top3[i].uuid },
					{
						$set: {
							isWeeklyWinner: true,
							weeklyRank: i + 1,
							status: 'approved' // Approve the top 3
						}
					}
				)
			}

			console.log(`✅ Processed weekly winners for week ${weekNumber}:`, top3.map(r => r.novelTitle))

			return {
				success: true,
				weekNumber,
				winners: top3.map((r, i) => ({
					rank: i + 1,
					novelTitle: r.novelTitle,
					novelSlug: r.novelSlug,
					upvoteCount: r.upvoteCount
				}))
			}
		} catch (error) {
			console.error('❌ Error processing weekly winners:', error)
			return { success: false, message: 'Failed to process weekly winners' }
		}
	},

	// Get available weeks (for archive)
	async getAvailableWeeks() {
		try {
			const weeks = await UpdateRequestModel.distinct('weekNumber')
			return weeks.sort().reverse() // Most recent first
		} catch (error) {
			console.error('❌ Error fetching available weeks:', error)
			return []
		}
	}
}

