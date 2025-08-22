import { Schema, model, type InferSchemaType } from 'mongoose'

const NovelSchema = new Schema({
	novelId: { type: Number, required: true, unique: true, index: true },
	uuid: { type: String, required: true, unique: true, index: true },
	ownerUserId: { type: Number, required: true, index: true },
	title: { type: String, required: true, index: true },
	slug: { type: String, required: true, unique: true, index: true },
	description: { type: String, default: '' },
	tagIds: { type: [Number], default: [], index: true }, // Array of tag IDs
	genreIds: { type: [Number], default: [], index: true }, // Array of genre IDs
	status: { type: String, default: 'ongoing', index: true }, // ongoing | completed | hiatus
	approvalStatus: { type: String, default: 'pending', index: true }, // pending | approved | rejected | deleted
	coverImg: { type: String, default: '' },
	language: { type: String, default: 'en', index: true },
	source: { type: [Number], default: [], index: true }, // Array of source IDs like [1] or [2,3] or [1,4,2]

	// Stats
	views: { type: Number, default: 0, index: true },
	favoritesCount: { type: Number, default: 0, index: true },
	chaptersCount: { type: Number, default: 0, index: true },
	upvoteCount: { type: Number, default: 0, required: true, index: true },
	downvoteCount: { type: Number, default: 0, required: true, index: true },
	
	// Chapter info
	firstChapter: {
		uuid: { type: String },
		title: { type: String },
		sequence: { type: Number }
	},
	latestChapter: {
		uuid: { type: String },
		title: { type: String },
		sequence: { type: Number }
	}
}, { timestamps: true, versionKey: false, collection: 'novels' })

// Compound indexes for common queries
NovelSchema.index({ updatedAt: -1 })
NovelSchema.index({ favoritesCount: -1, updatedAt: -1 })
NovelSchema.index({ upvoteCount: -1, updatedAt: -1 })
NovelSchema.index({ tagIds: 1, updatedAt: -1 })
NovelSchema.index({ genreIds: 1, updatedAt: -1 })
NovelSchema.index({ language: 1, updatedAt: -1 })
NovelSchema.index({ approvalStatus: 1, updatedAt: -1 }) // Index for approval status with updatedAt
NovelSchema.index({ source: 1, updatedAt: -1 }) // Index for source field with updatedAt

// Text index for search (Mongo-side; ES will be primary search)
NovelSchema.index({ title: 'text', description: 'text' })

export type NovelDocument = InferSchemaType<typeof NovelSchema>
export const NovelModel = model('Novel', NovelSchema) 