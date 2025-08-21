import type { FastifyRequest, FastifyReply } from 'fastify'
import { ChapterService } from '../../services/ChapterService.js'

export const ChapterController = {
	// GET /chapter/list
	list: async (request: FastifyRequest) => {
		const q = request.query as any
		let novelId: number | undefined
		
		// Handle novelUuid to novelId conversion
		if (q.novelUuid) {
			const NovelModel = (await import('../../infrastructure/models/Novel.js')).NovelModel
			const novel = await NovelModel.findOne({ uuid: q.novelUuid }).lean()
			if (novel) {
				novelId = novel.novelId
			} else {
				return { success: false, message: 'Novel not found' }
			}
		} else if (q.novelId) {
			novelId = Number(q.novelId)
		}
		
		if (!novelId) {
			return { success: false, message: 'Novel ID or UUID required' }
		}
		
		const page = q.from ? Math.floor(Number(q.from) / Number(q.size || 50)) + 1 : 1
		const pageSize = Number(q.size) || 50
		
		const result = await ChapterService.listChapters(novelId, page, pageSize)
		return { success: true, result }
	},

	// GET /chapter/:uuid
	get: async (request: FastifyRequest) => {
		const params = request.params as any
		const chapter = await ChapterService.getChapterByUuid(params.uuid)
		if (!chapter) {
			return { success: false, message: 'Chapter not found' }
		}
		return { success: true, result: chapter }
	},

	// POST /chapter/create
	create: async (request: FastifyRequest) => {
		const body = request.body as any
		const chapter = await ChapterService.createChapter({
			novelId: body.novelId,
			novelUuid: body.novelUuid,
			title: body.title,
			content: body.content,
			sequence: body.sequence
		})
		return { success: true, result: { chapterId: chapter.chapterId, uuid: chapter.uuid } }
	},

	// PATCH /chapter/update
	update: async (request: FastifyRequest) => {
		const body = request.body as any
		const updated = await ChapterService.updateChapter(body.chapterId, body)
		return { success: !!updated }
	},

	// DELETE /chapter/delete
	remove: async (request: FastifyRequest) => {
		const body = request.body as any
		await ChapterService.deleteChapter(body.chapterId)
		return { success: true }
	},

	// POST /chapter/reorder
	reorder: async (request: FastifyRequest) => {
		const body = request.body as any
		const result = await ChapterService.reorderChapter(body.chapterId, body.direction)
		return { success: result.success }
	}
} 