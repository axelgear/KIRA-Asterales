/**
 * Reading History Migration Script
 * Migrates user_reading_history from PostgreSQL to browsing-history in MongoDB
 */

import 'dotenv/config'
import { Client } from 'pg'
import { MongoClient } from 'mongodb'
import type { DatabaseConfig } from './types.js'

interface PgReadingHistory {
	user_id: number
	novel_id: number
	chapter_id: number
	reading_time: number
	last_read_at: Date
	updated_at: Date
}

export class ReadingHistoryMigrator {
	private pgClient: Client | null = null
	private mongoClient: MongoClient | null = null
	private mongoDb: any = null
	private dbConfig: DatabaseConfig
	private userIdToUuidMap: Map<number, string> = new Map()
	private novelIdToSlugMap: Map<number, string> = new Map()
	private chapterIdToDataMap: Map<number, { uuid: string; title: string; sequence: number }> = new Map()

	constructor(dbConfig: DatabaseConfig) {
		this.dbConfig = dbConfig
	}

	/**
	 * Initialize database connections
	 */
	async initialize(): Promise<void> {
		try {
			/* Connect to PostgreSQL */
			this.pgClient = new Client({
				host: this.dbConfig.postgres.host,
				port: this.dbConfig.postgres.port,
				database: this.dbConfig.postgres.database,
				user: this.dbConfig.postgres.username,
				password: this.dbConfig.postgres.password,
				ssl: this.dbConfig.postgres.ssl
			})
			await this.pgClient.connect()
			console.log('✅ Connected to PostgreSQL')

			/* Connect to MongoDB */
			this.mongoClient = new MongoClient(this.dbConfig.mongodb.uri)
			await this.mongoClient.connect()
			this.mongoDb = this.mongoClient.db(this.dbConfig.mongodb.database)
			console.log('✅ Connected to MongoDB')

			/* Build lookup maps */
			await this.buildLookupMaps()
		} catch (error) {
			console.error('❌ Failed to initialize connections:', error)
			throw error
		}
	}

	/**
	 * Build lookup maps for ID to UUID/slug conversions
	 */
	private async buildLookupMaps(): Promise<void> {
		console.log('🔨 Building lookup maps...')

		// Build user ID to UUID map
		const users = await this.mongoDb.collection('users').find({}).project({ userId: 1, uuid: 1 }).toArray()
		users.forEach((user: any) => {
			this.userIdToUuidMap.set(user.userId, user.uuid)
		})
		console.log(`📊 User map: ${this.userIdToUuidMap.size} entries`)

		// Build novel ID to slug map
		const novels = await this.mongoDb.collection('novels').find({}).project({ novelId: 1, slug: 1 }).toArray()
		novels.forEach((novel: any) => {
			this.novelIdToSlugMap.set(novel.novelId, novel.slug)
		})
		console.log(`📊 Novel map: ${this.novelIdToSlugMap.size} entries`)

		// Build chapter ID to data map
		const chapters = await this.mongoDb.collection('chapters').find({}).project({ 
			chapterId: 1, 
			uuid: 1, 
			title: 1, 
			sequence: 1 
		}).toArray()
		chapters.forEach((chapter: any) => {
			this.chapterIdToDataMap.set(chapter.chapterId, {
				uuid: chapter.uuid,
				title: chapter.title,
				sequence: chapter.sequence
			})
		})
		console.log(`📊 Chapter map: ${this.chapterIdToDataMap.size} entries`)
	}

	/**
	 * Migrate reading history from PostgreSQL to MongoDB
	 */
	async migrateReadingHistory(batchSize: number = 1000): Promise<{ total: number; migrated: number; failed: number; skipped: number }> {
		console.log('\n📚 Starting reading history migration...')
		
		if (!this.pgClient) throw new Error('PostgreSQL client not initialized')

		/* Get total count */
		const countResult = await this.pgClient.query(
			`SELECT COUNT(*) FROM "${this.dbConfig.postgres.schema}".user_reading_history`
		)
		const total = parseInt(countResult.rows[0].count)
		console.log(`📊 Found ${total} reading history entries`)

		let migrated = 0
		let failed = 0
		let skipped = 0
		let offset = 0

		while (offset < total) {
			try {
				/* Fetch batch */
				const result = await this.pgClient.query<PgReadingHistory>(
					`SELECT * FROM "${this.dbConfig.postgres.schema}".user_reading_history 
					 ORDER BY user_id, novel_id 
					 LIMIT $1 OFFSET $2`,
					[batchSize, offset]
				)

				const histories = result.rows

				/* Process each history entry */
				for (const pgHistory of histories) {
					try {
						/* Get mapped values */
						const userUuid = this.userIdToUuidMap.get(pgHistory.user_id)
						const novelSlug = this.novelIdToSlugMap.get(pgHistory.novel_id)
						const chapterData = this.chapterIdToDataMap.get(pgHistory.chapter_id)

						if (!userUuid) {
							console.warn(`⚠️  User ${pgHistory.user_id} not found, skipping`)
							skipped++
							continue
						}

						if (!novelSlug) {
							console.warn(`⚠️  Novel ${pgHistory.novel_id} not found, skipping`)
							skipped++
							continue
						}

						if (!chapterData) {
							console.warn(`⚠️  Chapter ${pgHistory.chapter_id} not found, skipping`)
							skipped++
							continue
						}

						/* Check if history entry already exists */
						const existing = await this.mongoDb.collection('browsing-history').findOne({
							userUuid,
							novelSlug
						})

						if (existing) {
							/* Update if the PG entry is newer */
							if (new Date(pgHistory.last_read_at) > new Date(existing.lastReadAt)) {
								await this.mongoDb.collection('browsing-history').updateOne(
									{ userUuid, novelSlug },
									{
										$set: {
											chapterUuid: chapterData.uuid,
											chapterTitle: chapterData.title,
											chapterSequence: chapterData.sequence,
											lastReadAt: pgHistory.last_read_at,
											progress: 0, // Default progress
											device: '', // No device info in old system
											updatedAt: pgHistory.updated_at || new Date()
										}
									}
								)
								console.log(`🔄 Updated history for user ${pgHistory.user_id}, novel ${pgHistory.novel_id}`)
							}
							migrated++
							continue
						}

						/* Create new history entry */
						const mongoHistory = {
							userUuid,
							novelSlug,
							chapterUuid: chapterData.uuid,
							chapterTitle: chapterData.title,
							chapterSequence: chapterData.sequence,
							lastReadAt: pgHistory.last_read_at,
							progress: 0, // Default progress
							device: '', // No device info in old system
							createdAt: pgHistory.updated_at || new Date(),
							updatedAt: pgHistory.updated_at || new Date()
						}

						await this.mongoDb.collection('browsing-history').insertOne(mongoHistory)
						migrated++
					} catch (error: any) {
						if (error.code === 11000) {
							// Duplicate key - already exists
							console.warn(`⚠️  History entry already exists for user ${pgHistory.user_id}, novel ${pgHistory.novel_id}`)
							migrated++
						} else {
							console.error(`❌ Failed to migrate history entry:`, error)
							failed++
						}
					}
				}

				offset += batchSize
				const progress = ((offset / total) * 100).toFixed(1)
				console.log(`📈 Progress: ${progress}% (${offset}/${total})`)
			} catch (error) {
				console.error(`❌ Batch migration failed at offset ${offset}:`, error)
				failed += batchSize
				offset += batchSize
			}
		}

		console.log(`✅ Reading history migration completed: ${migrated} migrated, ${skipped} skipped, ${failed} failed`)
		return { total, migrated, failed, skipped }
	}

	/**
	 * Close database connections
	 */
	async close(): Promise<void> {
		if (this.pgClient) {
			await this.pgClient.end()
			console.log('🔌 PostgreSQL connection closed')
		}
		if (this.mongoClient) {
			await this.mongoClient.close()
			console.log('🔌 MongoDB connection closed')
		}
	}
}

/**
 * Main execution
 */
async function main() {
	const dbConfig: DatabaseConfig = {
		postgres: {
			host: process.env.PG_HOST || 'localhost',
			port: parseInt(process.env.PG_PORT || '5432'),
			database: process.env.PG_DATABASE || 'novel',
			username: process.env.PG_USERNAME || 'postgres',
			password: process.env.PG_PASSWORD || '',
			schema: process.env.PG_SCHEMA || 'public',
			ssl: process.env.PG_SSL === 'true'
		},
		mongodb: {
			uri: process.env.MONGO_URI || `mongodb://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_CLUSTER_HOST}`,
			database: process.env.MONGO_DATABASE || process.env.MONGODB_NAME || 'novel'
		},
		elasticsearch: {
			enabled: false,
			nodes: [process.env.ES_NODE || 'http://localhost:9200'],
			auth: {
				username: process.env.ES_USERNAME || '',
				password: process.env.ES_PASSWORD || ''
			}
		}
	}

	const migrator = new ReadingHistoryMigrator(dbConfig)

	try {
		console.log('🚀 Starting Reading History Migration')
		console.log('=' .repeat(70))

		await migrator.initialize()
		const result = await migrator.migrateReadingHistory()

		console.log('\n' + '='.repeat(70))
		console.log('📊 Migration Summary:')
		console.log(`   Total entries: ${result.total}`)
		console.log(`   Migrated: ${result.migrated}`)
		console.log(`   Skipped: ${result.skipped}`)
		console.log(`   Failed: ${result.failed}`)
		console.log('=' .repeat(70))
	} catch (error) {
		console.error('❌ Migration failed:', error)
		process.exit(1)
	} finally {
		await migrator.close()
	}
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main()
}
