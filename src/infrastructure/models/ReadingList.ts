import { Schema, model, type InferSchemaType } from 'mongoose'

const ReadingListSchema = new Schema({
	listId: { type: Number, required: true, unique: true, index: true },
	uuid: { type: String, required: true, unique: true, index: true },
	ownerUserId: { type: Number, required: true, index: true },
	name: { type: String, required: true, index: true },
	description: { type: String, default: '' },
	visibility: { type: String, default: 'private', index: true }, // private | public | unlisted
	itemsCount: { type: Number, default: 0, index: true },
	coverNovelId: { type: Number, default: null }
}, { timestamps: true, versionKey: false, collection: 'reading-lists' })

ReadingListSchema.index({ ownerUserId: 1, updatedAt: -1 })
ReadingListSchema.index({ visibility: 1, updatedAt: -1 })

export type ReadingListDocument = InferSchemaType<typeof ReadingListSchema>
export const ReadingListModel = model('ReadingList', ReadingListSchema) 