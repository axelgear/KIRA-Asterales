#!/usr/bin/env node

/**
 * Fix Novel Stats (Word Count & Chapter Count)
 * 
 * This script fixes word counts and chapter counts for novels that have
 * incorrect data from the old database or migration issues.
 */

import mongoose from 'mongoose'
import { NovelModel } from '../../infrastructure/models/Novel.js'
import { ChapterModel } from '../../infrastructure/models/Chapter.js'
import { NovelSearchService } from '../../services/NovelSearchService.js'
import { redisManager } from '../../infrastructure/redis.js'

async function fixNovelStats(batchSize: number = 50): Promise<{
	total: number
	updated: number
	failed: number
}> {
	try {
		console.log('🔢 Fixing novel word counts and chapter counts...')
		
		const novels = await NovelModel.find({})
			.select('novelId slug title wordCount chaptersCount')
			.lean()

		const total = novels.length
		let updated = 0
		let failed = 0

		console.log(`📊 Found ${total} novels to fix`)

		/* Process in batches */
		for (let i = 0; i < novels.length; i += batchSize) {
			const batch = novels.slice(i, i + batchSize)
			
			await Promise.all(
				batch.map(async (novel) => {
					try {
						console.log(`🔍 Fixing novel ${novel.novelId}: ${novel.title}`)
						
						/* Count actual chapters */
						const actualChapterCount = await ChapterModel.countDocuments({
							novelId: novel.novelId,
							isPublished: true
						})
						
						/* Calculate total word count from chapters */
						const chapters = await ChapterModel.find({ 
							novelId: novel.novelId, 
							isPublished: true 
						})
							.select('wordCount')
							.lean()

						const totalWordCount = chapters.reduce((sum, chapter) => {
							return sum + (chapter.wordCount || 0)
						}, 0)
						
						/* Check if update is needed */
						const needsUpdate = 
							novel.wordCount !== totalWordCount || 
							novel.chaptersCount !== actualChapterCount
						
						if (!needsUpdate) {
							console.log(`⏭️  Novel ${novel.novelId} already correct (chapters: ${actualChapterCount}, words: ${totalWordCount})`)
							updated++
							return
						}
						
						/* Update novel */
						const mongoUpdated = await NovelModel.findOneAndUpdate(
							{ novelId: novel.novelId },
							{ 
								$set: { 
									wordCount: totalWordCount,
									chaptersCount: actualChapterCount
								} 
							},
							{ new: true }
						)

						if (mongoUpdated) {
							console.log(`✅ Novel ${novel.novelId} fixed: chapters ${novel.chaptersCount}→${actualChapterCount}, words ${novel.wordCount}→${totalWordCount}`)
							
							/* Re-index in Elasticsearch */
							try {
								await NovelSearchService.indexNovel(mongoUpdated)
							} catch (indexError) {
								console.warn(`⚠️  Failed to re-index novel ${novel.novelId}:`, indexError)
							}

							/* Invalidate Redis cache */
							try {
								const cacheKey = `novel:${novel.slug}`
								await redisManager.delete(cacheKey)
							} catch (cacheError) {
								console.warn(`⚠️  Failed to invalidate cache for novel ${novel.novelId}:`, cacheError)
							}

							updated++
						} else {
							failed++
						}
					} catch (error) {
						console.error(`❌ Failed to fix novel ${novel.novelId}:`, error)
						failed++
					}
				})
			)

			const progress = ((i + batch.length) / total * 100).toFixed(1)
			console.log(`📈 Progress: ${progress}% (${i + batch.length}/${total})`)
		}

		console.log(`✅ Fix completed: ${updated} updated, ${failed} failed`)
		
		return { total, updated, failed }
	} catch (error) {
		console.error('❌ Failed to fix novel stats:', error)
		throw error
	}
}

async function main() {
	try {
		console.log('🔧 Novel Stats Fixer')
		console.log('=' .repeat(60))
		console.log('This will fix:')
		console.log('  - Word counts (sum of all chapter word counts)')
		console.log('  - Chapter counts (actual published chapter count)')
		console.log('=' .repeat(60))
		
		/* Connect to MongoDB via Mongoose */
		const mongoUri = process.env.MONGO_URI || `mongodb://${process.env.MONGODB_USERNAME || ''}:${process.env.MONGODB_PASSWORD || ''}@${process.env.MONGODB_CLUSTER_HOST || ''}`
		const mongoDatabase = process.env.MONGO_DATABASE || process.env.MONGODB_NAME || 'kira_asterales'
		
		await mongoose.connect(`${mongoUri}/${mongoDatabase}`)
		console.log('✅ Connected to MongoDB via Mongoose')
		
		/* Fix all novel stats */
		const batchSize = parseInt(process.env.BATCH_SIZE || '50')
		console.log(`\n📊 Processing in batches of ${batchSize}...\n`)
		
		const result = await fixNovelStats(batchSize)
		
		console.log('\n' + '='.repeat(60))
		console.log('✅ Novel stats fix completed!')
		console.log(`📊 Results:`)
		console.log(`   Total novels: ${result.total}`)
		console.log(`   Successfully fixed: ${result.updated}`)
		console.log(`   Failed: ${result.failed}`)
		console.log('='.repeat(60))
		
		/* Disconnect */
		await mongoose.disconnect()
		console.log('✅ MongoDB connection closed')
		
		process.exit(0)
	} catch (error) {
		console.error('\n💥 Stats fix failed:', error)
		try {
			await mongoose.disconnect()
		} catch {}
		process.exit(1)
	}
}

/* Run if executed directly */
if (import.meta.url === `file://${process.argv[1]}`) {
	main()
}

