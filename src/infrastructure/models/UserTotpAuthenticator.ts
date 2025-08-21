import { Schema, model, type InferSchemaType } from 'mongoose'

const UserTotpAuthenticatorSchema = new Schema({
	UUID: { type: String, required: true, index: true },
	secret: { type: String, required: true },
	enabled: { type: Boolean, default: true },
	backupCodeHash: { type: String, default: '' },
	lastAttemptTime: { type: Number, default: () => Date.now() },
	attempts: { type: Number, default: 0 },
	createDateTime: { type: Number, default: () => Date.now() },
	editDateTime: { type: Number, default: () => Date.now() }
}, { timestamps: true })

UserTotpAuthenticatorSchema.index({ UUID: 1, enabled: 1 })

export type UserTotpAuthenticatorDocument = InferSchemaType<typeof UserTotpAuthenticatorSchema>
export const UserTotpAuthenticatorModel = model('userTotpAuthenticator', UserTotpAuthenticatorSchema) 