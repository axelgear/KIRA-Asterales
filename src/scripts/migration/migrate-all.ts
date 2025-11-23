#!/usr/bin/env node

/**
 * Comprehensive Migration Runner
 * 
 * Orchestrates migration of all data from PostgreSQL to MongoDB:
 * 1. Novels and chapters (if not already done)
 * 2. Users
 * 3. Ratings → Favorites
 * 4. Bookmarks → Favorites
 * 5. Comments
 * 6. Update word counts for existing novels
 */

import 'dotenv/config'
import { NovelMigrator } from './migrator.js'
import { TaxonomyMigrator } from './taxonomy-migrator.js'
import { UserDataMigrator } from './user-data-migrator.js'
import { ReadingListMigrator } from './reading-list-migrator.js'
import type { MigrationConfig, DatabaseConfig } from './types.js'
import { MongoClient } from 'mongodb'

/* Default configuration */
const defaultConfig: MigrationConfig = {
	batchSize: parseInt(process.env.MIGRATION_BATCH_SIZE || '50'),
	maxNovels: parseInt(process.env.MIGRATION_MAX_NOVELS || '0'),
	skipExisting: process.env.MIGRATION_SKIP_EXISTING === 'true',
	dryRun: process.env.MIGRATION_DRY_RUN === 'true',
	validateData: process.env.MIGRATION_VALIDATE_DATA === 'true',
	createIndexes: process.env.MIGRATION_CREATE_INDEXES === 'true',
	elasticsearchIndex: process.env.ES_ENABLED === 'true',
	skipTaxonomy: process.env.MIGRATION_SKIP_TAXONOMY === 'true',
	rebuildIndicesAfterMigration: process.env.MIGRATION_REBUILD_INDICES === 'true'
}

/* Database configuration */
const dbConfig: DatabaseConfig = {
	postgres: {
		host: process.env.PG_HOST || '',
		port: parseInt(process.env.PG_PORT || '5432'),
		database: process.env.PG_DATABASE || '',
		username: process.env.PG_USERNAME || '',
		password: process.env.PG_PASSWORD || '',
		ssl: process.env.PG_SSL === 'true',
		schema: process.env.PG_SCHEMA || 'public'
	},
	mongodb: {
		uri: process.env.MONGO_URI || `mongodb://${process.env.MONGODB_USERNAME || ''}:${process.env.MONGODB_PASSWORD || ''}@${process.env.MONGODB_CLUSTER_HOST || ''}`,
		database: process.env.MONGO_DATABASE || process.env.MONGODB_NAME || ''
	},
	elasticsearch: {
		enabled: process.env.ES_ENABLED === 'true',
		nodes: (process.env.ES_NODES || process.env.ELASTICSEARCH_CLUSTER_HOST || '').split(','),
		auth: {
			username: process.env.ES_USERNAME || process.env.ELASTICSEARCH_ADMIN_USERNAME || '',
			password: process.env.ES_PASSWORD || process.env.ELASTICSEARCH_ADMIN_PASSWORD || ''
		}
	}
}

/**
 * Fix novel stats (word count and chapter count) using native MongoDB connection
 */
async function fixNovelStats(mongoDb: any): Promise<{
	total: number
	updated: number
	failed: number
}> {
	try {
		console.log('🔍 Checking novels for incorrect stats...')
		
		const novels = await mongoDb.collection('novels')
			.find({})
			.project({ novelId: 1, slug: 1, title: 1, wordCount: 1, chaptersCount: 1 })
			.toArray()

		const total = novels.length
		let updated = 0
		let failed = 0

		console.log(`📊 Found ${total} novels to check`)

		/* Process in batches */
		const batchSize = 50
		for (let i = 0; i < novels.length; i += batchSize) {
			const batch = novels.slice(i, i + batchSize)
			
			await Promise.all(
				batch.map(async (novel: any) => {
					try {
						/* Count actual chapters */
						const actualChapterCount = await mongoDb.collection('chapters').countDocuments({
							novelId: novel.novelId,
							isPublished: true
						})
						
						/* Calculate total word count from chapters */
						const chapters = await mongoDb.collection('chapters')
							.find({ novelId: novel.novelId, isPublished: true })
							.project({ wordCount: 1 })
							.toArray()

						const totalWordCount = chapters.reduce((sum: number, chapter: any) => {
							return sum + (chapter.wordCount || 0)
						}, 0)
						
						/* Check if update is needed */
						const needsUpdate = 
							novel.wordCount !== totalWordCount || 
							novel.chaptersCount !== actualChapterCount
						
						if (!needsUpdate) {
							updated++
							return
						}
						
						/* Update novel */
						const result = await mongoDb.collection('novels').updateOne(
							{ novelId: novel.novelId },
							{ 
								$set: { 
									wordCount: totalWordCount,
									chaptersCount: actualChapterCount,
									updatedAt: new Date()
								} 
							}
						)

						if (result.modifiedCount > 0) {
							console.log(`✅ Novel ${novel.novelId} fixed: chapters ${novel.chaptersCount}→${actualChapterCount}, words ${novel.wordCount}→${totalWordCount}`)
							updated++
						} else {
							updated++
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

		console.log(`✅ Stats fix completed: ${updated} processed, ${failed} failed`)
		
		return { total, updated, failed }
	} catch (error) {
		console.error('❌ Failed to fix novel stats:', error)
		throw error
	}
}

async function main() {
	const startTime = Date.now()
	
	try {
		console.log('🚀 Comprehensive Migration Tool')
		console.log('='.repeat(70))
		console.log('This will migrate all data from PostgreSQL to MongoDB:')
		console.log('  1. Taxonomy (tags & genres)')
		console.log('  2. Novels & chapters')
		console.log('  3. Users')
		console.log('  4. Ratings → Favorites')
		console.log('  5. Bookmarks → Favorites')
		console.log('  6. Comments')
		console.log('  7. Reading Lists')
		console.log('  8. Update word counts for existing novels')
		console.log('='.repeat(70))

		const migrateNovels = process.env.MIGRATE_NOVELS !== 'false'
		const migrateUsers = process.env.MIGRATE_USERS !== 'false'
		const migrateRatings = process.env.MIGRATE_RATINGS !== 'false'
		const migrateBookmarks = process.env.MIGRATE_BOOKMARKS !== 'false'
		const migrateComments = process.env.MIGRATE_COMMENTS !== 'false'
		const migrateReadingLists = process.env.MIGRATE_READING_LISTS !== 'false'
		const updateWordCounts = process.env.UPDATE_WORDCOUNTS !== 'false'

		console.log('\n⚙️  Migration flags:')
		console.log(`   Novels & Chapters: ${migrateNovels ? '✅' : '⏭️  SKIPPED'}`)
		console.log(`   Users: ${migrateUsers ? '✅' : '⏭️  SKIPPED'}`)
		console.log(`   Ratings: ${migrateRatings ? '✅' : '⏭️  SKIPPED'}`)
		console.log(`   Bookmarks: ${migrateBookmarks ? '✅' : '⏭️  SKIPPED'}`)
		console.log(`   Comments: ${migrateComments ? '✅' : '⏭️  SKIPPED'}`)
		console.log(`   Reading Lists: ${migrateReadingLists ? '✅' : '⏭️  SKIPPED'}`)
		console.log(`   Update Word Counts: ${updateWordCounts ? '✅' : '⏭️  SKIPPED'}`)
		console.log('')

		/* ================== STEP 1: Taxonomy Migration ================== */
		let tagMappings: Record<string, number> = {}
		let genreMappings: Record<string, number> = {}

		if (migrateNovels && !defaultConfig.skipTaxonomy) {
			console.log('\n' + '='.repeat(70))
			console.log('📋 STEP 1: Migrating Taxonomy (Tags & Genres)')
			console.log('='.repeat(70))
			
			const taxonomyMigrator = new TaxonomyMigrator(dbConfig)
			await taxonomyMigrator.initialize()
			
			const tagResult = await taxonomyMigrator.migrateTags()
			const genreResult = await taxonomyMigrator.migrateGenres()
			
			tagMappings = await taxonomyMigrator.getTagMappings()
			genreMappings = await taxonomyMigrator.getGenreMappings()
			
			console.log(`✅ Tags: ${tagResult.details?.tagsMigrated || 0} migrated`)
			console.log(`✅ Genres: ${genreResult.details?.genresMigrated || 0} migrated`)
			
			await taxonomyMigrator.cleanup()
		} else if (migrateNovels) {
			console.log('\n⏭️  Skipping taxonomy migration (using existing data)')
			
			/* Get existing taxonomy */
			const mongoClient = new MongoClient(dbConfig.mongodb.uri)
			await mongoClient.connect()
			const mongoDb = mongoClient.db(dbConfig.mongodb.database)
			
			const existingTags = await mongoDb.collection('novel-tags').find({}).toArray()
			existingTags.forEach(tag => {
				if (tag.names?.en) tagMappings[tag.names.en] = tag.tagId
			})
			
			const existingGenres = await mongoDb.collection('novel-genres').find({}).toArray()
			existingGenres.forEach(genre => {
				if (genre.names?.en) genreMappings[genre.names.en] = genre.genreId
			})
			
			await mongoClient.close()
		}

		/* ================== STEP 2: Novels & Chapters Migration ================== */
		if (migrateNovels) {
			console.log('\n' + '='.repeat(70))
			console.log('📚 STEP 2: Migrating Novels & Chapters')
			console.log('='.repeat(70))
			
			const novelMigrator = new NovelMigrator(defaultConfig, dbConfig)
			novelMigrator.setTaxonomyMappings(tagMappings, genreMappings)
			
			await novelMigrator.initialize()
			const novelResult = await novelMigrator.migrate()
			
			console.log(`✅ Novels: ${novelResult.details?.novelsMigrated || 0} migrated`)
			console.log(`✅ Chapters: ${novelResult.details?.chaptersMigrated || 0} migrated`)
			
			await novelMigrator.cleanup()
		}

		/* ================== STEP 3: Users Migration ================== */
		const userDataMigrator = new UserDataMigrator(dbConfig)
		await userDataMigrator.initialize()

		if (migrateUsers) {
			console.log('\n' + '='.repeat(70))
			console.log('👥 STEP 3: Migrating Users')
			console.log('='.repeat(70))
			
			const userResult = await userDataMigrator.migrateUsers(100)
			console.log(`✅ Users: ${userResult.migrated}/${userResult.total} migrated, ${userResult.failed} failed`)
		}

		/* ================== STEP 4: Ratings → Favorites Migration ================== */
		if (migrateRatings) {
			console.log('\n' + '='.repeat(70))
			console.log('⭐ STEP 4: Migrating Ratings to Favorites')
			console.log('='.repeat(70))
			
			const ratingResult = await userDataMigrator.migrateRatingsToFavorites(500)
			console.log(`✅ Ratings: ${ratingResult.migrated}/${ratingResult.total} migrated, ${ratingResult.failed} failed`)
		}

		/* ================== STEP 5: Bookmarks → Favorites Migration ================== */
		if (migrateBookmarks) {
			console.log('\n' + '='.repeat(70))
			console.log('📑 STEP 5: Migrating Bookmarks to Favorites')
			console.log('='.repeat(70))
			
			const bookmarkResult = await userDataMigrator.migrateBookmarksToFavorites(100)
			console.log(`✅ Bookmarks: ${bookmarkResult.migrated} migrated, ${bookmarkResult.failed} failed`)
		}

		/* ================== STEP 6: Comments Migration ================== */
		if (migrateComments) {
			console.log('\n' + '='.repeat(70))
			console.log('💬 STEP 6: Migrating Comments')
			console.log('='.repeat(70))
			
			const commentResult = await userDataMigrator.migrateComments(500)
			console.log(`✅ Comments: ${commentResult.migrated}/${commentResult.total} migrated, ${commentResult.failed} failed`)
		}

		await userDataMigrator.cleanup()

		/* ================== STEP 7: Reading Lists Migration ================== */
		if (migrateReadingLists) {
			console.log('\n' + '='.repeat(70))
			console.log('📚 STEP 7: Migrating Reading Lists')
			console.log('='.repeat(70))
			
			const readingListMigrator = new ReadingListMigrator(dbConfig)
			await readingListMigrator.initialize()
			
			const readingListResult = await readingListMigrator.migrateReadingLists(100)
			console.log(`✅ Reading Lists: ${readingListResult.migrated}/${readingListResult.total} migrated, ${readingListResult.failed} failed`)
			console.log(`✅ Reading List Items: ${readingListResult.itemsMigrated} migrated, ${readingListResult.itemsFailed} failed`)
			
			await readingListMigrator.verifyMigration()
			await readingListMigrator.getStatistics()
			await readingListMigrator.cleanup()
		}

		/* ================== STEP 8: Fix Novel Stats (Word Count & Chapter Count) ================== */
		if (updateWordCounts) {
		console.log('\n' + '='.repeat(70))
		console.log('🔢 STEP 8: Fixing Novel Stats (Word Count & Chapter Count)')
			console.log('='.repeat(70))
			
			try {
				/* Connect to MongoDB for stats fix */
				const mongoClient = new MongoClient(dbConfig.mongodb.uri)
				await mongoClient.connect()
				const mongoDb = mongoClient.db(dbConfig.mongodb.database)
				
				const statsResult = await fixNovelStats(mongoDb)
				console.log(`✅ Stats Fixed: ${statsResult.updated}/${statsResult.total} novels, ${statsResult.failed} failed`)
				
				await mongoClient.close()
			} catch (error) {
				console.error('❌ Failed to fix novel stats:', error)
			}
		}

		/* ================== Migration Complete ================== */
		const duration = ((Date.now() - startTime) / 1000).toFixed(2)
		console.log('\n' + '='.repeat(70))
		console.log('🎉 MIGRATION COMPLETED SUCCESSFULLY!')
		console.log(`⏱️  Total duration: ${duration}s`)
		console.log('='.repeat(70))
		
		process.exit(0)
	} catch (error) {
		console.error('\n💥 Migration failed:', error)
		process.exit(1)
	}
}

/* Parse command line arguments */
function parseArgs() {
	const args = process.argv.slice(2)
	
	for (const arg of args) {
		if (arg === '--skip-novels') {
			process.env.MIGRATE_NOVELS = 'false'
		} else if (arg === '--skip-users') {
			process.env.MIGRATE_USERS = 'false'
		} else if (arg === '--skip-ratings') {
			process.env.MIGRATE_RATINGS = 'false'
		} else if (arg === '--skip-bookmarks') {
			process.env.MIGRATE_BOOKMARKS = 'false'
		} else if (arg === '--skip-comments') {
			process.env.MIGRATE_COMMENTS = 'false'
		} else if (arg === '--skip-reading-lists') {
			process.env.MIGRATE_READING_LISTS = 'false'
		} else if (arg === '--skip-wordcounts') {
			process.env.UPDATE_WORDCOUNTS = 'false'
		} else if (arg === '--help' || arg === '-h') {
			console.log(`
Usage: pnpm run migrate:all [options]

Options:
  --skip-novels          Skip novels & chapters migration
  --skip-users           Skip users migration
  --skip-ratings         Skip ratings migration
  --skip-bookmarks       Skip bookmarks migration
  --skip-comments        Skip comments migration
  --skip-reading-lists   Skip reading lists migration
  --skip-wordcounts      Skip word count updates
  --help, -h             Show this help message

Environment Variables:
  MIGRATE_NOVELS         Set to 'false' to skip novels (default: true)
  MIGRATE_USERS          Set to 'false' to skip users (default: true)
  MIGRATE_RATINGS        Set to 'false' to skip ratings (default: true)
  MIGRATE_BOOKMARKS      Set to 'false' to skip bookmarks (default: true)
  MIGRATE_COMMENTS       Set to 'false' to skip comments (default: true)
  MIGRATE_READING_LISTS  Set to 'false' to skip reading lists (default: true)
  UPDATE_WORDCOUNTS      Set to 'false' to skip word counts (default: true)
  
  MIGRATION_MAX_NOVELS   Max novels to migrate (0 = all, default: 0)
  MIGRATION_BATCH_SIZE   Batch size for processing (default: 50)
  MIGRATION_SKIP_TAXONOMY Skip taxonomy if already exists (default: false)
  ES_ENABLED             Enable Elasticsearch indexing (default: false)

Examples:
  # Migrate everything
  pnpm run migrate:all

  # Only migrate users and comments
  pnpm run migrate:all --skip-novels --skip-ratings --skip-bookmarks --skip-reading-lists

  # Only migrate reading lists
  pnpm run migrate:all --skip-novels --skip-users --skip-ratings --skip-bookmarks --skip-comments --skip-wordcounts

  # Only update word counts for existing novels
  pnpm run migrate:all --skip-novels --skip-users --skip-ratings --skip-bookmarks --skip-comments --skip-reading-lists
			`)
			process.exit(0)
		}
	}
}

/* Run the script */
if (import.meta.url === `file://${process.argv[1]}`) {
	parseArgs()
	main()
}

