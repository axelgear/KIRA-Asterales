import { Schema, model, type InferSchemaType } from 'mongoose'

const NovelTagSchema = new Schema({
	tagId: { type: Number, required: true, unique: true, index: true },
	uuid: { type: String, required: true, unique: true, index: true },
	slug: { type: String, required: true, unique: true, index: true },
	defaultLocale: { type: String, default: 'en' },
	names: { type: Map, of: String, default: {} }, // locale -> name
	color: { type: String, default: '#999999' },
	description: { type: String, default: '' }
}, { timestamps: true, versionKey: false, collection: 'novel-tags' })

NovelTagSchema.index({ 'names.en': 1 })
NovelTagSchema.index({ updatedAt: -1 })

export type NovelTagDocument = InferSchemaType<typeof NovelTagSchema>
export const NovelTagModel = model('NovelTag', NovelTagSchema) 