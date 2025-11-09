import { ReadingListModel } from '../infrastructure/models/ReadingList.js'

export type ReadingListVoteAction = 'upvote' | 'downvote' | 'removeUpvote' | 'removeDownvote'

export const ReadingListVotingService = {
	async voteReadingList(listUuid: string, action: ReadingListVoteAction) {
		const actionMap: Record<ReadingListVoteAction, any> = {
			upvote: { $inc: { upvoteCount: 1 } },
			downvote: { $inc: { downvoteCount: 1 } },
			removeUpvote: { $inc: { upvoteCount: -1 } },
			removeDownvote: { $inc: { downvoteCount: -1 } }
		}

		const update = actionMap[action]
		if (!update) {
			return { success: false, message: 'Invalid vote action' as const }
		}

		let readingList = await ReadingListModel.findOneAndUpdate(
			{ uuid: listUuid }, 
			update,
			{ new: true }
		)

		if (!readingList) {
			return { success: false, message: 'Reading list not found' as const }
		}

		const corrections: Record<string, number> = {}
		if ((readingList.upvoteCount ?? 0) < 0) corrections.upvoteCount = 0
		if ((readingList.downvoteCount ?? 0) < 0) corrections.downvoteCount = 0

		if (Object.keys(corrections).length > 0) {
			readingList = await ReadingListModel.findOneAndUpdate(
				{ uuid: listUuid },
				{ $set: corrections },
				{ new: true }
			) ?? readingList
		}

		return {
			success: true as const,
			upvoteCount: readingList.upvoteCount ?? 0,
			downvoteCount: readingList.downvoteCount ?? 0,
		}
	},

	async upvoteReadingList(listUuid: string) {
		return this.voteReadingList(listUuid, 'upvote')
	},

	async downvoteReadingList(listUuid: string) {
		return this.voteReadingList(listUuid, 'downvote')
	},

	async removeUpvote(listUuid: string) {
		return this.voteReadingList(listUuid, 'removeUpvote')
	},

	async removeDownvote(listUuid: string) {
		return this.voteReadingList(listUuid, 'removeDownvote')
	}
}
