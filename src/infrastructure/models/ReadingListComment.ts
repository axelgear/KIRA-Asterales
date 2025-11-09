import { Schema, model, type InferSchemaType } from 'mongoose'

const ReadingListCommentSchema = new Schema({
	commentId: { type: Number, required: true, unique: true, index: true },
	listUuid: { type: String, required: true, index: true },
	userUuid: { type: String, required: true, index: true },
	userId: { type: Number, index: true }, // legacy reference if needed
	content: { type: String, required: true },
	// Threading
	parentCommentId: { type: Number, default: null, index: true },
	rootCommentId: { type: Number, default: null, index: true },
	path: { type: String, default: '', index: true },
	depth: { type: Number, default: 0, index: true },
	// Voting
	upvoteCount: { type: Number, default: 0, required: true },
	downvoteCount: { type: Number, default: 0, required: true },
	// Soft delete
	isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, versionKey: false, collection: 'reading-list-comments' })

// Recent comments for a reading list
ReadingListCommentSchema.index({ listUuid: 1, createdAt: -1 })
// Thread retrieval within a list
ReadingListCommentSchema.index({ listUuid: 1, rootCommentId: 1, path: 1 })
// Popular comments
ReadingListCommentSchema.index({ listUuid: 1, upvoteCount: -1, createdAt: -1 })

export type ReadingListCommentDocument = InferSchemaType<typeof ReadingListCommentSchema>
export const ReadingListCommentModel = model('ReadingListComment', ReadingListCommentSchema)

