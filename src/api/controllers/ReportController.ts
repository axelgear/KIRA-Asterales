import type { FastifyRequest, FastifyReply } from 'fastify'
import { ReportService } from '../../services/ReportService.js'

export const ReportController = {
	// POST /report/create
	create: async (request: FastifyRequest) => {
		const body = request.body as any
		const cookies: any = request.cookies || {}
		const reporterUserId = Number(cookies?.uid)
		const doc = await ReportService.create({
			reporterUserId,
			targetType: body.targetType,
			targetId: Number(body.targetId),
			category: String(body.category),
			title: body.title,
			description: body.description,
			tags: body.tags,
			attachments: body.attachments
		})
		return { success: true, result: { reportId: doc.reportId, uuid: doc.uuid } }
	},
	// GET /report/list
	list: async (request: FastifyRequest) => {
		const q = request.query as any
		const params: any = {}
		if (q.status != null) params.status = String(q.status)
		if (q.targetType != null) params.targetType = String(q.targetType)
		if (q.targetId != null) params.targetId = Number(q.targetId)
		if (q.category != null) params.category = String(q.category)
		if (q.page != null) params.page = Number(q.page)
		if (q.pageSize != null) params.pageSize = Number(q.pageSize)
		const result = await ReportService.list(params)
		return { success: true, result }
	},
	// PATCH /report/status
	updateStatus: async (request: FastifyRequest) => {
		const body = request.body as any
		const params: any = { reportId: Number(body.reportId), status: body.status }
		if (body.assignedToUserId != null) params.assignedToUserId = Number(body.assignedToUserId)
		if (body.resolutionNote != null) params.resolutionNote = String(body.resolutionNote)
		const doc = await ReportService.updateStatus(params)
		return { success: !!doc }
	},
	// GET /report/:reportId
	get: async (request: FastifyRequest) => {
		const params = request.params as any
		const doc = await ReportService.get(Number(params.reportId))
		return { success: true, result: doc }
	}
} 