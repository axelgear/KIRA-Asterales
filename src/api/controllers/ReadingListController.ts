import type { FastifyRequest } from 'fastify'
import { ReadingListService } from '../../services/ReadingListService.js'

export const ReadingListController = {
	createList: async (request: FastifyRequest) => {
		const body = request.body as any
		const cookies: any = request.cookies || {}
		const uid = Number(cookies?.uid)
		const doc = await ReadingListService.createList(uid, body.name, body.description, body.visibility)
		return { success: true, result: { listId: doc.listId, uuid: doc.uuid } }
	},
	updateList: async (request: FastifyRequest) => {
		const body = request.body as any
		const cookies: any = request.cookies || {}
		const uid = Number(cookies?.uid)
		const updated = await ReadingListService.updateList(uid, Number(body.listId), body)
		return { success: !!updated }
	},
	deleteList: async (request: FastifyRequest) => {
		const body = request.body as any
		const cookies: any = request.cookies || {}
		const uid = Number(cookies?.uid)
		await ReadingListService.deleteList(uid, Number(body.listId))
		return { success: true }
	},
	myLists: async (request: FastifyRequest) => {
		const cookies: any = request.cookies || {}
		const uid = Number(cookies?.uid)
		const items = await ReadingListService.myLists(uid)
		return { success: true, result: items }
	},
	publicLists: async (request: FastifyRequest) => {
		const q = request.query as any
		const items = await ReadingListService.publicLists(q.ownerUserId != null ? Number(q.ownerUserId) : undefined)
		return { success: true, result: items }
	},
	addItem: async (request: FastifyRequest) => {
		const body = request.body as any
		const cookies: any = request.cookies || {}
		const uid = Number(cookies?.uid)
		await ReadingListService.addItem(uid, Number(body.listId), { novelId: Number(body.novelId), novelUuid: String(body.novelUuid) }, body.order, body.notes)
		return { success: true }
	},
	removeItem: async (request: FastifyRequest) => {
		const body = request.body as any
		const cookies: any = request.cookies || {}
		const uid = Number(cookies?.uid)
		await ReadingListService.removeItem(uid, Number(body.listId), Number(body.novelId))
		return { success: true }
	},
	listItems: async (request: FastifyRequest) => {
		const q = request.query as any
		const data = await ReadingListService.listItems(Number(q.listId), Number(q.page) || 1, Number(q.pageSize) || 50)
		return { success: true, result: data }
	}
} 