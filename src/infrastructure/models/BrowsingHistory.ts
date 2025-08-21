import { Schema, model, type InferSchemaType } from 'mongoose'

const BrowsingHistorySchema = new Schema({
	userId: { type: Number, required: true, index: true },
	novelId: { type: Number, required: true, index: true },
	chapterId: { type: Number, required: true, index: true },
	lastReadAt: { type: Date, default: Date.now, index: true },
	progress: { type: Number, default: 0 }, // 0..1
	device: { type: String, default: '' }
}, { timestamps: true, versionKey: false, collection: 'browsing-history' })

BrowsingHistorySchema.index({ userId: 1, novelId: 1 }, { unique: true })
BrowsingHistorySchema.index({ userId: 1, updatedAt: -1 })

export type BrowsingHistoryDocument = InferSchemaType<typeof BrowsingHistorySchema>
export const BrowsingHistoryModel = model('BrowsingHistory', BrowsingHistorySchema) 