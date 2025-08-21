import { Schema, model, type InferSchemaType } from 'mongoose'

// Report target types
export type ReportTargetType = 'novel' | 'chapter' | 'comment' | 'user'

const ReportSchema = new Schema({
	reportId: { type: Number, required: true, unique: true, index: true },
	uuid: { type: String, required: true, unique: true, index: true },
	// Reporter
	reporterUserId: { type: Number, required: true, index: true },
	// Target
	targetType: { type: String, enum: ['novel', 'chapter', 'comment', 'user'], required: true, index: true },
	targetId: { type: Number, required: true, index: true },
	// Classification
	category: { type: String, required: true, index: true }, // dmca | abuse | copyright | offensive | error | bug | translation_issue | incomplete_chapter | novel_error | other
	tags: { type: [String], default: [], index: true },
	// Details
	title: { type: String, default: '' },
	description: { type: String, default: '' },
	attachments: { type: [String], default: [] }, // URLs or IDs referencing evidence
	// Status workflow
	status: { type: String, enum: ['open', 'reviewing', 'resolved', 'dismissed'], default: 'open', index: true },
	assignedToUserId: { type: Number, default: null, index: true },
	resolutionNote: { type: String, default: '' }
}, { timestamps: true, versionKey: false, collection: 'reports' })

ReportSchema.index({ targetType: 1, targetId: 1, createdAt: -1 })
ReportSchema.index({ reporterUserId: 1, createdAt: -1 })
ReportSchema.index({ category: 1, createdAt: -1 })
ReportSchema.index({ status: 1, updatedAt: -1 })

export type ReportDocument = InferSchemaType<typeof ReportSchema>
export const ReportModel = model('Report', ReportSchema) 