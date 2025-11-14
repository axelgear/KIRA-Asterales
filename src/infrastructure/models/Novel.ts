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
	wordCount: { type: Number, default: 0, index: true },
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

// Pre-save middleware to calculate derived fields
NovelSchema.pre('save', function(next) {
	const novel = this as any;

	// Ensure default values for metrics
	if (novel.views === undefined) novel.views = 0;
	if (novel.favoritesCount === undefined) novel.favoritesCount = 0;
	if (novel.chaptersCount === undefined) novel.chaptersCount = 0;
	if (novel.wordCount === undefined) novel.wordCount = 0;
	if (novel.upvoteCount === undefined) novel.upvoteCount = 0;
	if (novel.downvoteCount === undefined) novel.downvoteCount = 0;

	// Ensure arrays are initialized
	if (!novel.tagIds) novel.tagIds = [];
	if (!novel.genreIds) novel.genreIds = [];
	if (!novel.source) novel.source = [];

	next();
});

// Instance methods
NovelSchema.methods = {
	// Calculate popularity score for Elasticsearch
	calculatePopularityScore(): number {
		const novel = this as any;
		return (novel.upvoteCount * 0.7) +
		       (novel.favoritesCount * 0.3) +
		       (novel.views * 0.1);
	},

	// Prepare novel data for Elasticsearch indexing
	toElasticsearchDocument(): any {
		const novel = this as any;
		const doc: any = {
			novelId: novel.novelId,
			uuid: novel.uuid,
			ownerUserId: novel.ownerUserId,
			title: novel.title,
			slug: novel.slug,
			description: novel.description || '',
			status: novel.status,
			language: novel.language,
			approvalStatus: novel.approvalStatus,
			coverImg: novel.coverImg || '',
			views: novel.views || 0,
			favoritesCount: novel.favoritesCount || 0,
			chaptersCount: novel.chaptersCount || 0,
			wordCount: novel.wordCount || 0,
			upvoteCount: novel.upvoteCount || 0,
			downvoteCount: novel.downvoteCount || 0,
			source: novel.source || [],
			tagIds: novel.tagIds || [],
			genreIds: novel.genreIds || [],
			createdAt: novel.createdAt,
			updatedAt: novel.updatedAt,
			popularityScore: this.calculatePopularityScore(),
			searchScore: 0 // Will be calculated during search if needed
		};

		// Handle chapter data - flatten for ES
		if (novel.firstChapter) {
			doc.firstChapterUuid = novel.firstChapter.uuid;
			doc.firstChapterTitle = novel.firstChapter.title;
			doc.firstChapterSequence = novel.firstChapter.sequence || 0;
		}

		if (novel.latestChapter) {
			doc.latestChapterUuid = novel.latestChapter.uuid;
			doc.latestChapterTitle = novel.latestChapter.title;
			doc.latestChapterSequence = novel.latestChapter.sequence || 0;
		}

		return doc;
	},

	// Check if novel needs re-indexing in Elasticsearch
	needsReindexing(lastIndexedAt: Date): boolean {
		const novel = this as any;
		return !lastIndexedAt || novel.updatedAt > lastIndexedAt;
	},

	// Get searchable content summary
	getSearchSummary(): string {
		const novel = this as any;
		return `${novel.title} ${novel.description}`.toLowerCase();
	}
};

// Static methods
NovelSchema.statics = {
	// Find novels by popularity (for fallback search)
	async findPopular(limit: number = 24, offset: number = 0) {
		return this.find({
			approvalStatus: { $nin: ['rejected', 'deleted'] }
		})
		.sort({ upvoteCount: -1, favoritesCount: -1, updatedAt: -1 })
		.skip(offset)
		.limit(limit)
		.lean();
	},

	// Find recent novels (for fallback search)
	async findRecent(limit: number = 24, offset: number = 0) {
		return this.find({
			approvalStatus: { $nin: ['rejected', 'deleted'] }
		})
		.sort({ updatedAt: -1 })
		.skip(offset)
		.limit(limit)
		.lean();
	},

	// Search with basic MongoDB text search (fallback)
	async searchFallback(params: any) {
		const { q, tagIds, genreIds, language, status, approvalStatus, source, from = 0, size = 24, sort = 'recent' } = params;

		const query: any = {};

		// Handle approval status filtering
		if (approvalStatus && approvalStatus !== 'all') {
			query.approvalStatus = approvalStatus;
		} else {
			query.approvalStatus = { $nin: ['rejected', 'deleted'] };
		}

		// Text search
		if (q) {
			query.$text = { $search: q };
		}

		// Array filters
		if (tagIds?.length) query.tagIds = { $in: tagIds };
		if (genreIds?.length) query.genreIds = { $in: genreIds };
		if (source?.length) query.source = { $in: source };

		// Simple filters
		if (language && language !== 'all') query.language = language;
		if (status && status !== 'all') query.status = status;

		// Sort options
		let sortObj: any = { updatedAt: -1 };
		if (sort === 'popular') {
			sortObj = { upvoteCount: -1, favoritesCount: -1, updatedAt: -1 };
		}

		// Execute search
		const [items, total] = await Promise.all([
			this.find(query)
				.sort(sortObj)
				.skip(from)
				.limit(size)
				.lean(),
			this.countDocuments(query)
		]);

		return { items, total, from, size };
	},

	// Get novels that need re-indexing
	async getNovelsNeedingReindex(lastIndexedAt: Date) {
		return this.find({
			updatedAt: { $gt: lastIndexedAt }
		}).lean();
	}
};

export const NovelModel = model('Novel', NovelSchema)

// Define interface for SearchTerm document
interface ISearchTerm extends Document {
	searchTerm: string
	searchCount: number
	lastSearchedAt: Date
	firstSearchedAt: Date
	filters: {
		tagIds: number[]
		genreIds: number[]
		language?: string
		status?: string
	}
	userId?: number
	sessionId?: string
	source: 'elasticsearch' | 'mongodb'
	incrementCount(): Promise<ISearchTerm>
}

// Define interface for SearchTerm model with static methods
interface ISearchTermModel {
	getPopularTerms(limit?: number): Promise<ISearchTerm[]>
	getRecentTerms(limit?: number): Promise<ISearchTerm[]>
	getSimilarTerms(prefix: string, limit?: number): Promise<ISearchTerm[]>
	trackSearchTerm(term: string, filters?: any, source?: string, userId?: number, sessionId?: string): Promise<ISearchTerm | null>
	cleanupOldTerms(keepDays?: number, minCount?: number): Promise<any>
}

const SearchTermSchema = new Schema<ISearchTerm>({
	searchTerm: { type: String, required: true, index: true },
	searchCount: { type: Number, default: 1 },
	lastSearchedAt: { type: Date, default: Date.now },
	firstSearchedAt: { type: Date, default: Date.now },
	// Track search parameters for better suggestions
	filters: {
		tagIds: { type: [Number], default: [] },
		genreIds: { type: [Number], default: [] },
		language: { type: String },
		status: { type: String }
	},
	// Track user information (optional)
	userId: { type: Number },
	sessionId: { type: String },
	// Track source (elasticsearch, mongodb)
	source: { type: String, enum: ['elasticsearch', 'mongodb'], default: 'elasticsearch' }
}, { timestamps: true, collection: 'search_terms' })

// Indexes for efficient queries
SearchTermSchema.index({ searchTerm: 1, searchCount: -1 })
SearchTermSchema.index({ lastSearchedAt: -1 })
SearchTermSchema.index({ firstSearchedAt: -1 })
SearchTermSchema.index({ searchCount: -1 })

// Instance methods
SearchTermSchema.methods.incrementCount = function() {
	this.searchCount += 1
	this.lastSearchedAt = new Date()
	return this.save()
}

// Static methods
SearchTermSchema.statics.getPopularTerms = async function(limit: number = 10) {
	return this.find({})
		.sort({ searchCount: -1, lastSearchedAt: -1 })
		.limit(limit)
		.lean()
}

SearchTermSchema.statics.getRecentTerms = async function(limit: number = 10) {
	return this.find({})
		.sort({ lastSearchedAt: -1 })
		.limit(limit)
		.lean()
}

SearchTermSchema.statics.getSimilarTerms = async function(prefix: string, limit: number = 10) {
	return this.find({
		searchTerm: { $regex: `^${prefix}`, $options: 'i' }
	})
	.sort({ searchCount: -1, lastSearchedAt: -1 })
	.limit(limit)
	.lean()
}

SearchTermSchema.statics.trackSearchTerm = async function(term: string, filters: any = {}, source: string = 'elasticsearch', userId?: number, sessionId?: string) {
	const normalizedTerm = term.trim().toLowerCase()
	if (!normalizedTerm) return null

	const existingTerm = await this.findOne({ searchTerm: normalizedTerm })

	if (existingTerm) {
		// Update existing term
		existingTerm.searchCount += 1
		existingTerm.lastSearchedAt = new Date()
		existingTerm.filters = { ...existingTerm.filters, ...filters }
		existingTerm.source = source
		if (userId) existingTerm.userId = userId
		if (sessionId) existingTerm.sessionId = sessionId
		return existingTerm.save()
	} else {
		// Create new term
		return this.create({
			searchTerm: normalizedTerm,
			filters,
			source,
			userId,
			sessionId
		})
	}
}

SearchTermSchema.statics.cleanupOldTerms = async function(keepDays: number = 30, minCount: number = 3) {
	const cutoffDate = new Date()
	cutoffDate.setDate(cutoffDate.getDate() - keepDays)

	return this.deleteMany({
		$and: [
			{ lastSearchedAt: { $lt: cutoffDate } },
			{ searchCount: { $lt: minCount } }
		]
	})
}

export const SearchTermModel = model<ISearchTerm>('SearchTerm', SearchTermSchema) as any 