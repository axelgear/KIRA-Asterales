import { randomUUID } from 'node:crypto'
import { NovelModel } from '../infrastructure/models/Novel.js'
import { ChapterModel } from '../infrastructure/models/Chapter.js'
import { BrowsingHistoryModel } from '../infrastructure/models/BrowsingHistory.js'
import { FeedModel } from '../infrastructure/models/Feed.js'
import { NovelCommentModel } from '../infrastructure/models/NovelComment.js'
import { getNextSequence } from '../infrastructure/models/Sequence.js'
import { NovelSearchService } from './NovelSearchService.js'
import { ChapterListSearchService } from './ChapterListSearchService.js'
import { redisManager } from '../infrastructure/redis.js'

export const NovelService = {
	// Get novel by slug with Redis caching (1 hour cache time)
	async getNovelBySlug(slug: string) {
		try {
			// Try to get from Redis cache first
			const cacheKey = `novel:${slug}`
			const cachedNovel = await redisManager.get(cacheKey)
			
			if (cachedNovel) {
				console.log(`✅ Novel ${slug} loaded from Redis cache`)
				return cachedNovel
			}
			
			// If not in cache, try Elasticsearch first (faster than MongoDB)
			console.log(`🔍 Novel ${slug} not in cache, trying Elasticsearch`)
			try {
				const esNovel = await NovelSearchService.getNovelBySlug(slug)
				if (esNovel) {
					// Cache the novel for 1 hour (3600 seconds)
					try {
						await redisManager.set(cacheKey, esNovel, 3600)
						console.log(`💾 Novel ${slug} cached in Redis for 1 hour`)
					} catch (cacheError) {
						console.warn(`⚠️ Failed to cache novel ${slug}:`, cacheError)
					}
					
					return esNovel
				}
			} catch (esError) {
				console.warn(`⚠️ Elasticsearch lookup failed for novel ${slug}:`, esError)
			}
			
			// Fallback to MongoDB
			console.log(`🔄 Falling back to MongoDB for novel ${slug}`)
			const novel = await NovelModel.findOne({ slug }).lean()
			
			if (novel) {
				// Cache the novel for 1 hour (3600 seconds)
				try {
					await redisManager.set(cacheKey, novel, 3600)
					console.log(`💾 Novel ${slug} cached in Redis for 1 hour`)
				} catch (cacheError) {
					console.warn(`⚠️ Failed to cache novel ${slug}:`, cacheError)
				}
				
				// Index in Elasticsearch for future faster lookups
				try {
					await NovelSearchService.indexNovel(novel)
					console.log(`📝 Novel ${slug} indexed in Elasticsearch`)
				} catch (indexError) {
					console.warn(`⚠️ Failed to index novel ${slug} in Elasticsearch:`, indexError)
				}
				
				return novel
			}
			
			return null
		} catch (error) {
			console.error(`❌ Error fetching novel ${slug}:`, error)
			// Fallback to direct MongoDB query if everything else fails
			try {
				return await NovelModel.findOne({ slug }).lean()
			} catch (fallbackError) {
				console.error(`❌ Fallback MongoDB query also failed for novel ${slug}:`, fallbackError)
				return null
			}
		}
	},

	// Legacy method - kept for backward compatibility
	async getNovel(slug: string) {
		return await this.getNovelBySlug(slug)
	},

	async createNovel(params: { ownerUserId: number; title: string; slug: string; description?: string; tags?: string[]; genres?: string[]; language?: string; coverUrl?: string }) {
		const novelId = await getNextSequence('novelId')
		const uuid = randomUUID()
		const novel = await NovelModel.create({
			novelId,
			uuid,
			ownerUserId: params.ownerUserId,
			title: params.title,
			slug: params.slug,
			description: params.description || '',
			tags: params.tags || [],
			genres: params.genres || [],
			language: params.language || 'en',
			coverUrl: params.coverUrl || ''
		})
		await NovelSearchService.indexNovel(novel)
		// Cache the new novel
		try {
			const cacheKey = `novel:${novel.slug}`
			await redisManager.set(cacheKey, novel, 3600)
			console.log(`💾 New novel ${novel.slug} cached in Redis`)
		} catch (cacheError) {
			console.warn(`⚠️ Failed to cache new novel ${novel.slug}:`, cacheError)
		}
		await FeedModel.create({ feedId: await getNextSequence('feedId'), action: 'create_novel', userId: params.ownerUserId, novelId: novel.novelId, payload: { title: novel.title } })
		return novel
	},
	async updateNovel(novelId: number, patch: Partial<{ title: string; slug: string; description: string; tagIds: number[]; genreIds: number[]; status: string; language: string; coverImg: string; approvalStatus: string }>) {
		const updated = await NovelModel.findOneAndUpdate({ novelId }, { $set: { ...patch } }, { new: true })
		if (updated) {
			await NovelSearchService.indexNovel(updated)
			// Invalidate cache for both old and new slug if slug changed
			if (patch.slug && updated.slug !== patch.slug) {
				await this.invalidateNovelCache(updated.slug)
			}
			await this.invalidateNovelCache(updated.slug)
		}
		return updated
	},
	async deleteNovel(novelId: number) {
		// Delete dependent records first (cascading delete)
		const novel = await NovelModel.findOne({ novelId }).lean()
		await ChapterModel.deleteMany({ novelId })
		
		// Clear favorites using FavoriteService
		try {
			const { FavoriteService } = await import('./FavoriteService.js');
			await FavoriteService.clearNovelFavorites(novelId);
		} catch (error) {
			console.warn('⚠️ Failed to clear novel favorites:', error);
		}
		
		await BrowsingHistoryModel.deleteMany({ novelId })
		await NovelCommentModel.deleteMany({ novelId })
		await FeedModel.deleteMany({ novelId })
		// Delete ES chapter docs
		if (novel?.uuid) await ChapterListSearchService.deleteByNovel(novel.uuid)
		// Invalidate novel cache
		if (novel?.slug) {
			try {
				await this.invalidateNovelCache(novel.slug)
				console.log(`🗑️ Deleted novel ${novel.slug} cache invalidated`)
			} catch (cacheError) {
				console.warn(`⚠️ Failed to invalidate deleted novel cache ${novel.slug}:`, cacheError)
			}
		}
		// Delete novel
		await NovelModel.deleteOne({ novelId })
		await NovelSearchService.deleteNovel(novelId)
		return { success: true }
	},
	async upsertHistory(userId: number, novelId: number, chapterId: number, progress?: number) {
		await BrowsingHistoryModel.updateOne({ userId, novelId }, { $set: { chapterId, lastReadAt: new Date(), ...(typeof progress === 'number' ? { progress } : {}) } }, { upsert: true })
		return { success: true }
	},
	async addComment(userId: number, novelId: number, content: string, replyToCommentId?: number) {
		const commentId = await getNextSequence('commentId')
		// Build threading fields
		let parentCommentId: number | null = null
		let rootCommentId: number | null = null
		let path = ''
		let depth = 0
		if (replyToCommentId != null) {
			const parent = await NovelCommentModel.findOne({ commentId: replyToCommentId, novelId }).lean()
			if (parent) {
				parentCommentId = parent.commentId
				rootCommentId = parent.rootCommentId ?? parent.commentId
				depth = (parent.depth ?? 0) + 1
				const segment = String(commentId).padStart(8, '0')
				path = parent.path ? `${parent.path}/${segment}` : segment
			} else {
				// Parent not found; treat as top-level
				rootCommentId = commentId
				path = String(commentId).padStart(8, '0')
			}
		} else {
			rootCommentId = commentId
			path = String(commentId).padStart(8, '0')
		}
		const doc = await NovelCommentModel.create({ commentId, userId, novelId, content, parentCommentId, rootCommentId, path, depth })
		await FeedModel.create({ feedId: await getNextSequence('feedId'), action: 'comment', userId, novelId, payload: { commentId } })
		return doc
	},
	async likeNovel(novelId: number, delta: 1 | -1) {
		const novel = await NovelModel.findOneAndUpdate({ novelId }, { $inc: delta === 1 ? { upvoteCount: 1 } : { downvoteCount: 1 } }, { new: true })
		if (novel) {
			await NovelSearchService.indexNovel(novel)
			await this.invalidateNovelCache(novel.slug)
		}
		return { success: true }
	},
	async likeComment(commentId: number, delta: 1 | -1) {
		await NovelCommentModel.updateOne({ commentId }, { $inc: delta === 1 ? { upvoteCount: 1 } : { downvoteCount: 1 } })
		return { success: true }
	},
	async search(params: Parameters<typeof NovelSearchService.search>[0]) {
		await NovelSearchService.ensureIndex()
		return await NovelSearchService.search(params)
	},
	// Comment moderation methods
	async listComments(params: { novelId?: number; page?: number; pageSize?: number; includeDeleted?: boolean }) {
		const { novelId, page = 1, pageSize = 50, includeDeleted = false } = params
		const skip = (page - 1) * pageSize
		
		const query: any = {}
		if (novelId) query.novelId = novelId
		if (!includeDeleted) query.isDeleted = false
		
		const [items, total] = await Promise.all([
			NovelCommentModel.find(query)
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(pageSize)
				.lean(),
			NovelCommentModel.countDocuments(query)
		])
		
		return { items, total, page, pageSize }
	},
	async deleteComment(commentId: number) {
		const result = await NovelCommentModel.updateOne(
			{ commentId },
			{ $set: { isDeleted: true } }
		)
		return { success: result.modifiedCount > 0 }
	},
	async restoreComment(commentId: number) {
		const result = await NovelCommentModel.updateOne(
			{ commentId },
			{ $set: { isDeleted: false } }
		)
		return { success: result.modifiedCount > 0 }
	},
	async getComment(commentId: number) {
		return await NovelCommentModel.findOne({ commentId }).lean()
	},

	// Populate firstChapter and latestChapter for a novel
	async populateChapterInfo(novelId: number): Promise<boolean> {
		try {
			console.log(`🔍 Populating chapter info for novel ${novelId}`)
			
			// Get first and latest published chapters
			const [firstChapter, latestChapter] = await Promise.all([
				ChapterModel.findOne({ novelId, isPublished: true })
					.sort({ sequence: 1 })
					.select('uuid title sequence')
					.lean(),
				ChapterModel.findOne({ novelId, isPublished: true })
					.sort({ sequence: -1 })
					.select('uuid title sequence')
					.lean()
			])
			
			// Prepare chapter data
			const firstChapterData = firstChapter ? {
				uuid: firstChapter.uuid,
				title: firstChapter.title,
				sequence: firstChapter.sequence
			} : null
			
			const latestChapterData = latestChapter ? {
				uuid: latestChapter.uuid,
				title: latestChapter.title,
				sequence: latestChapter.sequence
			} : null
			
			// Update novel with chapter info
			const updated = await NovelModel.findOneAndUpdate(
				{ novelId },
				{ 
					$set: { 
						firstChapter: firstChapterData,
						latestChapter: latestChapterData
					} 
				},
				{ new: true }
			)
			
			if (updated) {
				// Re-index in Elasticsearch
				await NovelSearchService.indexNovel(updated)
				// Invalidate cache
				await this.invalidateNovelCache(updated.slug)
				console.log(`✅ Chapter info populated for novel ${novelId}`)
				return true
			}
			
			return false
		} catch (error) {
			console.error(`❌ Failed to populate chapter info for novel ${novelId}:`, error)
			return false
		}
	},

	// Populate chapter info for all novels (useful for migration)
	async populateAllNovelsChapterInfo(): Promise<{ total: number; updated: number; failed: number }> {
		try {
			console.log('🔍 Populating chapter info for all novels...')
			
			const novels = await NovelModel.find({}).select('novelId slug').lean()
			let updated = 0
			let failed = 0
			
			for (const novel of novels) {
				try {
					const success = await this.populateChapterInfo(novel.novelId)
					if (success) {
						updated++
					} else {
						failed++
					}
				} catch (error) {
					console.error(`❌ Failed to populate novel ${novel.slug}:`, error)
					failed++
				}
			}
			
			console.log(`✅ Chapter info population completed: ${updated} updated, ${failed} failed`)
			return { total: novels.length, updated, failed }
		} catch (error) {
			console.error('❌ Failed to populate all novels chapter info:', error)
			return { total: 0, updated: 0, failed: 0 }
		}
	},

	// Invalidate novel cache (useful when novel is updated/deleted)
	async invalidateNovelCache(slug: string): Promise<boolean> {
		try {
			const cacheKey = `novel:${slug}`
			const deleted = await redisManager.delete(cacheKey)
			if (deleted) {
				console.log(`🗑️ Novel cache invalidated for ${slug}`)
			}
			return deleted
		} catch (error) {
			console.error(`❌ Failed to invalidate novel cache for ${slug}:`, error)
			return false
		}
	},

	// Warm up novel cache for frequently accessed novels
	async warmupNovelCache(slugs: string[]): Promise<number> {
		try {
			console.log(`🔥 Warming up novel cache for ${slugs.length} novels`)
			
			let cached = 0
			for (const slug of slugs) {
				try {
					// This will fetch from MongoDB/Elasticsearch and cache
					const novel = await this.getNovelBySlug(slug)
					if (novel) {
						cached++
					}
				} catch (cacheError) {
					console.warn(`⚠️ Failed to cache novel ${slug}:`, cacheError)
				}
			}
			
			console.log(`✅ Novel cache warmed up: ${cached}/${slugs.length} novels cached`)
			return cached
		} catch (error) {
			console.error(`❌ Failed to warm up novel cache:`, error)
			return 0
		}
	}
} 