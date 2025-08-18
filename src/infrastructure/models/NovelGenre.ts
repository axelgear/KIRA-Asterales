import { Schema, model, type InferSchemaType } from 'mongoose'

const NovelGenreSchema = new Schema({
	genreId: { type: Number, required: true, unique: true, index: true },
	uuid: { type: String, required: true, unique: true, index: true },
	slug: { type: String, required: true, unique: true, index: true },
	defaultLocale: { type: String, default: 'en' },
	names: { type: Map, of: String, default: {} }, // locale -> name
	color: { type: String, default: '#6666ff' },
	description: { type: String, default: '' }
}, { timestamps: true, versionKey: false, collection: 'novel-genres' })

NovelGenreSchema.index({ 'names.en': 1 })
NovelGenreSchema.index({ updatedAt: -1 })

export type NovelGenreDocument = InferSchemaType<typeof NovelGenreSchema>
export const NovelGenreModel = model('NovelGenre', NovelGenreSchema) 