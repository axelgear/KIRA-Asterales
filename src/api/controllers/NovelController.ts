import type { FastifyRequest, FastifyReply } from 'fastify'
import { NovelService } from '../../services/NovelService.js'

export const NovelController = {
	// GET /novel/:slug
	get: async (request: FastifyRequest) => {
		const params = request.params as any
		const novel = await NovelService.getNovel(String(params.slug))
		if (!novel) {
			return { success: false, message: 'Novel not found' }
		}
		return { success: true, result: novel }
	},

	// POST /novel/create
	create: async (request: FastifyRequest, reply: FastifyReply) => {
		const body = request.body as any
		const cookies: any = request.cookies || {}
		const uid = Number(cookies?.uid)
		const novel = await NovelService.createNovel({
			ownerUserId: uid,
			title: body.title,
			slug: body.slug,
			description: body.description,
			tags: body.tags,
			genres: body.genres,
			language: body.language,
			coverUrl: body.coverUrl
		})
		return { success: true, result: { novelId: novel.novelId, uuid: novel.uuid } }
	},

	// PATCH /novel/update
	update: async (request: FastifyRequest) => {
		const body = request.body as any
		const updated = await NovelService.updateNovel(Number(body.novelId), body)
		return { success: !!updated }
	},

	// DELETE /novel/delete
	remove: async (request: FastifyRequest) => {
		const body = request.body as any
		await NovelService.deleteNovel(Number(body.novelId))
		return { success: true }
	},

	// POST /novel/history/upsert
	upsertHistory: async (request: FastifyRequest) => {
		const body = request.body as any
		const cookies: any = request.cookies || {}
		await NovelService.upsertHistory(Number(cookies?.uid), Number(body.novelId), Number(body.chapterId), body.progress)
		return { success: true }
	},

	// POST /novel/comment/add
	addComment: async (request: FastifyRequest) => {
		const body = request.body as any
		const cookies: any = request.cookies || {}
		const c = await NovelService.addComment(Number(cookies?.uid), Number(body.novelId), body.content, body.replyToCommentId)
		return { success: true, result: { commentId: c.commentId } }
	},

	// POST /novel/populate-chapters - Populate chapter info for a specific novel (admin only)
	populateChapterInfo: async (request: FastifyRequest) => {
		try {
			const body = request.body as any
			const { novelId } = body
			
			if (!novelId) {
				return { success: false, message: 'novelId required' }
			}
			
			console.log(`🔍 Populating chapter info for novel: ${novelId}`)
			const result = await NovelService.populateChapterInfo(Number(novelId))
			
			return { 
				success: result, 
				message: result ? 'Chapter info populated successfully' : 'Failed to populate chapter info',
				result: { novelId, populated: result }
			}
		} catch (error) {
			console.error('❌ Error populating chapter info:', error)
			return { 
				success: false, 
				message: 'Error populating chapter info',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// POST /novel/populate-all-chapters - Populate chapter info for all novels (admin only)
	populateAllChapterInfo: async (request: FastifyRequest) => {
		try {
			console.log('🔍 Populating chapter info for all novels...')
			const result = await NovelService.populateAllNovelsChapterInfo()
			
			return { 
				success: true, 
				message: 'Chapter info population completed',
				result 
			}
		} catch (error) {
			console.error('❌ Error populating all chapter info:', error)
			return { 
				success: false, 
				message: 'Error populating all chapter info',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// POST /novel/rebuild-index - Rebuild Elasticsearch index (admin only)
	rebuildIndex: async (request: FastifyRequest) => {
		try {
			console.log('🔨 Rebuilding novel Elasticsearch index...')
			
			const { NovelSearchService } = await import('../../services/NovelSearchService.js')
			const result = await NovelSearchService.rebuildIndex()
			
			return { 
				success: result.success, 
				message: result.success ? 'Index rebuilt successfully' : 'Failed to rebuild index',
				result 
			}
		} catch (error) {
			console.error('❌ Error rebuilding novel index:', error)
			return { 
				success: false, 
				message: 'Error rebuilding index',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// POST /novel/like | /novel/dislike
	likeNovel: async (request: FastifyRequest) => {
		const body = request.body as any
		await NovelService.likeNovel(Number(body.novelId), body.action === 'like' ? 1 : -1)
		return { success: true }
	},

	// POST /novel/comment/like | /novel/comment/dislike
	likeComment: async (request: FastifyRequest) => {
		const body = request.body as any
		await NovelService.likeComment(Number(body.commentId), body.action === 'like' ? 1 : -1)
		return { success: true }
	},

	// GET /novel/search
	search: async (request: FastifyRequest) => {
		const q = request.query as any
		const params: any = {}
		if (q.q != null) params.q = String(q.q)
		if (q.tagIds != null) params.tagIds = String(q.tagIds).split(',').map(s => Number(s.trim())).filter(n => !isNaN(n))
		if (q.genreIds != null) params.genreIds = String(q.genreIds).split(',').map(s => Number(s.trim())).filter(n => !isNaN(n))
		if (q.language != null) params.language = String(q.language)
		if (q.status != null) {
			// Normalize status: accept case-insensitive CSV and map to canonical values
			const raw = String(q.status)
			const toCanonical = (val: string) => {
				const v = val.trim().toLowerCase()
				if (v === 'ongoing' || v === 'on-going') return 'ongoing'
				if (v === 'completed' || v === 'complete') return 'completed'
				if (v === 'hiatus' || v === 'paused' || v === 'onhold' || v === 'on-hold') return 'hiatus'
				return v
			}
			const values = raw.split(',').map(toCanonical).filter(Boolean)
			params.status = values.length <= 1 ? values[0] : values
		}
		if (q.approvalStatus != null) params.approvalStatus = String(q.approvalStatus)
		if (q.source != null) params.source = String(q.source).split(',').map(s => Number(s.trim())).filter(n => !isNaN(n))
		if (q.from != null) params.from = Number(q.from)
		if (q.size != null) params.size = Number(q.size)
		if (q.sort != null) params.sort = q.sort === 'popular' ? 'popular' : 'recent'
		// Backward-compat: support `order` as alias for sort
		if (params.sort == null && q.order != null) params.sort = q.order === 'popular' ? 'popular' : 'recent'
		// Pass-through metric order (e.g., bookmarkcount, views, etc.)
		if (q.order != null) params.order = String(q.order)
		if (q.sortDirection != null) params.sortDirection = String(q.sortDirection)
		if (q.trackTotal != null) params.trackTotal = String(q.trackTotal).toLowerCase() === 'true'
		
		//console.log('🔍 Search params received:', params)
		const result = await NovelService.search(params)
		//console.log('📊 Search result:', result)
		return { success: true, result }
	},

	// Comment moderation endpoints
	// GET /novel/comments
	listComments: async (request: FastifyRequest) => {
		const q = request.query as any
		const params: any = {}
		if (q.novelId != null) params.novelId = Number(q.novelId)
		if (q.page != null) params.page = Number(q.page)
		if (q.pageSize != null) params.pageSize = Number(q.pageSize)
		if (q.includeDeleted != null) params.includeDeleted = q.includeDeleted === 'true'
		const result = await NovelService.listComments(params)
		return { success: true, result }
	},

	// POST /novel/comment/delete
	deleteComment: async (request: FastifyRequest) => {
		const body = request.body as any
		const result = await NovelService.deleteComment(Number(body.commentId))
		return { success: result.success }
	},

	// POST /novel/comment/restore
	restoreComment: async (request: FastifyRequest) => {
		const body = request.body as any
		const result = await NovelService.restoreComment(Number(body.commentId))
		return { success: result.success }
	},

	// GET /novel/comment/:commentId
	getComment: async (request: FastifyRequest) => {
		const params = request.params as any
		const comment = await NovelService.getComment(Number(params.commentId))
		return { success: true, result: comment }
	},

	// POST /novel/cache/clear - Clear search cache (admin only)
	clearSearchCache: async (request: FastifyRequest) => {
		try {
			const { NovelSearchService } = await import('../../services/NovelSearchService.js')
			const result = await NovelSearchService.clearSearchCache()

			return {
				success: true,
				message: 'Search cache cleared successfully',
				result
			}
		} catch (error) {
			console.error('❌ Error clearing search cache:', error)
			return {
				success: false,
				message: 'Error clearing search cache',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// GET /novel/cache/stats - Get search cache statistics (admin only)
	getCacheStats: async (request: FastifyRequest) => {
		try {
			const { NovelSearchService } = await import('../../services/NovelSearchService.js')
			const stats = await NovelSearchService.getCacheStats()

			return {
				success: true,
				result: stats
			}
		} catch (error) {
			console.error('❌ Error getting cache stats:', error)
			return {
				success: false,
				message: 'Error getting cache stats',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// POST /novel/cache/warmup - Warm up search cache (admin only)
	warmupCache: async (request: FastifyRequest) => {
		try {
			const { NovelSearchService } = await import('../../services/NovelSearchService.js')
			await NovelSearchService.warmupCache()

			return {
				success: true,
				message: 'Search cache warmed up successfully'
			}
		} catch (error) {
			console.error('❌ Error warming up cache:', error)
			return {
				success: false,
				message: 'Error warming up cache',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// GET /novel/search/suggestions - Get search suggestions/autocomplete
	searchSuggestions: async (request: FastifyRequest) => {
		try {
			const q = request.query as any
			const prefix = String(q.prefix || '').trim()
			const limit = Math.min(parseInt(q.limit) || 10, 20) // Max 20 suggestions

			const { NovelSearchService } = await import('../../services/NovelSearchService.js')
			const suggestions = await NovelSearchService.getSearchSuggestions(prefix, limit)

			// Return only essential fields
			const cleanSuggestions = suggestions.map((suggestion: any) => ({
				searchTerm: suggestion.searchTerm,
				searchCount: suggestion.searchCount
			}))

			return {
				success: true,
				result: cleanSuggestions
			}
		} catch (error) {
			console.error('❌ Error getting search suggestions:', error)
			return {
				success: false,
				message: 'Error getting search suggestions',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// GET /novel/search/popular - Get popular search terms
	popularSearchTerms: async (request: FastifyRequest) => {
		try {
			const q = request.query as any
			const limit = Math.min(parseInt(q.limit) || 10, 20) // Max 20 terms

			const { NovelSearchService } = await import('../../services/NovelSearchService.js')
			const terms = await NovelSearchService.getPopularSearchTerms(limit)

			// Return only essential fields
			const cleanTerms = terms.map((term: any) => ({
				searchTerm: term.searchTerm,
				searchCount: term.searchCount
			}))

			return {
				success: true,
				result: cleanTerms
			}
		} catch (error) {
			console.error('❌ Error getting popular search terms:', error)
			return {
				success: false,
				message: 'Error getting popular search terms',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// GET /novel/search/recent - Get recent search terms
	recentSearchTerms: async (request: FastifyRequest) => {
		try {
			const q = request.query as any
			const limit = Math.min(parseInt(q.limit) || 10, 20) // Max 20 terms

			const { NovelSearchService } = await import('../../services/NovelSearchService.js')
			const terms = await NovelSearchService.getRecentSearchTerms(limit)

			// Return only essential fields
			const cleanTerms = terms.map((term: any) => ({
				searchTerm: term.searchTerm,
				searchCount: term.searchCount
			}))

			return {
				success: true,
				result: cleanTerms
			}
		} catch (error) {
			console.error('❌ Error getting recent search terms:', error)
			return {
				success: false,
				message: 'Error getting recent search terms',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// POST /novel/search/cleanup - Cleanup old search terms (admin only)
	cleanupSearchTerms: async (request: FastifyRequest) => {
		try {
			const body = request.body as any
			const keepDays = parseInt(body.keepDays) || 30
			const minCount = parseInt(body.minCount) || 3

			const { NovelSearchService } = await import('../../services/NovelSearchService.js')
			const result = await NovelSearchService.cleanupSearchTerms(keepDays, minCount)

			return {
				success: true,
				message: 'Search terms cleaned up successfully',
				result
			}
		} catch (error) {
			console.error('❌ Error cleaning up search terms:', error)
			return {
				success: false,
				message: 'Error cleaning up search terms',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// Public endpoint for listing novel comments
	// GET /novel/:novelId/comments
	listNovelComments: async (request: FastifyRequest) => {
		const params = request.params as any
		const q = request.query as any
		const queryParams: any = { novelId: Number(params.novelId) }
		if (q.page != null) queryParams.page = Number(q.page)
		if (q.pageSize != null) queryParams.pageSize = Number(q.pageSize)
		queryParams.includeDeleted = false // Public endpoint never shows deleted comments
		const result = await NovelService.listComments(queryParams)
		return { success: true, result }
	}
} 