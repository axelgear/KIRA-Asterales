import { randomUUID } from 'node:crypto'
import { getNextSequence } from '../infrastructure/models/Sequence.js'
import { ReportModel } from '../infrastructure/models/Report.js'

export const ReportService = {
	async create(params: { reporterUserId: number; targetType: 'novel'|'chapter'|'comment'|'user'; targetId: number; category: string; title?: string; description?: string; tags?: string[]; attachments?: string[] }) {
		const reportId = await getNextSequence('reportId')
		const uuid = randomUUID()
		const doc = await ReportModel.create({
			reportId,
			uuid,
			reporterUserId: params.reporterUserId,
			targetType: params.targetType,
			targetId: params.targetId,
			category: params.category,
			title: params.title ?? '',
			description: params.description ?? '',
			tags: params.tags ?? [],
			attachments: params.attachments ?? []
		})
		return doc
	},

	async list(params: { status?: string; targetType?: string; targetId?: number; category?: string; page?: number; pageSize?: number }) {
		const { status, targetType, targetId, category, page = 1, pageSize = 50 } = params
		const skip = (page - 1) * pageSize
		const query: any = {}
		if (status) query.status = status
		if (targetType) query.targetType = targetType
		if (targetId != null) query.targetId = targetId
		if (category) query.category = category
		const [items, total] = await Promise.all([
			ReportModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
			ReportModel.countDocuments(query)
		])
		return { items, total, page, pageSize }
	},

	async updateStatus(params: { reportId: number; status: 'open'|'reviewing'|'resolved'|'dismissed'; assignedToUserId?: number; resolutionNote?: string }) {
		const update: any = { status: params.status }
		if (params.assignedToUserId != null) update.assignedToUserId = params.assignedToUserId
		if (params.resolutionNote != null) update.resolutionNote = params.resolutionNote
		const doc = await ReportModel.findOneAndUpdate({ reportId: params.reportId }, { $set: update }, { new: true })
		return doc
	},

	async get(reportId: number) {
		return await ReportModel.findOne({ reportId }).lean()
	}
} 