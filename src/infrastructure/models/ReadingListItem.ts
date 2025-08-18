import { Schema, model, type InferSchemaType } from 'mongoose'

const ReadingListItemSchema = new Schema({
	listId: { type: Number, required: true, index: true },
	itemId: { type: Number, required: true, unique: true, index: true },
	novelId: { type: Number, required: true, index: true },
	novelUuid: { type: String, required: true, index: true },
	order: { type: Number, default: 0, index: true },
	notes: { type: String, default: '' },
	addedAtMs: { type: Number, default: () => Date.now(), index: true }
}, { timestamps: true, versionKey: false, collection: 'reading-list-items' })

ReadingListItemSchema.index({ listId: 1, order: 1 })
ReadingListItemSchema.index({ listId: 1, addedAtMs: -1 })
ReadingListItemSchema.index({ listId: 1, novelId: 1 }, { unique: true })

export type ReadingListItemDocument = InferSchemaType<typeof ReadingListItemSchema>
export const ReadingListItemModel = model('ReadingListItem', ReadingListItemSchema) 