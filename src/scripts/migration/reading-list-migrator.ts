/**
 * Reading List Migration Script
 * Migrates reading lists and their items from PostgreSQL to MongoDB
 */

import 'dotenv/config'
import { Client } from 'pg'
import { MongoClient } from 'mongodb'
import { randomUUID } from 'node:crypto'
import type { DatabaseConfig } from './types.js'

interface PgReadingList {
	id: number
	user_id: number
	name: string
	description: string | null
	is_public: boolean
	created_at: Date
	updated_at: Date
}

interface PgReadingListItem {
	id: number
	reading_list_id: number
	novel_id: number
	added_at: Date
}

export class ReadingListMigrator {
	private pgClient: Client | null = null
	private mongoClient: MongoClient | null = null
	private mongoDb: any = null
	private dbConfig: DatabaseConfig
	private userIdToUuidMap: Map<number, string> = new Map()
	private novelIdToUuidMap: Map<number, string> = new Map()
	private novelIdToSlugMap: Map<number, string> = new Map()
	private listIdToUuidMap: Map<number, string> = new Map()

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
	 * Build lookup maps for userId -> userUuid and novelId -> novelUuid/slug
	 */
	private async buildLookupMaps(): Promise<void> {
		console.log('🔍 Building lookup maps...')
		
		/* Build novel map from MongoDB */
		const novels = await this.mongoDb.collection('novels')
			.find({})
			.project({ novelId: 1, uuid: 1, slug: 1 })
			.toArray()
		
		for (const novel of novels) {
			this.novelIdToUuidMap.set(novel.novelId, novel.uuid)
			this.novelIdToSlugMap.set(novel.novelId, novel.slug)
		}
		console.log(`📚 Built novel ID to UUID/slug map: ${this.novelIdToUuidMap.size} novels`)

		/* Build user map from MongoDB */
		const users = await this.mongoDb.collection('users')
			.find({})
			.project({ userId: 1, uuid: 1 })
			.toArray()
		
		for (const user of users) {
			this.userIdToUuidMap.set(user.userId, user.uuid)
		}
		console.log(`👥 Built user ID to UUID map: ${this.userIdToUuidMap.size} users`)
	}

	/**
	 * Migrate reading lists from PostgreSQL to MongoDB
	 */
	async migrateReadingLists(batchSize: number = 100): Promise<{ 
		total: number
		migrated: number
		failed: number
		itemsMigrated: number
		itemsFailed: number
	}> {
		console.log('\n📚 Starting reading list migration...')
		
		if (!this.pgClient) throw new Error('PostgreSQL client not initialized')

		/* Get total count */
		const countResult = await this.pgClient.query(
			`SELECT COUNT(*) FROM "${this.dbConfig.postgres.schema}".reading_lists`
		)
		const total = parseInt(countResult.rows[0].count)
		console.log(`📊 Found ${total} reading lists to migrate`)

		let migrated = 0
		let failed = 0
		let itemsMigrated = 0
		let itemsFailed = 0
		let offset = 0

		while (offset < total) {
			try {
				/* Fetch batch of reading lists */
				const result = await this.pgClient.query<PgReadingList>(
					`SELECT * FROM "${this.dbConfig.postgres.schema}".reading_lists 
					 ORDER BY id 
					 LIMIT $1 OFFSET $2`,
					[batchSize, offset]
				)

				const lists = result.rows
				console.log(`\n📦 Processing batch: ${offset + 1}-${offset + lists.length} of ${total}`)

				/* Process each list */
				for (const pgList of lists) {
					try {
						/* Get user UUID */
						const userUuid = this.userIdToUuidMap.get(pgList.user_id)
						if (!userUuid) {
							console.warn(`⚠️ User ID ${pgList.user_id} not found in MongoDB, skipping list ${pgList.id}`)
							failed++
							continue
						}

						/* Generate UUID for this list */
						const listUuid = randomUUID()
						this.listIdToUuidMap.set(pgList.id, listUuid)

						/* Fetch items for this list */
						const itemsResult = await this.pgClient.query<PgReadingListItem>(
							`SELECT * FROM "${this.dbConfig.postgres.schema}".reading_list_items 
							 WHERE reading_list_id = $1 
							 ORDER BY added_at`,
							[pgList.id]
						)

						const pgItems = itemsResult.rows

						/* Filter valid items (novels that exist in MongoDB) */
						const validItems: any[] = []
						for (const item of pgItems) {
							const novelUuid = this.novelIdToUuidMap.get(item.novel_id)
							const novelSlug = this.novelIdToSlugMap.get(item.novel_id)
							
							if (novelUuid && novelSlug) {
								validItems.push({
									novelId: item.novel_id,
									novelUuid,
									novelSlug,
									addedAt: item.added_at
								})
							} else {
								console.warn(`⚠️ Novel ID ${item.novel_id} not found, skipping item`)
								itemsFailed++
							}
						}

					/* Determine cover novel (first novel in list) */
					const coverNovelId = validItems.length > 0 ? validItems[0].novelId : null

				/* Get cover images from first 4 novels */
				const coverImages: string[] = []
				for (let i = 0; i < Math.min(4, validItems.length); i++) {
					try {
						const novel = await this.mongoDb.collection('novels')
							.findOne(
								{ novelId: validItems[i].novelId },
								{ projection: { coverImg: 1 } }
							)
						if (novel?.coverImg) {
							coverImages.push(novel.coverImg)
						}
					} catch (err) {
						console.warn(`⚠️ Failed to fetch cover for novel ${validItems[i].novelId}:`, err)
					}
				}

					/* Map visibility */
                    //const visibility = pgList.is_public ? 'public' : 'private'
                    const visibility = 'public'
                        

					/* Create reading list document */
					const readingListDoc = {
						uuid: listUuid,
						ownerUserUuid: userUuid,
						name: pgList.name,
						description: pgList.description || '',
						visibility,
						itemsCount: validItems.length,
						coverNovelId,
						coverImages,
						upvoteCount: 0,
						downvoteCount: 0,
						createdAt: pgList.created_at,
						updatedAt: pgList.updated_at
					}

						/* Insert reading list */
						await this.mongoDb.collection('reading-lists').insertOne(readingListDoc)

						/* Create reading list items */
						if (validItems.length > 0) {
							const itemDocs = validItems.map((item, index) => ({
								listUuid,
								itemId: pgList.id * 10000 + index, // Generate unique itemId
								novelSlug: item.novelSlug,
								novelUuid: item.novelUuid,
								createdAt: item.addedAt,
								updatedAt: item.addedAt
							}))

							await this.mongoDb.collection('reading-list-items').insertMany(itemDocs)
							itemsMigrated += itemDocs.length
						}

						migrated++
						console.log(`✅ Migrated list "${pgList.name}" (${validItems.length} items)`)

					} catch (error) {
						failed++
						console.error(`❌ Failed to migrate list ${pgList.id}:`, error)
					}
				}

				offset += batchSize
				
				/* Progress update */
				const progress = Math.min(100, Math.round((offset / total) * 100))
				console.log(`📈 Progress: ${progress}% (${migrated} migrated, ${failed} failed)`)

			} catch (error) {
				console.error(`❌ Error processing batch at offset ${offset}:`, error)
				break
			}
		}

		console.log('\n✅ Reading list migration complete!')
		console.log(`📊 Summary:`)
		console.log(`   - Total lists: ${total}`)
		console.log(`   - Migrated: ${migrated}`)
		console.log(`   - Failed: ${failed}`)
		console.log(`   - Items migrated: ${itemsMigrated}`)
		console.log(`   - Items failed: ${itemsFailed}`)

		return { total, migrated, failed, itemsMigrated, itemsFailed }
	}

	/**
	 * Verify migration by comparing counts
	 */
	async verifyMigration(): Promise<void> {
		console.log('\n🔍 Verifying migration...')

		if (!this.pgClient) throw new Error('PostgreSQL client not initialized')

		/* Count in PostgreSQL */
		const pgListsResult = await this.pgClient.query(
			`SELECT COUNT(*) FROM "${this.dbConfig.postgres.schema}".reading_lists`
		)
		const pgListsCount = parseInt(pgListsResult.rows[0].count)

		const pgItemsResult = await this.pgClient.query(
			`SELECT COUNT(*) FROM "${this.dbConfig.postgres.schema}".reading_list_items`
		)
		const pgItemsCount = parseInt(pgItemsResult.rows[0].count)

		/* Count in MongoDB */
		const mongoListsCount = await this.mongoDb.collection('reading-lists').countDocuments()
		const mongoItemsCount = await this.mongoDb.collection('reading-list-items').countDocuments()

		console.log('\n📊 Verification Results:')
		console.log(`   PostgreSQL Lists: ${pgListsCount}`)
		console.log(`   MongoDB Lists: ${mongoListsCount}`)
		console.log(`   PostgreSQL Items: ${pgItemsCount}`)
		console.log(`   MongoDB Items: ${mongoItemsCount}`)

		if (mongoListsCount >= pgListsCount * 0.95) {
			console.log('✅ Migration verification passed (>95% migrated)')
		} else {
			console.warn('⚠️ Migration verification warning: Less than 95% of lists migrated')
		}
	}

	/**
	 * Create MongoDB indexes for reading lists
	 */
	async createIndexes(): Promise<void> {
		console.log('\n🔧 Creating MongoDB indexes...')

		try {
			/* Reading Lists indexes */
			await this.mongoDb.collection('reading-lists').createIndex({ uuid: 1 }, { unique: true })
			await this.mongoDb.collection('reading-lists').createIndex({ ownerUserUuid: 1 })
			await this.mongoDb.collection('reading-lists').createIndex({ ownerUserUuid: 1, updatedAt: -1 })
			await this.mongoDb.collection('reading-lists').createIndex({ visibility: 1, updatedAt: -1 })
			await this.mongoDb.collection('reading-lists').createIndex({ upvoteCount: -1, updatedAt: -1 })
			await this.mongoDb.collection('reading-lists').createIndex({ name: 1 })
			await this.mongoDb.collection('reading-lists').createIndex({ itemsCount: 1 })

			console.log('✅ Created reading-lists indexes')

			/* Reading List Items indexes */
			await this.mongoDb.collection('reading-list-items').createIndex({ itemId: 1 }, { unique: true })
			await this.mongoDb.collection('reading-list-items').createIndex({ listUuid: 1 })
			await this.mongoDb.collection('reading-list-items').createIndex({ listUuid: 1, createdAt: -1 })
			await this.mongoDb.collection('reading-list-items').createIndex({ listUuid: 1, novelSlug: 1 }, { unique: true })
			await this.mongoDb.collection('reading-list-items').createIndex({ novelSlug: 1 })
			await this.mongoDb.collection('reading-list-items').createIndex({ novelUuid: 1 })

			console.log('✅ Created reading-list-items indexes')

		} catch (error) {
			console.error('❌ Failed to create indexes:', error)
			throw error
		}
	}

	/**
	 * Cleanup and close connections
	 */
	async cleanup(): Promise<void> {
		try {
			if (this.pgClient) {
				await this.pgClient.end()
				console.log('✅ Closed PostgreSQL connection')
			}

			if (this.mongoClient) {
				await this.mongoClient.close()
				console.log('✅ Closed MongoDB connection')
			}
		} catch (error) {
			console.error('❌ Error during cleanup:', error)
		}
	}

	/**
	 * Get migration statistics
	 */
	async getStatistics(): Promise<void> {
		console.log('\n📊 Reading List Statistics:')

		/* Lists by visibility */
		const visibilityStats = await this.mongoDb.collection('reading-lists').aggregate([
			{ $group: { _id: '$visibility', count: { $sum: 1 } } }
		]).toArray()

		console.log('\n📈 Lists by visibility:')
		for (const stat of visibilityStats) {
			console.log(`   ${stat._id}: ${stat.count}`)
		}

		/* Lists by item count */
		const itemCountStats = await this.mongoDb.collection('reading-lists').aggregate([
			{
				$bucket: {
					groupBy: '$itemsCount',
					boundaries: [0, 1, 5, 10, 20, 50, 100],
					default: '100+',
					output: { count: { $sum: 1 } }
				}
			}
		]).toArray()

		console.log('\n📊 Lists by item count:')
		for (const stat of itemCountStats) {
			const range = typeof stat._id === 'number' ? `${stat._id}-${stat._id + 4}` : stat._id
			console.log(`   ${range} items: ${stat.count}`)
		}

		/* Top users by list count */
		const topUsers = await this.mongoDb.collection('reading-lists').aggregate([
			{ $group: { _id: '$ownerUserUuid', listCount: { $sum: 1 } } },
			{ $sort: { listCount: -1 } },
			{ $limit: 10 }
		]).toArray()

		console.log('\n👥 Top 10 users by list count:')
		for (let i = 0; i < topUsers.length; i++) {
			console.log(`   ${i + 1}. User ${topUsers[i]._id.substring(0, 8)}...: ${topUsers[i].listCount} lists`)
		}

		/* Total items */
		const totalItems = await this.mongoDb.collection('reading-list-items').countDocuments()
		console.log(`\n📚 Total items across all lists: ${totalItems}`)
	}
}

/* Database configuration - same as migrate-all.ts */
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
 * Main execution function
 */
async function main() {
	console.log('🚀 Starting Reading List Migration\n')

	const migrator = new ReadingListMigrator(dbConfig)

	try {
		/* Initialize connections */
		await migrator.initialize()

		/* Create indexes first */
		await migrator.createIndexes()

		/* Migrate reading lists */
		const result = await migrator.migrateReadingLists(100)

		/* Verify migration */
		await migrator.verifyMigration()

		/* Show statistics */
		await migrator.getStatistics()

		console.log('\n✅ Migration completed successfully!')

	} catch (error) {
		console.error('\n❌ Migration failed:', error)
		process.exit(1)
	} finally {
		await migrator.cleanup()
	}
}

/* Run if executed directly */
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(console.error)
}

