import { Schema, model, type InferSchemaType } from 'mongoose'

const NovelCommentSchema = new Schema({
	commentId: { type: Number, required: true, unique: true, index: true },
	novelId: { type: Number, required: true, index: true },
	userId: { type: Number, required: true, index: true },
	content: { type: String, required: true },
	// Threading
	parentCommentId: { type: Number, default: null, index: true }, // null for top-level
	rootCommentId: { type: Number, default: null, index: true }, // top-most ancestor for quick thread grouping
	path: { type: String, default: '', index: true }, // materialized path like "0001/0005/0010"
	depth: { type: Number, default: 0, index: true },
	// Voting (like/dislike)
	upvoteCount: { type: Number, default: 0, required: true },
	downvoteCount: { type: Number, default: 0, required: true },
	// Soft delete
	isDeleted: { type: Boolean, default: false, index: true }
}, { timestamps: true, versionKey: false, collection: 'novel-comments' })

// Recent comments for a novel
NovelCommentSchema.index({ novelId: 1, createdAt: -1 })
// Thread retrieval within a novel (by root thread then by path)
NovelCommentSchema.index({ novelId: 1, rootCommentId: 1, path: 1 })
// Parent lookup for fetching replies
NovelCommentSchema.index({ parentCommentId: 1, createdAt: 1 })
// Popular comments
NovelCommentSchema.index({ novelId: 1, upvoteCount: -1, createdAt: -1 })

export type NovelCommentDocument = InferSchemaType<typeof NovelCommentSchema>
export const NovelCommentModel = model('NovelComment', NovelCommentSchema) 