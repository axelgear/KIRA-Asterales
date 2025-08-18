import { randomUUID } from 'node:crypto'
import { getNextSequence } from '../infrastructure/models/Sequence.js'
import { ReadingListModel } from '../infrastructure/models/ReadingList.js'
import { ReadingListItemModel } from '../infrastructure/models/ReadingListItem.js'

export const ReadingListService = {
	async createList(ownerUserId: number, name: string, description?: string, visibility: 'private' | 'public' | 'unlisted' = 'private') {
		const listId = await getNextSequence('readingListId')
		const uuid = randomUUID()
		const doc = await ReadingListModel.create({ listId, uuid, ownerUserId, name, description: description || '', visibility })
		return doc
	},
	async updateList(ownerUserId: number, listId: number, patch: Partial<{ name: string; description: string; visibility: 'private' | 'public' | 'unlisted'; coverNovelId: number }>) {
		const updated = await ReadingListModel.findOneAndUpdate({ listId, ownerUserId }, { $set: patch }, { new: true })
		return updated
	},
	async deleteList(ownerUserId: number, listId: number) {
		await ReadingListItemModel.deleteMany({ listId })
		await ReadingListModel.deleteOne({ listId, ownerUserId })
		return { success: true }
	},
	async myLists(ownerUserId: number) {
		const items = await ReadingListModel.find({ ownerUserId }).sort({ updatedAt: -1 }).lean()
		return items
	},
	async publicLists(ownerUserId?: number) {
		const query: any = { visibility: 'public' }
		if (ownerUserId) query.ownerUserId = ownerUserId
		const items = await ReadingListModel.find(query).sort({ updatedAt: -1 }).lean()
		return items
	},
	async addItem(ownerUserId: number, listId: number, novel: { novelId: number; novelUuid: string }, order?: number, notes?: string) {
		// Verify ownership
		const list = await ReadingListModel.findOne({ listId, ownerUserId }).lean()
		if (!list) throw new Error('List not found')
		const itemId = await getNextSequence('readingListItemId')
		await ReadingListItemModel.updateOne({ listId, novelId: novel.novelId }, { $setOnInsert: { itemId, novelUuid: novel.novelUuid, order: order ?? 0, notes: notes ?? '' } }, { upsert: true })
		await ReadingListModel.updateOne({ listId }, { $inc: { itemsCount: 1 }, $set: { coverNovelId: novel.novelId } })
		return { success: true }
	},
	async removeItem(ownerUserId: number, listId: number, novelId: number) {
		const list = await ReadingListModel.findOne({ listId, ownerUserId }).lean()
		if (!list) throw new Error('List not found')
		await ReadingListItemModel.deleteOne({ listId, novelId })
		await ReadingListModel.updateOne({ listId }, { $inc: { itemsCount: -1 } })
		return { success: true }
	},
	async listItems(listId: number, page = 1, pageSize = 50) {
		const skip = (page - 1) * pageSize
		const [items, total] = await Promise.all([
			ReadingListItemModel.find({ listId }).sort({ order: 1, addedAtMs: -1 }).skip(skip).limit(pageSize).lean(),
			ReadingListItemModel.countDocuments({ listId })
		])
		return { items, total }
	}
} 