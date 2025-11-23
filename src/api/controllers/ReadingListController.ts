import type { FastifyRequest } from 'fastify'
import { ReadingListService } from '../../services/ReadingListService.js'
import { validateTokenAndGetUserUuid, validateJwtToken } from '../../common/jwtAuth.js'
import { CacheService } from '../../services/CacheService.js'

export const ReadingListController = {
	createList: async (request: FastifyRequest) => {
		// Validate JWT token and get secure userUuid
		const authResult = validateJwtToken(request)
		if (!authResult.isValid) {
			return {
				success: false,
				message: `Authentication required - ${authResult.error || 'invalid or missing token'}`
			}
		}

		const body = request.body as any
		const uid = authResult.userId!
		const userUuid = authResult.userUuid!

		console.log('📝 Create reading list request:', { userUuid, uid, name: body.name })

		const doc = await ReadingListService.createList(userUuid, body.name, body.description, body.visibility)
		
		// Invalidate public lists cache if the list is public
		if (body.visibility === 'public') {
			await ReadingListController.invalidatePublicListsCache(userUuid)
		}
		
		return { success: true, result: { uuid: doc.uuid } }
	},
	updateList: async (request: FastifyRequest) => {
		// Validate JWT token and get secure userUuid
		const authResult = validateJwtToken(request)
		if (!authResult.isValid) {
			return {
				success: false,
				message: `Authentication required - ${authResult.error || 'invalid or missing token'}`
			}
		}

		const body = request.body as any
		const uid = authResult.userId!
		const userUuid = authResult.userUuid!

		console.log('✏️ Update reading list request:', { userUuid, uid, listUuid: body.listUuid })

		const updated = await ReadingListService.updateList(userUuid, String(body.listUuid), body)
		
		// Invalidate public lists cache (the list might have changed visibility or content)
		await ReadingListController.invalidatePublicListsCache(userUuid)
		
		return { success: !!updated }
	},
	deleteList: async (request: FastifyRequest) => {
		// Validate JWT token and get secure userUuid
		const authResult = validateJwtToken(request)
		if (!authResult.isValid) {
			return {
				success: false,
				message: `Authentication required - ${authResult.error || 'invalid or missing token'}`
			}
		}

		const body = request.body as any
		const uid = authResult.userId!
		const userUuid = authResult.userUuid!

		console.log('🗑️ Delete reading list request:', { userUuid, uid, listUuid: body.listUuid })

		await ReadingListService.deleteList(userUuid, String(body.listUuid))
		
		// Invalidate public lists cache
		await ReadingListController.invalidatePublicListsCache(userUuid)
		
		return { success: true }
	},
	myLists: async (request: FastifyRequest) => {
		// Validate JWT token and get secure userUuid
		const authResult = validateJwtToken(request)
		if (!authResult.isValid) {
			return {
				success: false,
				message: `Authentication required - ${authResult.error || 'invalid or missing token'}`
			}
		}

		const uid = authResult.userId!
		const userUuid = authResult.userUuid!

		console.log('📋 Get my reading lists request:', { userUuid, uid })

		const items = await ReadingListService.myLists(userUuid)
		return { success: true, result: items }
	},
	publicLists: async (request: FastifyRequest) => {
		const q = request.query as any
		const page = Number(q.page) || 1
		const pageSize = Number(q.pageSize) || 24
		const ownerUserUuid = q.ownerUserUuid != null ? String(q.ownerUserUuid) : undefined
		const sortKey = (q.sortKey as 'recent' | 'name' | 'items') || 'recent'
		const sortDirection = (q.sortDirection as 'ASC' | 'DESC') || 'DESC'
		
		// Generate cache key including sort parameters
		const cacheKey = `reading-lists:public:${ownerUserUuid || 'all'}:page:${page}:size:${pageSize}:sort:${sortKey}:${sortDirection}`
		
		// Try to get from cache first
		const cached = await CacheService.getCache(cacheKey)
		if (cached) {
			console.log(`📦 Cache hit for public reading lists: ${cacheKey}`)
			return { success: true, result: cached, cached: true }
		}
		
		console.log(`🔍 Cache miss for public reading lists: ${cacheKey}`)
		
		// Fetch from database
		const data = await ReadingListService.publicLists(ownerUserUuid, page, pageSize, sortKey, sortDirection)
		
		// Cache for 15 minutes (900 seconds)
		await CacheService.setCache(cacheKey, data, 900)
		
		return { success: true, result: data, cached: false }
	},
	addItem: async (request: FastifyRequest) => {
		// Validate JWT token and get secure userUuid
		const authResult = validateJwtToken(request)
		if (!authResult.isValid) {
			return {
				success: false,
				message: `Authentication required - ${authResult.error || 'invalid or missing token'}`
			}
		}

		const body = request.body as any
		const uid = authResult.userId!
		const userUuid = authResult.userUuid!

		console.log('➕ Add item to reading list request:', { userUuid, uid, listUuid: body.listUuid, novelSlug: body.novelSlug })

		await ReadingListService.addItem(userUuid, String(body.listUuid), { novelSlug: String(body.novelSlug), novelUuid: String(body.novelUuid) })
		
		// Invalidate public lists cache (cover images might have changed)
		await ReadingListController.invalidatePublicListsCache(userUuid)
		
		return { success: true }
	},
	removeItem: async (request: FastifyRequest) => {
		// Validate JWT token and get secure userUuid
		const authResult = validateJwtToken(request)
		if (!authResult.isValid) {
			return {
				success: false,
				message: `Authentication required - ${authResult.error || 'invalid or missing token'}`
			}
		}

		const body = request.body as any
		const uid = authResult.userId!
		const userUuid = authResult.userUuid!

		console.log('➖ Remove item from reading list request:', { userUuid, uid, listUuid: body.listUuid, novelSlug: body.novelSlug })

		await ReadingListService.removeItem(userUuid, String(body.listUuid), String(body.novelSlug))
		
		// Invalidate public lists cache (cover images might have changed)
		await ReadingListController.invalidatePublicListsCache(userUuid)
		
		return { success: true }
	},
	listItems: async (request: FastifyRequest) => {
		const q = request.query as any
		
		// For public reading lists, authentication is optional
		// For private lists, authentication is required
		const authResult = validateJwtToken(request)
		let uid: number | undefined = undefined
		let userUuid: string | undefined = undefined

		if (authResult.isValid) {
			uid = authResult.userId!
			userUuid = authResult.userUuid!
			console.log('📋 List items request (authenticated):', { userUuid, uid, listUuid: q.listUuid })
		} else {
			console.log('📋 List items request (public):', { listUuid: q.listUuid })
		}

		const data = await ReadingListService.listItems(String(q.listUuid), userUuid, Number(q.page) || 1, Number(q.pageSize) || 50)
		return { success: true, result: data }
	},
	
	// Helper function to invalidate public lists cache
	invalidatePublicListsCache: async (ownerUserUuid?: string) => {
		try {
			// Invalidate all public lists cache (both user-specific and general)
			const patterns = [
				`reading-lists:public:all:*`,
				ownerUserUuid ? `reading-lists:public:${ownerUserUuid}:*` : null
			].filter(Boolean) as string[]
			
			for (const pattern of patterns) {
				const keys = await CacheService.getCacheKeys(pattern)
				for (const key of keys) {
					await CacheService.deleteCache(key)
					console.log(`🗑️ Invalidated cache: ${key}`)
				}
			}
		} catch (error) {
			console.error('❌ Failed to invalidate public lists cache:', error)
		}
	}
} 