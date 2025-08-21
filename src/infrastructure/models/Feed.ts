import { Schema, model, type InferSchemaType } from 'mongoose'

const FeedSchema = new Schema({
	feedId: { type: Number, required: true, unique: true, index: true },
	action: { type: String, required: true, index: true }, // create_novel, update_chapter, comment
	userId: { type: Number, required: true, index: true },
	novelId: { type: Number, required: true, index: true },
	chapterId: { type: Number },
	payload: { type: Object, default: {} },
	createdAtMs: { type: Number, default: () => Date.now(), index: true }
}, { timestamps: true, versionKey: false, collection: 'feeds' })

FeedSchema.index({ novelId: 1, createdAt: -1 })
FeedSchema.index({ userId: 1, createdAt: -1 })

export type FeedDocument = InferSchemaType<typeof FeedSchema>
export const FeedModel = model('Feed', FeedSchema) 