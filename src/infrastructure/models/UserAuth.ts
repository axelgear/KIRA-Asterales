import { Schema, model, type InferSchemaType } from 'mongoose'

const UserAuthSchema = new Schema({
	UUID: { type: String, required: true, index: true, unique: true },
	email: { type: String, required: true, index: true },
	emailLowerCase: { type: String, required: true, index: true },
	passwordHashHash: { type: String, required: true },
	authenticatorType: { 
		type: String, 
		enum: ['none', 'totp', 'email'], 
		default: 'none' 
	},
	lastLoginTime: { type: Number, default: () => Date.now() },
	loginAttempts: { type: Number, default: 0 },
	lockedUntil: { type: Number, default: 0 }
}, { timestamps: true })

UserAuthSchema.index({ UUID: 1 })
UserAuthSchema.index({ emailLowerCase: 1 })

export type UserAuthDocument = InferSchemaType<typeof UserAuthSchema>
export const UserAuthModel = model('userAuth', UserAuthSchema) 