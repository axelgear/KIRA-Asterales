import type { FastifyRequest } from 'fastify'
import { ReadingListService } from '../../services/ReadingListService.js'
import { validateTokenAndGetUserUuid, validateJwtToken } from '../../common/jwtAuth.js'

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
		const items = await ReadingListService.publicLists(q.ownerUserUuid != null ? String(q.ownerUserUuid) : undefined)
		return { success: true, result: items }
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
	}
} 