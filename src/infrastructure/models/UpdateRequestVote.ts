import { Schema, model, type InferSchemaType } from 'mongoose'

const UpdateRequestVoteSchema = new Schema({
	requestUuid: { type: String, required: true, index: true },
	userUuid: { type: String, required: true, index: true },
	voteType: { type: String, required: true, enum: ['upvote', 'downvote'] },
}, { timestamps: true, versionKey: false, collection: 'update-request-votes' })

// Compound unique index: one vote per user per request
UpdateRequestVoteSchema.index({ requestUuid: 1, userUuid: 1 }, { unique: true })

export type UpdateRequestVoteDocument = InferSchemaType<typeof UpdateRequestVoteSchema>
export const UpdateRequestVoteModel = model('UpdateRequestVote', UpdateRequestVoteSchema)

