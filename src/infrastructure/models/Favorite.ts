import { Schema, model, type InferSchemaType } from 'mongoose'

const FavoriteSchema = new Schema({
	userId: { type: Number, required: true, index: true },
	novelId: { type: Number, required: true, index: true },
	novelUuid: { type: String, required: true, index: true },
	createdAtMs: { type: Number, default: () => Date.now(), index: true }
}, { timestamps: true, versionKey: false, collection: 'favorites' })

FavoriteSchema.index({ userId: 1, novelId: 1 }, { unique: true })
FavoriteSchema.index({ novelId: 1, createdAt: -1 })

export type FavoriteDocument = InferSchemaType<typeof FavoriteSchema>
export const FavoriteModel = model('Favorite', FavoriteSchema) 