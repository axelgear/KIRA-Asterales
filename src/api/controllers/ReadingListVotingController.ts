import type { FastifyRequest } from 'fastify'
import { ReadingListVotingService } from '../../services/ReadingListVotingService.js'

export const ReadingListVotingController = {
	// POST /reading-list/vote/upvote
	upvote: async (request: FastifyRequest) => {
		const body = request.body as any
		const result = await ReadingListVotingService.upvoteReadingList(String(body.listUuid))
		return result
	},

	// POST /reading-list/vote/downvote
	downvote: async (request: FastifyRequest) => {
		const body = request.body as any
		const result = await ReadingListVotingService.downvoteReadingList(String(body.listUuid))
		return result
	},

	// POST /reading-list/vote/upvote/remove
	removeUpvote: async (request: FastifyRequest) => {
		const body = request.body as any
		const result = await ReadingListVotingService.removeUpvote(String(body.listUuid))
		return result
	},

	// POST /reading-list/vote/downvote/remove
	removeDownvote: async (request: FastifyRequest) => {
		const body = request.body as any
		const result = await ReadingListVotingService.removeDownvote(String(body.listUuid))
		return result
	}
}
