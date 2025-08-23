import type { FastifyRequest, FastifyReply } from 'fastify'
import { ChapterService } from '../../services/ChapterService.js'

export const ChapterController = {
	// GET /chapter/list
	list: async (request: FastifyRequest) => {
		const q = request.query as any
		// Support both 'uuid' and 'novelUuid' for backward compatibility
		let uuid = q.novelUuid

		console.log('🔍 Chapter list request query:', q)

		if (!uuid) {
			console.log('❌ No uuid or novelUuid provided')
			return { success: false, message: 'Novel UUID required' }
		}

		console.log('✅ Using novel UUID:', uuid)
		
		// Handle 'from' parameter directly instead of converting to page
		const from = Number(q.from) || 0
		const size = Number(q.size) || 50

		console.log('📊 Pagination params:', { from, size, uuid })

		// Pass uuid directly to service for querying
		const result = await ChapterService.listChapters(uuid, from, size)
		
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
				
				// Test by uuid directly (more efficient)
				const byUuid = await ChapterModel.find({ novelUuid: uuid, isPublished: true })
					.select('uuid title sequence novelId')
					.sort({ sequence: 1 })
					.limit(5)
					.lean()
				
				console.log('📊 Direct MongoDB test results:', {
					byUuid: {
						found: byUuid.length,
						sample: byUuid.map(c => ({ uuid: c.uuid, title: c.title, sequence: c.sequence, novelId: c.novelId }))
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