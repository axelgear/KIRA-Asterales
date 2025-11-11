import { Schema, model, type InferSchemaType } from 'mongoose'

const VerificationCodeSchema = new Schema({
	identifier: { type: String, required: true },
	type: { type: String, required: true },
	email: { type: String, required: true },
	codeHash: { type: String, required: true },
	metadata: { type: Schema.Types.Mixed },
	expiresAt: { type: Date, required: true },
	lastSentAt: { type: Date, required: true },
	attemptCount: { type: Number, default: 0 },
}, { timestamps: true })

VerificationCodeSchema.index({ identifier: 1, type: 1 }, { unique: true })
VerificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export type VerificationCodeDocument = InferSchemaType<typeof VerificationCodeSchema>
export const UserVerificationCodeModel = model('user_verification_codes', VerificationCodeSchema)

