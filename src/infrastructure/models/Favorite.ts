import { Schema, model, type InferSchemaType } from 'mongoose'

const FavoriteSchema = new Schema({
	userUuid: { type: String, required: true, index: true }, // Secure UUID field
	novelId: { type: Number, required: true, index: true },
	novelUuid: { type: String, required: true, index: true },
	createdAtMs: { type: Number, default: () => Date.now(), index: true }
}, { timestamps: true, versionKey: false, collection: 'favorites' })

// UUID-based unique index (secure)
FavoriteSchema.index({ userUuid: 1, novelId: 1 }, { unique: true })
FavoriteSchema.index({ novelId: 1, createdAt: -1 })
FavoriteSchema.index({ userUuid: 1, createdAt: -1 })

export type FavoriteDocument = InferSchemaType<typeof FavoriteSchema>
export const FavoriteModel = model('Favorite', FavoriteSchema) 