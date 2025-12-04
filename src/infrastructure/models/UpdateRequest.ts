import { Schema, model, type InferSchemaType } from 'mongoose'

const UpdateRequestSchema = new Schema({
	uuid: { type: String, required: true, unique: true, index: true },
	// Request author
	authorUserUuid: { type: String, required: true, index: true },
	authorUsername: { type: String, default: '' },
	authorNickname: { type: String, default: '' },
	authorAvatar: { type: String, default: '' },
	// Novel being requested for update
	novelSlug: { type: String, required: true, index: true },
	novelUuid: { type: String, default: '' },
	novelTitle: { type: String, default: '' },
	novelCover: { type: String, default: '' },
	novelAuthor: { type: String, default: '' },
	novelStatus: { type: String, default: '' },
	novelChapterCount: { type: Number, default: 0 },
	// Request details
	message: { type: String, default: '' }, // Optional message from requester
	// Voting
	upvoteCount: { type: Number, default: 0, index: true },
	downvoteCount: { type: Number, default: 0 },
	// Status: pending | approved | rejected | completed
	status: { type: String, default: 'pending', index: true },
	// Admin response
	adminResponse: { type: String, default: '' },
	respondedAt: { type: Date, default: null },
	respondedByUserUuid: { type: String, default: '' },
}, { timestamps: true, versionKey: false, collection: 'update-requests' })

// Indexes for efficient queries
UpdateRequestSchema.index({ upvoteCount: -1, createdAt: -1 })
UpdateRequestSchema.index({ novelSlug: 1, authorUserUuid: 1 }, { unique: true }) // One request per user per novel
UpdateRequestSchema.index({ status: 1, upvoteCount: -1 })
UpdateRequestSchema.index({ authorUserUuid: 1, createdAt: -1 })

export type UpdateRequestDocument = InferSchemaType<typeof UpdateRequestSchema>
export const UpdateRequestModel = model('UpdateRequest', UpdateRequestSchema)

