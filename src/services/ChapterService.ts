import { ChapterModel } from '../infrastructure/models/Chapter.js'
import { getNextSequence } from '../infrastructure/models/Sequence.js'
import { randomUUID } from 'node:crypto'
import { NovelModel } from '../infrastructure/models/Novel.js'
import { ChapterSearchService } from './ChapterSearchService.js'

export const ChapterService = {
	async listChapters(novelId: number, page = 1, pageSize = 50) {
		// Try fast listing first (single document per novel)
		const novel = await NovelModel.findOne({ novelId }).lean()
		if (novel?.uuid) {
			const fastResult = await ChapterSearchService.fastListChaptersByNovel(novel.uuid, page, pageSize)
			if (fastResult) {
				return fastResult
			}
		}
		
		// Fallback to individual chapter documents
		const skip = (page - 1) * pageSize
		const [items, total] = await Promise.all([
			ChapterModel.find({ novelId, isPublished: true }).sort({ sequence: 1 }).skip(skip).limit(pageSize).lean(),
			ChapterModel.countDocuments({ novelId, isPublished: true })
		])
		return { items, total }
	},

	async getChapterByUuid(uuid: string) {
		return await ChapterModel.findOne({ uuid }).lean()
	},

	async createChapter(params: { novelId: number; novelUuid: string; title: string; content: string; sequence: number }) {
		const chapterId = await getNextSequence('chapterId')
		const uuid = randomUUID()
		
		const chapter = await ChapterModel.create({
			chapterId,
			uuid,
			novelId: params.novelId,
			novelUuid: params.novelUuid,
			title: params.title,
			content: params.content,
			sequence: params.sequence,
			wordCount: params.content.trim().split(/\s+/).length
		})
		
		return chapter
	},

	async updateChapter(chapterId: number, patch: Partial<{ title: string; content: string; sequence: number; isPublished: boolean }>) {
		const updateData: any = { ...patch }
		if (patch.content) {
			updateData.wordCount = patch.content.trim().split(/\s+/).length
		}
		
		const updated = await ChapterModel.findOneAndUpdate(
			{ chapterId },
			{ $set: updateData },
			{ new: true }
		)
		
		return updated
	},

	async deleteChapter(chapterId: number) {
		await ChapterModel.deleteOne({ chapterId })
		return { success: true }
	},

	async reorderChapter(chapterId: number, direction: 'up' | 'down') {
		const chapter = await ChapterModel.findOne({ chapterId }).lean()
		if (!chapter) return { success: false, message: 'Chapter not found' }
		
		const { novelId, sequence } = chapter
		
		if (direction === 'up' && sequence > 1) {
			// Swap with previous chapter
			const prevChapter = await ChapterModel.findOne({ novelId, sequence: sequence - 1 })
			if (prevChapter) {
				await ChapterModel.updateOne({ chapterId: prevChapter.chapterId }, { $set: { sequence } })
				await ChapterModel.updateOne({ chapterId }, { $set: { sequence: sequence - 1 } })
			}
		} else if (direction === 'down') {
			// Swap with next chapter
			const nextChapter = await ChapterModel.findOne({ novelId, sequence: sequence + 1 })
			if (nextChapter) {
				await ChapterModel.updateOne({ chapterId: nextChapter.chapterId }, { $set: { sequence } })
				await ChapterModel.updateOne({ chapterId }, { $set: { sequence: sequence + 1 } })
			}
		}
		
		return { success: true }
	}
} 