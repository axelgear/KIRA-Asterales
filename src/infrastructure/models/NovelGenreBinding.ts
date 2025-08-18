import { Schema, model, type InferSchemaType } from 'mongoose'

const NovelGenreBindingSchema = new Schema({
	novelId: { type: Number, required: true, index: true },
	genreId: { type: Number, required: true, index: true }
}, { timestamps: true, versionKey: false, collection: 'novel-genre-bindings' })

NovelGenreBindingSchema.index({ novelId: 1, genreId: 1 }, { unique: true })

export type NovelGenreBindingDocument = InferSchemaType<typeof NovelGenreBindingSchema>
export const NovelGenreBindingModel = model('NovelGenreBinding', NovelGenreBindingSchema) 