import { Schema, model, type InferSchemaType } from 'mongoose'

const ReadingListItemSchema = new Schema({
	listUuid: { type: String, required: true, index: true },
	itemId: { type: Number, required: true, unique: true, index: true },
	novelSlug: { type: String, required: true, index: true },
	novelUuid: { type: String, required: true, index: true }
}, { timestamps: true, versionKey: false, collection: 'reading-list-items' })

ReadingListItemSchema.index({ listUuid: 1, createdAt: -1 })
ReadingListItemSchema.index({ listUuid: 1, novelSlug: 1 }, { unique: true })

export type ReadingListItemDocument = InferSchemaType<typeof ReadingListItemSchema>
export const ReadingListItemModel = model('ReadingListItem', ReadingListItemSchema) 