/**
 * User Data Migration Script
 * Migrates users, ratings, favorites (bookmarks), and comments from PostgreSQL to MongoDB
 */

import { Client } from 'pg'
import { MongoClient } from 'mongodb'
import { randomUUID } from 'node:crypto'
import type { PgUser, PgRating, PgComment, DatabaseConfig } from './types.js'

export class UserDataMigrator {
	private pgClient: Client | null = null
	private mongoClient: MongoClient | null = null
	private mongoDb: any = null
	private dbConfig: DatabaseConfig
	private userIdToUuidMap: Map<number, string> = new Map()
	private novelIdToUuidMap: Map<number, string> = new Map()

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
	 * Build lookup maps for userId -> userUuid and novelId -> novelUuid
	 */
	private async buildLookupMaps(): Promise<void> {
		console.log('🔍 Building lookup maps...')
		
		/* Build novel map from MongoDB */
		const novels = await this.mongoDb.collection('novels')
			.find({})
			.project({ novelId: 1, uuid: 1 })
			.toArray()
		
		for (const novel of novels) {
			this.novelIdToUuidMap.set(novel.novelId, novel.uuid)
		}
		console.log(`📚 Built novel ID to UUID map: ${this.novelIdToUuidMap.size} novels`)

		/* Build user map from MongoDB (if any users already exist) */
		const existingUsers = await this.mongoDb.collection('users')
			.find({})
			.project({ userId: 1, uuid: 1 })
			.toArray()
		
		for (const user of existingUsers) {
			this.userIdToUuidMap.set(user.userId, user.uuid)
		}
		console.log(`👥 Found ${this.userIdToUuidMap.size} existing users`)
	}

	/**
	 * Migrate users from PostgreSQL to MongoDB
	 */
	async migrateUsers(batchSize: number = 100): Promise<{ total: number; migrated: number; failed: number }> {
		console.log('\n👥 Starting user migration...')
		
		if (!this.pgClient) throw new Error('PostgreSQL client not initialized')

		/* Get total count */
		const countResult = await this.pgClient.query(
			`SELECT COUNT(*) FROM "${this.dbConfig.postgres.schema}".users WHERE deleted_at IS NULL`
		)
		const total = parseInt(countResult.rows[0].count)
		console.log(`📊 Found ${total} users to migrate`)

		let migrated = 0
		let failed = 0
		let offset = 0

		while (offset < total) {
			try {
				/* Fetch batch */
				const result = await this.pgClient.query(
					`SELECT * FROM "${this.dbConfig.postgres.schema}".users 
					WHERE deleted_at IS NULL 
					ORDER BY id 
					LIMIT $1 OFFSET $2`,
					[batchSize, offset]
				)

				const users = result.rows as PgUser[]

				/* Transform and insert */
				for (const pgUser of users) {
					try {
						/* Check if user already exists */
						const existing = await this.mongoDb.collection('users').findOne({ userId: pgUser.id })
						if (existing) {
							console.log(`⏭️  User ${pgUser.id} already exists, skipping`)
							/* Still add to lookup map */
							this.userIdToUuidMap.set(pgUser.id, existing.uuid)
							migrated++
							continue
						}

						const userUuid = randomUUID()
						
						/* Generate unique username - use userId to ensure uniqueness */
						let username = `user${pgUser.id}`
						/* Try to use email prefix if available */
						if (pgUser.email) {
							const emailPrefix = pgUser.email.split('@')[0]
							/* Only use email prefix if it's valid and unique */
							if (emailPrefix && /^[a-zA-Z0-9_-]{3,}$/.test(emailPrefix)) {
								const existingWithUsername = await this.mongoDb.collection('users').findOne({ username: emailPrefix })
								if (!existingWithUsername) {
									username = emailPrefix
								}
							}
						}
						
						const mongoUser = {
							userId: pgUser.id,
							uuid: userUuid,
							username: username, // Auto-generated unique username
							email: pgUser.email,
							password: pgUser.password,
							nickname: pgUser.name || null,
							avatar: pgUser.image || null,
							bio: null,
							isEmailVerified: pgUser.email_verified || false,
							isPhoneVerified: false,
							is2FAEnabled: false,
							isBlocked: !!pgUser.deleted_at || !!pgUser.suspended_until,
							isHidden: false,
							roles: ['user'], // Set all users to 'user' role
							permissions: [],
							lastLoginAt: null,
							lastActiveAt: pgUser.updated_at || pgUser.created_at,
							/* Security fields */
							emailVerifyToken: null,
							emailVerifyTokenExpiresAt: null,
							passwordResetToken: null,
							passwordResetTokenExpiresAt: null,
							twoFactorType: 'none',
							totpSecret: null,
							totpBackupCodes: [],
							totpRecoveryCode: null,
							totpEnabledAt: null,
							oauthAccounts: [],
							/* Moderation */
							blockReason: null,
							createdAt: pgUser.created_at || new Date(),
							updatedAt: pgUser.updated_at || new Date()
						}

						await this.mongoDb.collection('users').insertOne(mongoUser)
						
						/* Update lookup map */
						this.userIdToUuidMap.set(pgUser.id, userUuid)
						
						migrated++
					} catch (error: any) {
						/* Handle duplicate key errors gracefully */
						if (error.code === 11000) {
							console.warn(`⚠️  User ${pgUser.id} has duplicate key, skipping`)
							failed++
						} else {
							console.error(`❌ Failed to migrate user ${pgUser.id}:`, error)
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

		console.log(`✅ User migration completed: ${migrated} migrated, ${failed} failed`)
		return { total, migrated, failed }
	}

	/**
	 * Migrate ratings from PostgreSQL to favorites in MongoDB
	 * In the old system, ratings are votes. In the new system, we treat them as favorites if rating >= 4
	 */
	async migrateRatingsToFavorites(batchSize: number = 500): Promise<{ total: number; migrated: number; failed: number }> {
		console.log('\n⭐ Starting ratings migration to favorites...')
		
		if (!this.pgClient) throw new Error('PostgreSQL client not initialized')

		/* Get total count of ratings >= 4 (treat as favorites) */
		const countResult = await this.pgClient.query(
			`SELECT COUNT(*) FROM "${this.dbConfig.postgres.schema}".ratings WHERE rating >= 4`
		)
		const total = parseInt(countResult.rows[0].count)
		console.log(`📊 Found ${total} ratings (rating >= 4) to migrate as favorites`)

		let migrated = 0
		let failed = 0
		let offset = 0

		while (offset < total) {
			try {
				/* Fetch batch */
				const result = await this.pgClient.query(
					`SELECT * FROM "${this.dbConfig.postgres.schema}".ratings 
					WHERE rating >= 4
					ORDER BY id 
					LIMIT $1 OFFSET $2`,
					[batchSize, offset]
				)

				const ratings = result.rows as PgRating[]

				/* Transform and insert */
				const favorites = []
				for (const pgRating of ratings) {
					try {
						const userUuid = this.userIdToUuidMap.get(pgRating.user_id)
						const novelUuid = this.novelIdToUuidMap.get(pgRating.novel_id)

						if (!userUuid) {
							console.warn(`⚠️  User ${pgRating.user_id} not found, skipping rating ${pgRating.id}`)
							failed++
							continue
						}

						if (!novelUuid) {
							console.warn(`⚠️  Novel ${pgRating.novel_id} not found, skipping rating ${pgRating.id}`)
							failed++
							continue
						}

						/* Check if favorite already exists */
						const existing = await this.mongoDb.collection('favorites').findOne({
							userUuid,
							novelId: pgRating.novel_id
						})
						
						if (existing) {
							migrated++
							continue
						}

						favorites.push({
							userUuid,
							novelId: pgRating.novel_id,
							novelUuid,
							createdAtMs: pgRating.created_at ? new Date(pgRating.created_at).getTime() : Date.now(),
							createdAt: pgRating.created_at || new Date(),
							updatedAt: pgRating.updated_at || new Date()
						})
					} catch (error) {
						console.error(`❌ Failed to process rating ${pgRating.id}:`, error)
						failed++
					}
				}

				/* Bulk insert */
				if (favorites.length > 0) {
					try {
						await this.mongoDb.collection('favorites').insertMany(favorites, { ordered: false })
						migrated += favorites.length
					} catch (error: any) {
						/* Handle duplicate key errors */
						if (error.code === 11000) {
							const successful = favorites.length - (error.result?.writeErrors?.length || 0)
							migrated += successful
							failed += (error.result?.writeErrors?.length || 0)
						} else {
							throw error
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

		console.log(`✅ Ratings to favorites migration completed: ${migrated} migrated, ${failed} failed`)
		return { total, migrated, failed }
	}

	/**
	 * Migrate bookmarks from users.bookmarks JSON field to favorites
	 */
	async migrateBookmarksToFavorites(batchSize: number = 100): Promise<{ total: number; migrated: number; failed: number }> {
		console.log('\n📑 Starting bookmarks migration to favorites...')
		
		if (!this.pgClient) throw new Error('PostgreSQL client not initialized')
		
		/* Drop old userId index if it exists (from old schema) */
		try {
			const indexes = await this.mongoDb.collection('favorites').indexes()
			const oldIndex = indexes.find((idx: any) => idx.name === 'userId_1_novelId_1')
			if (oldIndex) {
				console.log('🗑️  Dropping old userId_1_novelId_1 index...')
				await this.mongoDb.collection('favorites').dropIndex('userId_1_novelId_1')
				console.log('✅ Old index dropped')
			}
		} catch (error) {
			console.warn('⚠️  Could not drop old index (might not exist):', error)
		}

		/* Get users with bookmarks */
		const result = await this.pgClient.query(
			`SELECT id, bookmarks, created_at FROM "${this.dbConfig.postgres.schema}".users 
			WHERE bookmarks IS NOT NULL AND bookmarks != '{}'::jsonb 
			AND deleted_at IS NULL`
		)

		const users = result.rows
		const total = users.length
		console.log(`📊 Found ${total} users with bookmarks`)

		let migrated = 0
		let failed = 0

		for (const user of users) {
			try {
				const userUuid = this.userIdToUuidMap.get(user.id)
				if (!userUuid) {
					console.warn(`⚠️  User ${user.id} not found, skipping`)
					failed++
					continue
				}

			/* Parse bookmarks JSON */
			const bookmarks = typeof user.bookmarks === 'string' 
				? JSON.parse(user.bookmarks) 
				: user.bookmarks

			/* Handle various bookmark formats */
			let novelIds: number[] = []
			
			if (Array.isArray(bookmarks)) {
				// Direct array: [1, 2, 3]
				novelIds = bookmarks.filter(id => typeof id === 'number')
			} else if (typeof bookmarks === 'object' && bookmarks !== null) {
				// Object with bookmarks property: { bookmarks: [1, 2, 3] }
				if (Array.isArray(bookmarks.bookmarks)) {
					novelIds = bookmarks.bookmarks.filter((id: any) => typeof id === 'number')
				}
				// Object with list property: { list: [1, 2, 3] }
				else if (Array.isArray(bookmarks.list)) {
					novelIds = bookmarks.list.filter((id: any) => typeof id === 'number')
				}
				// Object as map: { "1": true, "2": true }
				else {
					novelIds = Object.keys(bookmarks)
						.map(key => parseInt(key))
						.filter(id => !isNaN(id))
				}
			}

				/* Create favorites for each bookmark */
				for (const novelId of novelIds) {
					try {
						const novelUuid = this.novelIdToUuidMap.get(novelId)
						if (!novelUuid) {
							console.warn(`⚠️  Novel ${novelId} not found, skipping`)
							continue
						}

						/* Check if favorite already exists */
						const existing = await this.mongoDb.collection('favorites').findOne({
							userUuid,
							novelId
						})
						
						if (existing) {
							migrated++
							continue
						}

						await this.mongoDb.collection('favorites').insertOne({
							userUuid,
							novelId,
							novelUuid,
							createdAtMs: user.created_at ? new Date(user.created_at).getTime() : Date.now(),
							createdAt: user.created_at || new Date(),
							updatedAt: new Date()
						})
						
						migrated++
					} catch (error) {
						console.error(`❌ Failed to create favorite for user ${user.id}, novel ${novelId}:`, error)
						failed++
					}
				}
			} catch (error) {
				console.error(`❌ Failed to process bookmarks for user ${user.id}:`, error)
				failed++
			}
		}

		console.log(`✅ Bookmarks to favorites migration completed: ${migrated} migrated, ${failed} failed`)
		return { total, migrated, failed }
	}

	/**
	 * Migrate comments from PostgreSQL to MongoDB
	 */
	async migrateComments(batchSize: number = 500): Promise<{ total: number; migrated: number; failed: number }> {
		console.log('\n💬 Starting comments migration...')
		
		if (!this.pgClient) throw new Error('PostgreSQL client not initialized')

		/* Get total count of novel comments */
		const countResult = await this.pgClient.query(
			`SELECT COUNT(*) FROM "${this.dbConfig.postgres.schema}".comments 
			WHERE novel_id IS NOT NULL AND chapter_id IS NULL`
		)
		const total = parseInt(countResult.rows[0].count)
		console.log(`📊 Found ${total} novel comments to migrate`)

		let migrated = 0
		let failed = 0
		let offset = 0

		while (offset < total) {
			try {
				/* Fetch batch */
				const result = await this.pgClient.query(
					`SELECT * FROM "${this.dbConfig.postgres.schema}".comments 
					WHERE novel_id IS NOT NULL AND chapter_id IS NULL
					ORDER BY id 
					LIMIT $1 OFFSET $2`,
					[batchSize, offset]
				)

				const comments = result.rows as PgComment[]

				/* Transform and insert */
				for (const pgComment of comments) {
					try {
						const userUuid = this.userIdToUuidMap.get(pgComment.user_id)
						const novelUuid = pgComment.novel_id ? this.novelIdToUuidMap.get(pgComment.novel_id) : null

						if (!userUuid) {
							console.warn(`⚠️  User ${pgComment.user_id} not found, skipping comment ${pgComment.id}`)
							failed++
							continue
						}

						if (!novelUuid) {
							console.warn(`⚠️  Novel ${pgComment.novel_id} not found, skipping comment ${pgComment.id}`)
							failed++
							continue
						}

						/* Check if comment already exists */
						const existing = await this.mongoDb.collection('novel-comments').findOne({ commentId: pgComment.id })
						if (existing) {
							migrated++
							continue
						}

						const mongoComment = {
							commentId: pgComment.id,
							novelUuid,
							novelId: pgComment.novel_id,
							userUuid,
							userId: pgComment.user_id,
							content: pgComment.content,
							parentCommentId: pgComment.parent_id || null,
							rootCommentId: null, // Will be calculated later if needed
							path: '', // Will be calculated later if needed
							depth: 0,
							upvoteCount: pgComment.likes || 0,
							downvoteCount: 0,
							isDeleted: false,
							createdAt: pgComment.created_at || new Date(),
							updatedAt: pgComment.updated_at || new Date()
						}

						await this.mongoDb.collection('novel-comments').insertOne(mongoComment)
						migrated++
					} catch (error) {
						console.error(`❌ Failed to migrate comment ${pgComment.id}:`, error)
						failed++
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

		console.log(`✅ Comments migration completed: ${migrated} migrated, ${failed} failed`)
		return { total, migrated, failed }
	}

	/**
	 * Parse roles from JSON or array
	 */
	private parseRoles(roles: any): string[] {
		if (!roles) return ['user']
		
		if (Array.isArray(roles)) return roles
		
		if (typeof roles === 'string') {
			try {
				const parsed = JSON.parse(roles)
				return Array.isArray(parsed) ? parsed : ['user']
			} catch {
				return ['user']
			}
		}
		
		return ['user']
	}

	/**
	 * Clean up connections
	 */
	async cleanup(): Promise<void> {
		try {
			if (this.pgClient) {
				await this.pgClient.end()
				console.log('✅ PostgreSQL connection closed')
			}
			
			if (this.mongoClient) {
				await this.mongoClient.close()
				console.log('✅ MongoDB connection closed')
			}
		} catch (error) {
			console.error('❌ Error during cleanup:', error)
		}
	}
}

