import type { FastifyRequest } from 'fastify'
import { ReadingListVotingService } from '../../services/ReadingListVotingService.js'

export const ReadingListVotingController = {
	// POST /reading-list/vote/upvote
	upvote: async (request: FastifyRequest) => {
		const body = request.body as any
		return await ReadingListVotingService.voteReadingList(String(body.listUuid), 'upvote')
	},

	// POST /reading-list/vote/downvote
	downvote: async (request: FastifyRequest) => {
		const body = request.body as any
		return await ReadingListVotingService.voteReadingList(String(body.listUuid), 'downvote')
	},

	// POST /reading-list/vote/upvote/remove
	removeUpvote: async (request: FastifyRequest) => {
		const body = request.body as any
		return await ReadingListVotingService.voteReadingList(String(body.listUuid), 'removeUpvote')
	},

	// POST /reading-list/vote/downvote/remove
	removeDownvote: async (request: FastifyRequest) => {
		const body = request.body as any
		return await ReadingListVotingService.voteReadingList(String(body.listUuid), 'removeDownvote')
	}
}
