import type { FastifyRequest, FastifyReply } from 'fastify'
import { ChapterService } from '../../services/ChapterService.js'

export const ChapterController = {
	// GET /chapter/list
	list: async (request: FastifyRequest) => {
		const q = request.query as any
		let novelUuid: string | undefined
		
		console.log('🔍 Chapter list request query:', q)
		
		// Handle novelUuid parameter directly
		if (q.novelUuid) {
			novelUuid = q.novelUuid
			console.log('✅ Using novelUuid directly:', novelUuid)
		} else if (q.novelId) {
			// Fallback: convert novelId to novelUuid if needed
			console.log('📝 Converting novelId to novelUuid...')
			const NovelModel = (await import('../../infrastructure/models/Novel.js')).NovelModel
			const novel = await NovelModel.findOne({ novelId: Number(q.novelId) }).lean()
			if (novel) {
				novelUuid = novel.uuid
				console.log('✅ Converted novelId to novelUuid:', novelUuid)
			} else {
				console.log('❌ Novel not found for novelId:', q.novelId)
				return { success: false, message: 'Novel not found' }
			}
		}
		
		if (!novelUuid) {
			console.log('❌ No novelUuid available')
			return { success: false, message: 'Novel UUID or ID required' }
		}
		
		// Handle 'from' parameter directly instead of converting to page
		const from = Number(q.from) || 0
		const size = Number(q.size) || 50
		
		console.log('📊 Pagination params:', { from, size, novelUuid })
		
		// Pass novelUuid directly to service for more efficient querying
		const result = await ChapterService.listChapters(novelUuid, from, size)
		
		console.log('📋 Service result:', { 
			itemsCount: result.items?.length || 0, 
			total: result.total,
			from: result.from,
			size: result.size
		})
		
		// If service returned no results, try direct MongoDB test
		if (!result.items || result.items.length === 0) {
			console.log('🔄 Service returned no results, testing direct MongoDB...')
			try {
				const ChapterModel = (await import('../../infrastructure/models/Chapter.js')).ChapterModel
				
				// Test by novelUuid directly (more efficient)
				const byNovelUuid = await ChapterModel.find({ novelUuid, isPublished: true })
					.select('uuid title sequence novelId')
					.sort({ sequence: 1 })
					.limit(5)
					.lean()
				
				console.log('📊 Direct MongoDB test results:', {
					byNovelUuid: {
						found: byNovelUuid.length,
						sample: byNovelUuid.map(c => ({ uuid: c.uuid, title: c.title, sequence: c.sequence, novelId: c.novelId }))
					}
				})
			} catch (mongoError) {
				console.log('❌ Direct MongoDB test failed:', mongoError)
			}
		}
		
		return { success: true, result }
	},

	// Rebuild Elasticsearch chapter lists (for fixing indexing issues)
	rebuild: async (request: FastifyRequest) => {
		try {
			console.log('🔄 Starting Elasticsearch chapter list rebuild...')
			
			const ChapterListSearchService = (await import('../../services/ChapterListSearchService.js')).ChapterListSearchService
			const result = await ChapterListSearchService.rebuildAllNovels()
			
			return { 
				success: true, 
				message: 'Chapter list rebuild completed',
				result 
			}
		} catch (error) {
			console.error('❌ Chapter list rebuild failed:', error)
			return { 
				success: false, 
				message: 'Chapter list rebuild failed',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// GET /chapter/:uuid
	get: async (request: FastifyRequest) => {
		try {
			const params = request.params as any
			const uuid = params.uuid
			
			if (!uuid) {
				return { success: false, message: 'Chapter UUID required' }
			}
			
			console.log(`🔍 Fetching chapter by UUID: ${uuid}`)
			
			const chapter = await ChapterService.getChapterByUuid(uuid)
			
			if (!chapter) {
				return { success: false, message: 'Chapter not found' }
			}
			
			return { 
				success: true, 
				message: 'Chapter fetched successfully',
				result: chapter
			}
		} catch (error) {
			console.error('❌ Error fetching chapter:', error)
			return { 
				success: false, 
				message: 'Error fetching chapter',
				error: error instanceof Error ? error.message : String(error)
			}
		}
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