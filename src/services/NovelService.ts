import { randomUUID } from 'node:crypto'
import { NovelModel } from '../infrastructure/models/Novel.js'
import { ChapterModel } from '../infrastructure/models/Chapter.js'
import { FavoriteModel } from '../infrastructure/models/Favorite.js'
import { BrowsingHistoryModel } from '../infrastructure/models/BrowsingHistory.js'
import { FeedModel } from '../infrastructure/models/Feed.js'
import { NovelCommentModel } from '../infrastructure/models/NovelComment.js'
import { getNextSequence } from '../infrastructure/models/Sequence.js'
import { NovelSearchService } from './NovelSearchService.js'
import { ChapterSearchService } from './ChapterSearchService.js'

export const NovelService = {
	async getNovel(slug: string) {
		return await NovelModel.findOne({ slug }).lean()
	},

	async createNovel(params: { ownerUserId: number; title: string; slug: string; description?: string; tags?: string[]; genres?: string[]; language?: string; coverUrl?: string }) {
		const novelId = await getNextSequence('novelId')
		const uuid = randomUUID()
		const novel = await NovelModel.create({
			novelId,
			uuid,
			ownerUserId: params.ownerUserId,
			title: params.title,
			slug: params.slug,
			description: params.description || '',
			tags: params.tags || [],
			genres: params.genres || [],
			language: params.language || 'en',
			coverUrl: params.coverUrl || ''
		})
		await NovelSearchService.indexNovel(novel)
		await FeedModel.create({ feedId: await getNextSequence('feedId'), action: 'create_novel', userId: params.ownerUserId, novelId: novel.novelId, payload: { title: novel.title } })
		return novel
	},
	async updateNovel(novelId: number, patch: Partial<{ title: string; slug: string; description: string; tagIds: number[]; genreIds: number[]; status: string; language: string; coverImg: string; approvalStatus: string }>) {
		const updated = await NovelModel.findOneAndUpdate({ novelId }, { $set: { ...patch } }, { new: true })
		if (updated) await NovelSearchService.indexNovel(updated)
		return updated
	},
	async deleteNovel(novelId: number) {
		// Delete dependent records first (cascading delete)
		const novel = await NovelModel.findOne({ novelId }).lean()
		await ChapterModel.deleteMany({ novelId })
		await FavoriteModel.deleteMany({ novelId })
		await BrowsingHistoryModel.deleteMany({ novelId })
		await NovelCommentModel.deleteMany({ novelId })
		await FeedModel.deleteMany({ novelId })
		// Delete ES chapter docs
		if (novel?.uuid) await ChapterSearchService.deleteByNovelUuid(novel.uuid)
		// Delete novel
		await NovelModel.deleteOne({ novelId })
		await NovelSearchService.deleteNovel(novelId)
		return { success: true }
	},
	async createChapter(params: { novelId: number; title: string; content: string }) {
		const { novelId } = params
		const novel = await NovelModel.findOne({ novelId }).lean()
		if (!novel) throw new Error('Novel not found')
		const chapterId = await getNextSequence('chapterId')
		const uuid = randomUUID()
		const sequence = (await ChapterModel.countDocuments({ novelId })) + 1
		const content = params.content
		const wordCount = content.trim().split(/\s+/).length
		const chapter = await ChapterModel.create({ chapterId, uuid, novelId, novelUuid: novel.uuid, title: params.title, content, wordCount, sequence })
		await NovelModel.updateOne({ novelId }, { $inc: { chaptersCount: 1 } })
		
		// Reindex novel to sync chaptersCount in ES
		const updatedNovel = await NovelModel.findOne({ novelId })
		if (updatedNovel) await NovelSearchService.indexNovel(updatedNovel)
		
		// Index chapter lightweight doc in ES for fast listing
		await ChapterSearchService.ensureIndex()
		await ChapterSearchService.indexChapter({ 
			chapterId, 
			uuid,
			novelUuid: novel.uuid, 
			title: params.title, 
			sequence, 
			wordCount,
			publishedAt: new Date(),
			createdAt: new Date(),
			updatedAt: new Date()
		})
		
		await FeedModel.create({ feedId: await getNextSequence('feedId'), action: 'create_chapter', userId: novel.ownerUserId, novelId, chapterId, payload: { title: params.title } })
		return chapter
	},
	async listChapters(novelId: number, page = 1, pageSize = 50) {
		const skip = (page - 1) * pageSize
		const [items, total] = await Promise.all([
			ChapterModel.find({ novelId, isPublished: true }).sort({ sequence: 1 }).skip(skip).limit(pageSize).lean(),
			ChapterModel.countDocuments({ novelId, isPublished: true })
		])
		return { items, total }
	},
	async addFavorite(userId: number, novelId: number) {
		const novel = await NovelModel.findOneAndUpdate({ novelId }, { $inc: { favoritesCount: 1 } }, { new: true })
		await FavoriteModel.updateOne({ userId, novelId }, { $setOnInsert: { novelUuid: novel?.uuid } }, { upsert: true })
		if (novel) await NovelSearchService.indexNovel(novel)
		return { success: true }
	},
	async removeFavorite(userId: number, novelId: number) {
		await FavoriteModel.deleteOne({ userId, novelId })
		const novel = await NovelModel.findOneAndUpdate({ novelId }, { $inc: { favoritesCount: -1 } }, { new: true })
		if (novel) await NovelSearchService.indexNovel(novel)
		return { success: true }
	},
	async upsertHistory(userId: number, novelId: number, chapterId: number, progress?: number) {
		await BrowsingHistoryModel.updateOne({ userId, novelId }, { $set: { chapterId, lastReadAt: new Date(), ...(typeof progress === 'number' ? { progress } : {}) } }, { upsert: true })
		return { success: true }
	},
	async addComment(userId: number, novelId: number, content: string, replyToCommentId?: number) {
		const commentId = await getNextSequence('commentId')
		// Build threading fields
		let parentCommentId: number | null = null
		let rootCommentId: number | null = null
		let path = ''
		let depth = 0
		if (replyToCommentId != null) {
			const parent = await NovelCommentModel.findOne({ commentId: replyToCommentId, novelId }).lean()
			if (parent) {
				parentCommentId = parent.commentId
				rootCommentId = parent.rootCommentId ?? parent.commentId
				depth = (parent.depth ?? 0) + 1
				const segment = String(commentId).padStart(8, '0')
				path = parent.path ? `${parent.path}/${segment}` : segment
			} else {
				// Parent not found; treat as top-level
				rootCommentId = commentId
				path = String(commentId).padStart(8, '0')
			}
		} else {
			rootCommentId = commentId
			path = String(commentId).padStart(8, '0')
		}
		const doc = await NovelCommentModel.create({ commentId, userId, novelId, content, parentCommentId, rootCommentId, path, depth })
		await FeedModel.create({ feedId: await getNextSequence('feedId'), action: 'comment', userId, novelId, payload: { commentId } })
		return doc
	},
	async likeNovel(novelId: number, delta: 1 | -1) {
		const novel = await NovelModel.findOneAndUpdate({ novelId }, { $inc: delta === 1 ? { upvoteCount: 1 } : { downvoteCount: 1 } }, { new: true })
		if (novel) await NovelSearchService.indexNovel(novel)
		return { success: true }
	},
	async likeChapter(chapterId: number, delta: 1 | -1) {
		await ChapterModel.updateOne({ chapterId }, { $inc: delta === 1 ? { upvoteCount: 1 } : { downvoteCount: 1 } })
		return { success: true }
	},
	async likeComment(commentId: number, delta: 1 | -1) {
		await NovelCommentModel.updateOne({ commentId }, { $inc: delta === 1 ? { upvoteCount: 1 } : { downvoteCount: 1 } })
		return { success: true }
	},
	async search(params: Parameters<typeof NovelSearchService.search>[0]) {
		await NovelSearchService.ensureIndex()
		return await NovelSearchService.search(params)
	},

	// Comment moderation methods
	async listComments(params: { novelId?: number; page?: number; pageSize?: number; includeDeleted?: boolean }) {
		const { novelId, page = 1, pageSize = 50, includeDeleted = false } = params
		const skip = (page - 1) * pageSize
		
		const query: any = {}
		if (novelId) query.novelId = novelId
		if (!includeDeleted) query.isDeleted = false
		
		const [items, total] = await Promise.all([
			NovelCommentModel.find(query)
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(pageSize)
				.lean(),
			NovelCommentModel.countDocuments(query)
		])
		
		return { items, total, page, pageSize }
	},

	async deleteComment(commentId: number) {
		const result = await NovelCommentModel.updateOne(
			{ commentId },
			{ $set: { isDeleted: true } }
		)
		return { success: result.modifiedCount > 0 }
	},

	async restoreComment(commentId: number) {
		const result = await NovelCommentModel.updateOne(
			{ commentId },
			{ $set: { isDeleted: false } }
		)
		return { success: result.modifiedCount > 0 }
	},

	async getComment(commentId: number) {
		return await NovelCommentModel.findOne({ commentId }).lean()
	}
} 