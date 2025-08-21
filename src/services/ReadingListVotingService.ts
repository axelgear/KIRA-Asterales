import { ReadingListModel } from '../infrastructure/models/ReadingList.js'

export const ReadingListVotingService = {
	async upvoteReadingList(listUuid: string) {
		const readingList = await ReadingListModel.findOneAndUpdate(
			{ uuid: listUuid }, 
			{ $inc: { upvoteCount: 1 } }, 
			{ new: true }
		)
		return { success: true, upvoteCount: readingList?.upvoteCount || 0 }
	},

	async downvoteReadingList(listUuid: string) {
		const readingList = await ReadingListModel.findOneAndUpdate(
			{ uuid: listUuid }, 
			{ $inc: { downvoteCount: 1 } }, 
			{ new: true }
		)
		return { success: true, downvoteCount: readingList?.downvoteCount || 0 }
	},

	async removeUpvote(listUuid: string) {
		const readingList = await ReadingListModel.findOneAndUpdate(
			{ uuid: listUuid }, 
			{ $inc: { upvoteCount: -1 } }, 
			{ new: true }
		)
		return { success: true, upvoteCount: readingList?.upvoteCount || 0 }
	},

	async removeDownvote(listUuid: string) {
		const readingList = await ReadingListModel.findOneAndUpdate(
			{ uuid: listUuid }, 
			{ $inc: { downvoteCount: -1 } }, 
			{ new: true }
		)
		return { success: true, downvoteCount: readingList?.downvoteCount || 0 }
	}
}
