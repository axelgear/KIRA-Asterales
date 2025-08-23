import { Schema, model, type InferSchemaType } from 'mongoose'

const BrowsingHistorySchema = new Schema({
	userId: { type: Number, required: true, index: true },
	novelSlug: { type: String, required: true, index: true },
	chapterUuid: { type: String, required: true, index: true },
	chapterTitle: { type: String, required: true },
	lastReadAt: { type: Date, default: Date.now, index: true },
	progress: { type: Number, default: 0 }, // 0..1 (reading progress percentage)
	device: { type: String, default: '' },
	chapterSequence: { type: Number, required: true, index: true }
}, { timestamps: true, versionKey: false, collection: 'browsing-history' })

// Indexes for efficient queries
BrowsingHistorySchema.index({ userId: 1, novelSlug: 1 }, { unique: true })
BrowsingHistorySchema.index({ userId: 1, updatedAt: -1 })
BrowsingHistorySchema.index({ userId: 1, lastReadAt: -1 })
BrowsingHistorySchema.index({ novelSlug: 1, updatedAt: -1 })

export type BrowsingHistoryDocument = InferSchemaType<typeof BrowsingHistorySchema>
export const BrowsingHistoryModel = model('BrowsingHistory', BrowsingHistorySchema) 