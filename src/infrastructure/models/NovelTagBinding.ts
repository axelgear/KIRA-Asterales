import { Schema, model, type InferSchemaType } from 'mongoose'

const NovelTagBindingSchema = new Schema({
	novelId: { type: Number, required: true, index: true },
	tagId: { type: Number, required: true, index: true }
}, { timestamps: true, versionKey: false, collection: 'novel-tag-bindings' })

NovelTagBindingSchema.index({ novelId: 1, tagId: 1 }, { unique: true })

export type NovelTagBindingDocument = InferSchemaType<typeof NovelTagBindingSchema>
export const NovelTagBindingModel = model('NovelTagBinding', NovelTagBindingSchema) 