import { Schema, model, type InferSchemaType } from 'mongoose'

const ChapterSchema = new Schema({
	chapterId: { type: Number, required: true, unique: true, index: true },
	uuid: { type: String, required: true, unique: true, index: true },
	novelId: { type: Number, required: true, index: true },
	novelUuid: { type: String, required: true, index: true },
	title: { type: String, required: true, index: true },
	sequence: { type: Number, required: true, index: true },
	wordCount: { type: Number, default: 0 },
	content: { type: String, required: true },
	isPublished: { type: Boolean, default: true, index: true },
	publishedAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true, versionKey: false, collection: 'chapters' })

// Common query patterns
ChapterSchema.index({ novelId: 1, sequence: 1 }, { unique: true })
ChapterSchema.index({ novelId: 1, updatedAt: -1 })

export type ChapterDocument = InferSchemaType<typeof ChapterSchema>
export const ChapterModel = model('Chapter', ChapterSchema) 