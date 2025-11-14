/**
 * Novel Word Count Service
 * Handles calculation and updating of novel total word counts
 */

import { NovelModel } from '../infrastructure/models/Novel.js'
import { ChapterModel } from '../infrastructure/models/Chapter.js'
import { NovelSearchService } from './NovelSearchService.js'
import { redisManager } from '../infrastructure/redis.js'

export const NovelWordCountService = {
	/**
	 * Calculate total word count for a novel based on all its chapters
	 */
	async calculateNovelWordCount(novelId: number): Promise<number> {
		try {
			const chapters = await ChapterModel.find({ 
				novelId, 
				isPublished: true 
			})
			.select('wordCount')
			.lean()

			const totalWordCount = chapters.reduce((sum, chapter) => {
				return sum + (chapter.wordCount || 0)
			}, 0)

			return totalWordCount
		} catch (error) {
			console.error(`❌ Failed to calculate word count for novel ${novelId}:`, error)
			return 0
		}
	},

	/**
	 * Update the stored word count for a novel
	 */
	async updateNovelWordCount(novelId: number): Promise<boolean> {
		try {
			console.log(`🔢 Calculating word count for novel ${novelId}...`)
			
			const totalWordCount = await this.calculateNovelWordCount(novelId)
			
			const updated = await NovelModel.findOneAndUpdate(
				{ novelId },
				{ $set: { wordCount: totalWordCount } },
				{ new: true }
			)

			if (updated) {
				console.log(`✅ Novel ${novelId} word count updated to ${totalWordCount}`)
				
				/* Re-index in Elasticsearch */
				try {
					await NovelSearchService.indexNovel(updated)
				} catch (indexError) {
					console.warn(`⚠️ Failed to re-index novel ${novelId}:`, indexError)
				}

				/* Invalidate Redis cache */
				try {
					const cacheKey = `novel:${updated.slug}`
					await redisManager.delete(cacheKey)
				} catch (cacheError) {
					console.warn(`⚠️ Failed to invalidate cache for novel ${novelId}:`, cacheError)
				}

				return true
			}

			return false
		} catch (error) {
			console.error(`❌ Failed to update word count for novel ${novelId}:`, error)
			return false
		}
	},

	/**
	 * Update word counts for all novels
	 * Useful after migration or bulk updates
	 */
	async updateAllNovelWordCounts(batchSize: number = 50): Promise<{
		total: number
		updated: number
		failed: number
	}> {
		try {
			console.log('🔢 Updating word counts for all novels...')
			
			const novels = await NovelModel.find({})
				.select('novelId title')
				.lean()

			const total = novels.length
			let updated = 0
			let failed = 0

			console.log(`📊 Found ${total} novels to update`)

			/* Process in batches */
			for (let i = 0; i < novels.length; i += batchSize) {
				const batch = novels.slice(i, i + batchSize)
				
				await Promise.all(
					batch.map(async (novel) => {
						try {
							const success = await this.updateNovelWordCount(novel.novelId)
							if (success) {
								updated++
							} else {
								failed++
							}
						} catch (error) {
							console.error(`❌ Failed to update novel ${novel.novelId}:`, error)
							failed++
						}
					})
				)

				const progress = ((i + batch.length) / total * 100).toFixed(1)
				console.log(`📈 Progress: ${progress}% (${i + batch.length}/${total})`)
			}

			console.log(`✅ Word count update completed: ${updated} updated, ${failed} failed`)
			
			return { total, updated, failed }
		} catch (error) {
			console.error('❌ Failed to update all novel word counts:', error)
			throw error
		}
	},

	/**
	 * Recalculate word count for a novel when a chapter is added/updated/deleted
	 * This should be called after chapter operations
	 */
	async recalculateAfterChapterChange(novelId: number): Promise<void> {
		try {
			await this.updateNovelWordCount(novelId)
		} catch (error) {
			console.error(`❌ Failed to recalculate word count for novel ${novelId}:`, error)
		}
	}
}

