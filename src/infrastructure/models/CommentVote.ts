import { Schema, model, type InferSchemaType } from 'mongoose'

const CommentVoteSchema = new Schema({
	commentId: { type: Number, required: true, index: true },
	entityType: { type: String, required: true, enum: ['novel', 'readingList'], index: true },
	entityUuid: { type: String, required: true, index: true },
	userUuid: { type: String, required: true, index: true },
	vote: { type: Number, required: true, enum: [1, -1] },
}, { timestamps: true, versionKey: false, collection: 'comment-votes' })

CommentVoteSchema.index({ commentId: 1, userUuid: 1 }, { unique: true })
CommentVoteSchema.index({ entityType: 1, entityUuid: 1, vote: 1 })

export type CommentVoteDocument = InferSchemaType<typeof CommentVoteSchema>
export const CommentVoteModel = model('CommentVote', CommentVoteSchema)

