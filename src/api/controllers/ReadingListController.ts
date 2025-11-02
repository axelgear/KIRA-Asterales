import type { FastifyRequest } from 'fastify'
import { ReadingListService } from '../../services/ReadingListService.js'

export const ReadingListController = {
	createList: async (request: FastifyRequest) => {
		const body = request.body as any
		const cookies: any = request.cookies || {}
		const uid = Number(cookies?.uid)
		const doc = await ReadingListService.createList(uid, body.name, body.description, body.visibility)
		return { success: true, result: { uuid: doc.uuid } }
	},
	updateList: async (request: FastifyRequest) => {
		const body = request.body as any
		const cookies: any = request.cookies || {}
		const uid = Number(cookies?.uid)
		const updated = await ReadingListService.updateList(uid, String(body.listUuid), body)
		return { success: !!updated }
	},
	deleteList: async (request: FastifyRequest) => {
		const body = request.body as any
		const cookies: any = request.cookies || {}
		const uid = Number(cookies?.uid)
		await ReadingListService.deleteList(uid, String(body.listUuid))
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
		await ReadingListService.addItem(uid, String(body.listUuid), { novelSlug: String(body.novelSlug), novelUuid: String(body.novelUuid) })
		return { success: true }
	},
	removeItem: async (request: FastifyRequest) => {
		const body = request.body as any
		const cookies: any = request.cookies || {}
		const uid = Number(cookies?.uid)
		await ReadingListService.removeItem(uid, String(body.listUuid), String(body.novelSlug))
		return { success: true }
	},
	listItems: async (request: FastifyRequest) => {
		const q = request.query as any
		const cookies: any = request.cookies || {}
		const uid = cookies?.uid ? Number(cookies.uid) : undefined
		const data = await ReadingListService.listItems(String(q.listUuid), uid, Number(q.page) || 1, Number(q.pageSize) || 50)
		return { success: true, result: data }
	}
} 