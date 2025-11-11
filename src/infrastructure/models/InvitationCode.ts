import { Schema, model, type InferSchemaType } from 'mongoose'

const InvitationCodeSchema = new Schema({
	creatorUid: { type: Number, required: true, index: true },
	creatorUUID: { type: String, required: true },
	invitationCode: { type: String, required: true, unique: true },
	generationDateTime: { type: Number, required: true },
	isPending: { type: Boolean, default: true },
	disabled: { type: Boolean, default: false },
	assigneeUid: { type: Number },
	assigneeUUID: { type: String },
	usedDateTime: { type: Number },
}, { timestamps: true })

InvitationCodeSchema.index({ creatorUid: 1, invitationCode: 1 })

export type InvitationCodeDocument = InferSchemaType<typeof InvitationCodeSchema>
export const InvitationCodeModel = model('invitation_codes', InvitationCodeSchema)

