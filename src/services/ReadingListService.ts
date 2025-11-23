import { randomUUID } from 'node:crypto'
import { getNextSequence } from '../infrastructure/models/Sequence.js'
import { ReadingListModel } from '../infrastructure/models/ReadingList.js'
import { ReadingListItemModel } from '../infrastructure/models/ReadingListItem.js'
import { NovelModel } from '../infrastructure/models/Novel.js'

export const ReadingListService = {
	async createList(ownerUserUuid: string, name: string, description?: string, visibility: 'private' | 'public' | 'unlisted' = 'private') {
		const uuid = randomUUID()
		const doc = await ReadingListModel.create({ uuid, ownerUserUuid, name, description: description || '', visibility })
		return doc
	},
	async updateList(ownerUserUuid: string, listUuid: string, patch: Partial<{ name: string; description: string; visibility: 'private' | 'public' | 'unlisted'; coverNovelId: number }>) {
		const updated = await ReadingListModel.findOneAndUpdate({ uuid: listUuid, ownerUserUuid }, { $set: patch }, { new: true })
		return updated
	},
	async deleteList(ownerUserUuid: string, listUuid: string) {
		await ReadingListItemModel.deleteMany({ listUuid })
		await ReadingListModel.deleteOne({ uuid: listUuid, ownerUserUuid })
		return { success: true }
	},
	async myLists(ownerUserUuid: string) {
		const items = await ReadingListModel.find({ ownerUserUuid }).sort({ updatedAt: -1 }).lean()
		return items
	},
	async publicLists(ownerUserUuid?: string, page = 1, pageSize = 24, sortKey: 'recent' | 'name' | 'items' = 'recent', sortDirection: 'ASC' | 'DESC' = 'DESC') {
		const query: any = { 
			visibility: 'public',
			itemsCount: { $gt: 0 } // Only show lists with at least 1 item
		}
		if (ownerUserUuid) query.ownerUserUuid = ownerUserUuid
		
		// Determine sort field and direction
		let sortField: any = { updatedAt: -1 }
		const dir = sortDirection === 'ASC' ? 1 : -1
		
		switch (sortKey) {
			case 'name':
				sortField = { name: dir }
				break
			case 'items':
				sortField = { itemsCount: dir }
				break
			case 'recent':
			default:
				sortField = { updatedAt: dir }
				break
		}
		
		const skip = (page - 1) * pageSize
		const [items, total] = await Promise.all([
			ReadingListModel.find(query)
				.sort(sortField)
				.skip(skip)
				.limit(pageSize)
				.lean(),
			ReadingListModel.countDocuments(query)
		])
		
		return {
			items,
			total,
			totalPages: Math.ceil(total / pageSize),
			page,
			pageSize
		}
	},
	async addItem(ownerUserUuid: string, listUuid: string, novel: { novelSlug: string; novelUuid: string }) {
		// Verify ownership
		const list = await ReadingListModel.findOne({ uuid: listUuid, ownerUserUuid }).lean()
		if (!list) throw new Error('List not found')
		const itemId = await getNextSequence('readingListItemId')
		await ReadingListItemModel.updateOne({ listUuid, novelSlug: novel.novelSlug }, { $setOnInsert: { itemId, novelUuid: novel.novelUuid } }, { upsert: true })
		await ReadingListModel.updateOne({ uuid: listUuid }, { $inc: { itemsCount: 1 } })
		
		// Update cover images (first 4)
		await this.updateCoverImages(listUuid)
		
		return { success: true }
	},
	async removeItem(ownerUserUuid: string, listUuid: string, novelSlug: string) {
		const list = await ReadingListModel.findOne({ uuid: listUuid, ownerUserUuid }).lean()
		if (!list) throw new Error('List not found')
		await ReadingListItemModel.deleteOne({ listUuid, novelSlug })
		await ReadingListModel.updateOne({ uuid: listUuid }, { $inc: { itemsCount: -1 } })
		
		// Update cover images (first 4)
		await this.updateCoverImages(listUuid)
		
		return { success: true }
	},
	async listItems(listUuid: string, currentUserUuid?: string, page = 1, pageSize = 50) {
		// Verify the list exists
		const list = await ReadingListModel.findOne({ uuid: listUuid }).lean()
		if (!list) {
			throw new Error('Reading list not found')
		}
		
		const skip = (page - 1) * pageSize
		const [items, total] = await Promise.all([
			ReadingListItemModel.find({ listUuid }).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
			ReadingListItemModel.countDocuments({ listUuid })
		])

		// Enrich items with novel details
		const enrichedItems = await Promise.all(
			items.map(async (item) => {
				try {
					const novel = await NovelModel.findOne({ slug: item.novelSlug })
						.select("uuid slug title coverImg description status ownerUserId")
						.lean()

					return {
						...item,
						novel: novel || null,
						// Add fallback fields for backward compatibility
						novelTitle: novel?.title || 'Unknown Novel',
						coverImg: novel?.coverImg || '',
						author: `User ${novel?.ownerUserId || 'Unknown'}`
					}
				} catch (error) {
					console.warn(`⚠️ Failed to enrich reading list item ${item._id}:`, error)
					return {
						...item,
						novel: null,
						novelTitle: 'Unknown Novel',
						coverImg: '',
						author: 'Unknown Author'
					}
				}
			})
		)

		// Determine if current user is the owner
		const isOwner = currentUserUuid != null && list.ownerUserUuid === currentUserUuid

		return { 
			items: enrichedItems, 
			total,
			totalPages: Math.ceil(total / pageSize),
			page,
			list: {
				uuid: list.uuid,
				name: list.name,
				description: list.description,
				visibility: list.visibility,
				ownerUserUuid: list.ownerUserUuid,
				itemsCount: list.itemsCount,
				upvoteCount: list.upvoteCount || 0,
				downvoteCount: list.downvoteCount || 0,
				isOwner
			}
		}
	},
	
	async updateCoverImages(listUuid: string) {
		try {
			// Get first 4 items
			const items = await ReadingListItemModel.find({ listUuid })
				.sort({ createdAt: -1 })
				.limit(4)
				.lean()
			
			// Get cover images from novels
			const coverImages: string[] = []
			for (const item of items) {
				try {
					const novel = await NovelModel.findOne({ slug: item.novelSlug })
						.select('coverImg')
						.lean()
					if (novel?.coverImg) {
						coverImages.push(novel.coverImg)
					}
				} catch (err) {
					// Ignore individual errors
				}
			}
			
			// Update list with cover images
			await ReadingListModel.updateOne(
				{ uuid: listUuid },
				{ $set: { coverImages } }
			)
		} catch (error) {
			console.error('Failed to update cover images:', error)
		}
	}
} 