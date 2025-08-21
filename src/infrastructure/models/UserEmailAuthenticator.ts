import { Schema, model, type InferSchemaType } from 'mongoose'

const UserEmailAuthenticatorSchema = new Schema({
	UUID: { type: String, required: true, index: true },
	enabled: { type: Boolean, default: true },
	emailLowerCase: { type: String, required: true },
	createDateTime: { type: Number, default: () => Date.now() },
	editDateTime: { type: Number, default: () => Date.now() }
}, { timestamps: true })

UserEmailAuthenticatorSchema.index({ UUID: 1, enabled: 1 })

export type UserEmailAuthenticatorDocument = InferSchemaType<typeof UserEmailAuthenticatorSchema>
export const UserEmailAuthenticatorModel = model('userEmailAuthenticator', UserEmailAuthenticatorSchema) 