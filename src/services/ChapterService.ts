import { ChapterModel } from '../infrastructure/models/Chapter.js'
import { getNextSequence } from '../infrastructure/models/Sequence.js'
import { randomUUID } from 'node:crypto'
import { NovelModel } from '../infrastructure/models/Novel.js'
import { ChapterListSearchService } from './ChapterListSearchService.js'
import { redisManager } from '../infrastructure/redis.js'
import { CacheService } from './CacheService.js'

export const ChapterService = {
	// Main method: Query directly by novelUuid for better efficiency with Redis caching
	async listChapters(novelUuid: string, from = 0, size = 50) {
		try {
			// Try to get from Redis cache first
			const cacheKey = `chapter-list:${novelUuid}:${from}:${size}`
			const cachedResult = await redisManager.get(cacheKey)

			if (cachedResult) {
				console.log(`✅ Chapter list for ${novelUuid} (from=${from}, size=${size}) loaded from Redis cache`)
				return cachedResult
			}

			console.log(`🔍 Chapter list for ${novelUuid} (from=${from}, size=${size}) not in cache, fetching from services`)

			// Use chapter-list single-doc for fastest listing
			const listResult = await ChapterListSearchService.listByNovel(novelUuid, from, size)
			if (listResult && listResult.items.length > 0) {
				console.log(`✅ ChapterListSearchService returned ${listResult.items.length} chapters`)

				// Cache the result for 30 minutes (1800 seconds) - shorter than novels since chapters change more frequently
				try {
					await redisManager.set(cacheKey, listResult, 1800)
					console.log(`💾 Chapter list for ${novelUuid} cached in Redis for 30 minutes`)
				} catch (cacheError) {
					console.warn(`⚠️ Failed to cache chapter list for ${novelUuid}:`, cacheError)
				}

				return listResult
			} else {
				console.log(`⚠️ ChapterListSearchService returned empty or no result:`, listResult)
			}
			
			// Fallback to MongoDB with offset-based pagination (reliable fallback)
			console.log(`🔄 Falling back to MongoDB...`)
			const startTime = Date.now()
			const timeout = 30000 // 30 seconds
			
			try {
				// Check if indexes exist
				const ChapterModel = (await import('../infrastructure/models/Chapter.js')).ChapterModel
				const indexes = await ChapterModel.collection.indexes()
				console.log('📊 Available indexes:', indexes.map((i: any) => i.name))
				
				// Execute query with timeout - query by novelUuid directly for efficiency
				const queryPromise = Promise.all([
					ChapterModel.find({ novelUuid, isPublished: true })
						.sort({ sequence: 1 })
						.skip(from)
						.limit(size)
						.lean()
						.maxTimeMS(timeout),
					ChapterModel.countDocuments({ novelUuid, isPublished: true })
						.maxTimeMS(timeout)
				])
				
				const [items, total] = await queryPromise
				const queryTime = Date.now() - startTime
				
				console.log(`✅ MongoDB query completed in ${queryTime}ms`)
				console.log(`✅ MongoDB returned ${items.length} chapters, total: ${total}`)

				// Prepare result
				const result = { items, total, from, size }

				// Log sample data to verify structure
				if (items.length > 0 && items[0]) {
					console.log('📋 Sample chapter data:', {
						first: {
							uuid: items[0].uuid,
							title: items[0].title,
							sequence: items[0].sequence,
							novelId: items[0].novelId,
							novelUuid: items[0].novelUuid
						}
					})
				}

				// Cache the MongoDB result for 30 minutes (1800 seconds)
				try {
					await redisManager.set(cacheKey, result, 1800)
					console.log(`💾 Chapter list for ${novelUuid} (MongoDB fallback) cached in Redis for 30 minutes`)
				} catch (cacheError) {
					console.warn(`⚠️ Failed to cache MongoDB fallback result for ${novelUuid}:`, cacheError)
				}

				return result
			} catch (queryError) {
				const queryTime = Date.now() - startTime
				console.error(`❌ MongoDB query failed after ${queryTime}ms:`, queryError)
				throw queryError
			}
		} catch (error) {
			console.error('❌ Chapter listing failed:', error)
			return { items: [], total: 0, from, size }
		}
	},

	// Get previous/next chapter neighbors efficiently using indexed queries
	async getChapterNeighbors(novelUuid: string, sequence: number) {
		try {
			const [prev, next] = await Promise.all([
				ChapterModel.findOne({ novelUuid, isPublished: true, sequence: { $lt: sequence } })
					.select('uuid title sequence')
					.sort({ sequence: -1 })
					.lean(),
				ChapterModel.findOne({ novelUuid, isPublished: true, sequence: { $gt: sequence } })
					.select('uuid title sequence')
					.sort({ sequence: 1 })
					.lean()
			])

			return {
				previous: prev ? { uuid: prev.uuid, title: prev.title, sequence: prev.sequence } : undefined,
				next: next ? { uuid: next.uuid, title: next.title, sequence: next.sequence } : undefined
			}
		} catch (error) {
			console.error('❌ Failed to fetch chapter neighbors:', error)
			return { previous: undefined, next: undefined }
		}
	},

	// Force rebuild Elasticsearch index for a specific novel (for troubleshooting)
	async forceRebuildNovelIndex(novelId: number) {
		try {
			const novel = await NovelModel.findOne({ novelId }).lean()
			if (!novel?.uuid) {
				console.error('❌ Novel not found for index rebuild')
				return false
			}
			
			console.log(`🔧 Force rebuilding index for novel: ${novel.uuid}`)
			await ChapterListSearchService.rebuildNovel(novel.uuid, novelId)
			console.log(`✅ Index rebuilt for novel: ${novel.uuid}`)
			return true
		} catch (error) {
			console.error('❌ Failed to rebuild index:', error)
			return false
		}
	},

	// Get chapter by UUID with Redis caching (1 hour cache time)
	async getChapterByUuid(uuid: string) {
		try {
			// Try to get from Redis cache first
			const cacheKey = `chapter:${uuid}`
			const cachedChapter = await redisManager.get(cacheKey)
			
			if (cachedChapter) {
				console.log(`✅ Chapter ${uuid} loaded from Redis cache`)
				return cachedChapter
			}
			
			// If not in cache, fetch from MongoDB
			console.log(`🔍 Chapter ${uuid} not in cache, fetching from MongoDB`)
			const chapter = await ChapterModel.findOne({ uuid }).lean()
			
			if (chapter) {
				// Cache the chapter for 1 hour (3600 seconds)
				try {
					await redisManager.set(cacheKey, chapter, 3600)
					console.log(`💾 Chapter ${uuid} cached in Redis for 1 hour`)
				} catch (cacheError) {
					console.warn(`⚠️ Failed to cache chapter ${uuid}:`, cacheError)
				}
				
				return chapter
			}
			
			return null
		} catch (error) {
			console.error(`❌ Error fetching chapter ${uuid}:`, error)
			// Fallback to direct MongoDB query if Redis fails
			try {
				return await ChapterModel.findOne({ uuid }).lean()
			} catch (fallbackError) {
				console.error(`❌ Fallback MongoDB query also failed for chapter ${uuid}:`, fallbackError)
				return null
			}
		}
	},

	// Fetch full chapter manifest for a novel and cache it
	async getChapterManifest(novelUuid: string) {
		try {
			const cacheKey = `chapter-manifest:${novelUuid}`
			const cached = await redisManager.get(cacheKey)
			if (cached) {
				console.log(`✅ Chapter manifest for ${novelUuid} loaded from Redis cache`)
				return cached
			}

			// Try ES single-doc manifest first
			const { chapters, total } = await ChapterListSearchService.getManifestByNovel(novelUuid)
			let payload: { items: any[]; total: number }
			if (chapters.length > 0) {
				payload = { items: chapters, total }
			} else {
				// Fallback to Mongo: fetch all published chapters
				const items = await ChapterModel.find({ novelUuid, isPublished: true })
					.select('uuid title sequence publishedAt wordCount isPublished')
					.sort({ sequence: 1 })
					.lean()
				payload = { items, total: items.length }
			}

			try {
				await redisManager.set(cacheKey, payload, 1800)
				console.log(`💾 Chapter manifest for ${novelUuid} cached in Redis for 30 minutes`)
			} catch (cacheError) {
				console.warn(`⚠️ Failed to cache chapter manifest for ${novelUuid}:`, cacheError)
			}

			return payload
		} catch (error) {
			console.error('❌ Chapter manifest fetch failed:', error)
			return { items: [], total: 0 }
		}
	},

	async createChapter(params: { novelId: number; novelUuid: string; title: string; content: string; sequence: number }) {
		const chapterId = await getNextSequence('chapterId')
		const uuid = randomUUID()
		
		const chapter = await ChapterModel.create({
			chapterId,
			uuid,
			novelId: params.novelId,
			novelUuid: params.novelUuid,
			title: params.title,
			content: params.content,
			sequence: params.sequence,
			wordCount: params.content.trim().split(/\s+/).length
		})
		
		// Invalidate chapter list cache for the novel
		try {
			await this.invalidateChapterListCache(params.novelUuid)
		} catch (cacheError) {
			console.warn(`⚠️ Failed to invalidate chapter list cache for novel ${params.novelUuid}:`, cacheError)
		}

		// Rebuild single-doc list
		await ChapterListSearchService.rebuildNovel(params.novelUuid, params.novelId)

		// Update novel's chapter info (firstChapter/latestChapter)
		try {
			const { NovelService } = await import('./NovelService.js')
			await NovelService.populateChapterInfo(params.novelId)
			console.log(`📝 Updated novel chapter info for novel ${params.novelId}`)
		} catch (error) {
			console.warn(`⚠️ Failed to update novel chapter info for novel ${params.novelId}:`, error)
		}

		// Cache the new chapter
		try {
			const cacheKey = `chapter:${uuid}`
			await redisManager.set(cacheKey, chapter, 3600)
			console.log(`💾 New chapter ${uuid} cached in Redis`)
		} catch (cacheError) {
			console.warn(`⚠️ Failed to cache new chapter ${uuid}:`, cacheError)
		}
		
		return chapter
	},

	async updateChapter(chapterId: number, patch: Partial<{ title: string; content: string; sequence: number; isPublished: boolean }>) {
		const updateData: any = { ...patch }
		if (patch.content) {
			updateData.wordCount = patch.content.trim().split(/\s+/).length
		}
		
		const updated = await ChapterModel.findOneAndUpdate(
			{ chapterId },
			{ $set: updateData },
			{ new: true }
		)
		
		// Invalidate chapter list cache for the novel
		if (updated?.novelUuid) {
			try {
				await this.invalidateChapterListCache(updated.novelUuid)
			} catch (cacheError) {
				console.warn(`⚠️ Failed to invalidate chapter list cache for novel ${updated.novelUuid}:`, cacheError)
			}
		}

		// Rebuild single-doc list
		if (updated?.novelUuid && updated?.novelId) {
			await ChapterListSearchService.rebuildNovel(updated.novelUuid, updated.novelId)
		}

		// Invalidate and recache the updated chapter
		if (updated?.uuid) {
			try {
				await CacheService.invalidateChapterCache(updated.uuid)
				// Recache the updated chapter
				const cacheKey = `chapter:${updated.uuid}`
				await redisManager.set(cacheKey, updated, 3600)
				console.log(`💾 Updated chapter ${updated.uuid} recached in Redis`)
			} catch (cacheError) {
				console.warn(`⚠️ Failed to recache updated chapter ${updated.uuid}:`, cacheError)
			}
		}
		
		return updated
	},

	async deleteChapter(chapterId: number) {
		const chapter = await ChapterModel.findOne({ chapterId }).lean()
		await ChapterModel.deleteOne({ chapterId })
		
		// Invalidate chapter cache
		if (chapter?.uuid) {
			try {
				await CacheService.invalidateChapterCache(chapter.uuid)
				console.log(`🗑️ Deleted chapter ${chapter.uuid} cache invalidated`)
			} catch (cacheError) {
				console.warn(`⚠️ Failed to invalidate deleted chapter cache ${chapter.uuid}:`, cacheError)
			}
		}

		// Invalidate chapter list cache for the novel
		if (chapter?.novelUuid) {
			try {
				await this.invalidateChapterListCache(chapter.novelUuid)
			} catch (cacheError) {
				console.warn(`⚠️ Failed to invalidate chapter list cache for novel ${chapter.novelUuid}:`, cacheError)
			}
		}

		// Rebuild single-doc list
		if (chapter?.novelUuid && chapter?.novelId) {
			await ChapterListSearchService.rebuildNovel(chapter.novelUuid, chapter.novelId)
		}
		
		return { success: true }
	},

	async reorderChapter(chapterId: number, direction: 'up' | 'down') {
		const chapter = await ChapterModel.findOne({ chapterId }).lean()
		if (!chapter) return { success: false, message: 'Chapter not found' }
		
		const { novelId, sequence, novelUuid } = chapter
		
		if (direction === 'up' && sequence > 1) {
			// Swap with previous chapter
			const prevChapter = await ChapterModel.findOne({ novelId, sequence: sequence - 1 })
			if (prevChapter) {
				await ChapterModel.updateOne({ chapterId: prevChapter.chapterId }, { $set: { sequence } })
				await ChapterModel.updateOne({ chapterId }, { $set: { sequence: sequence - 1 } })
				
				// Invalidate both chapters' caches
				try {
					await CacheService.invalidateChapterCache(prevChapter.uuid)
					await CacheService.invalidateChapterCache(chapter.uuid)
					console.log(`🗑️ Reordered chapters cache invalidated: ${prevChapter.uuid}, ${chapter.uuid}`)
				} catch (cacheError) {
					console.warn(`⚠️ Failed to invalidate reordered chapters cache:`, cacheError)
				}
			}
		} else if (direction === 'down') {
			// Swap with next chapter
			const nextChapter = await ChapterModel.findOne({ novelId, sequence: sequence + 1 })
			if (nextChapter) {
				await ChapterModel.updateOne({ chapterId: nextChapter.chapterId }, { $set: { sequence } })
				await ChapterModel.updateOne({ chapterId }, { $set: { sequence: sequence + 1 } })
				
				// Invalidate both chapters' caches
				try {
					await CacheService.invalidateChapterCache(nextChapter.uuid)
					await CacheService.invalidateChapterCache(chapter.uuid)
					console.log(`🗑️ Reordered chapters cache invalidated: ${nextChapter.uuid}, ${chapter.uuid}`)
				} catch (cacheError) {
					console.warn(`⚠️ Failed to invalidate reordered chapters cache:`, cacheError)
				}
			}
		}
		
		// Invalidate chapter list cache for the novel
		if (novelUuid) {
			try {
				await this.invalidateChapterListCache(novelUuid)
			} catch (cacheError) {
				console.warn(`⚠️ Failed to invalidate chapter list cache for novel ${novelUuid}:`, cacheError)
			}
		}

		// Rebuild single-doc list
		if (novelUuid) {
			await ChapterListSearchService.rebuildNovel(novelUuid, novelId)
		}

		return { success: true }
	},

	// Invalidate chapter list cache for a specific novel (useful when chapters are added/updated/deleted)
	async invalidateChapterListCache(novelUuid: string): Promise<boolean> {
		try {
			// Since chapter lists have pagination, we need to delete all cache keys that start with the novel UUID
			// We'll use a pattern to find and delete all related cache keys
			const pattern = `chapter-list:${novelUuid}:*`
			const keys = await CacheService.getCacheKeys(pattern)

			if (keys.length > 0) {
				let deleted = 0
				for (const key of keys) {
					try {
						const deletedKey = await CacheService.deleteCache(key)
						if (deletedKey) deleted++
					} catch (cacheError) {
						console.warn(`⚠️ Failed to delete cache key ${key}:`, cacheError)
					}
				}
				console.log(`🗑️ Chapter list cache invalidated for novel ${novelUuid}: ${deleted}/${keys.length} keys deleted`)
				return deleted > 0
			}

			console.log(`ℹ️ No chapter list cache found for novel ${novelUuid}`)
			return false
		} catch (error) {
			console.error(`❌ Failed to invalidate chapter list cache for novel ${novelUuid}:`, error)
			return false
		}
	},

	// Warm up chapter list cache for frequently accessed novels
	async warmupChapterListCache(novelUuids: string[], from = 0, size = 50): Promise<number> {
		try {
			console.log(`🔥 Warming up chapter list cache for ${novelUuids.length} novels`)

			let cached = 0
			for (const novelUuid of novelUuids) {
				try {
					// This will fetch from services and cache the result
					const result = await this.listChapters(novelUuid, from, size)
					if (result && result.items) {
						cached++
					}
				} catch (cacheError) {
					console.warn(`⚠️ Failed to cache chapter list for novel ${novelUuid}:`, cacheError)
				}
			}

			console.log(`✅ Chapter list cache warmed up: ${cached}/${novelUuids.length} novels cached`)
			return cached
		} catch (error) {
			console.error(`❌ Failed to warm up chapter list cache:`, error)
			return 0
		}
	}
} 