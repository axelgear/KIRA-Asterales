import { Schema, model, type InferSchemaType } from 'mongoose'

const ReadingListSchema = new Schema({
	uuid: { type: String, required: true, unique: true, index: true },
	ownerUserId: { type: Number, required: true, index: true },
	name: { type: String, required: true, index: true },
	description: { type: String, default: '' },
	visibility: { type: String, default: 'private', index: true }, // private | public | unlisted
	itemsCount: { type: Number, default: 0, index: true },
	coverNovelId: { type: Number, default: null },
	upvoteCount: { type: Number, default: 0, required: true, index: true },
	downvoteCount: { type: Number, default: 0, required: true, index: true }
}, { timestamps: true, versionKey: false, collection: 'reading-lists' })

ReadingListSchema.index({ ownerUserId: 1, updatedAt: -1 })
ReadingListSchema.index({ visibility: 1, updatedAt: -1 })
ReadingListSchema.index({ upvoteCount: -1, updatedAt: -1 })

export type ReadingListDocument = InferSchemaType<typeof ReadingListSchema>
export const ReadingListModel = model('ReadingList', ReadingListSchema) 