/**
 * PostgreSQL to MongoDB Migration Script
 * 
 * This script migrates novels and chapters from the old PostgreSQL database
 * to the new MongoDB database with proper data transformation.
 */

import { Client } from 'pg'
import { MongoClient } from 'mongodb'
import { randomUUID } from 'node:crypto'
import { mapGenres } from './genre-mapper.js'
import { elasticsearchManager } from '../../infrastructure/elasticsearch.js'
import { NovelSearchService } from '../../services/NovelSearchService.js'
import { ChapterListSearchService } from '../../services/ChapterListSearchService.js'
import type { 
  PgNovel, 
  PgChapter, 
  MongoNovel, 
  MongoChapter, 
  MigrationResult, 
  MigrationProgress,
  MigrationConfig,
  DatabaseConfig
} from './types.js'

export class NovelMigrator {
  private pgClient: Client | null = null
  private mongoClient: MongoClient | null = null
  private mongoDb: any = null
  private config: MigrationConfig
  private dbConfig: DatabaseConfig
  private tagMappings: Record<string, number> = {}
  private genreMappings: Record<string, number> = {}
  // In-memory lookup built from Mongo taxonomy to resolve genres quickly
  private genreLookupByName: Map<string, number> = new Map()
  private genreLookupBySlug: Map<string, number> = new Map()

  constructor(config: MigrationConfig, dbConfig: DatabaseConfig) {
    this.config = config
    this.dbConfig = dbConfig
  }

  /**
   * Set taxonomy mappings (must be called before migration)
   */
  setTaxonomyMappings(tagMappings: Record<string, number>, genreMappings: Record<string, number>): void {
    this.tagMappings = tagMappings
    this.genreMappings = genreMappings
  }

  /**
   * Initialize database connections
   */
  async initialize(): Promise<void> {
    try {
      // Connect to PostgreSQL
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

      // Connect to MongoDB
      this.mongoClient = new MongoClient(this.dbConfig.mongodb.uri)
      await this.mongoClient.connect()
      this.mongoDb = this.mongoClient.db(this.dbConfig.mongodb.database)
      console.log('✅ Connected to MongoDB')

      // Create indexes if requested
      if (this.config.createIndexes) {
        await this.createMongoIndexes()
      }

      // Optionally connect to Elasticsearch
      if (this.config.elasticsearchIndex) {
        await elasticsearchManager.connect()
        await NovelSearchService.ensureIndex()
        await ChapterListSearchService.ensureIndex()
        console.log('✅ Connected to Elasticsearch and ensured indices')
      }

      // Build genre lookup from taxonomy (names.en and slug -> genreId)
      try {
        const genres = await this.mongoDb.collection('novel-genres').find({}).project({ genreId: 1, slug: 1, names: 1 }).toArray()
        for (const g of genres) {
          const id = Number(g.genreId)
          if (!Number.isFinite(id)) continue
          const name: string | undefined = g?.names?.en
          const slug: string | undefined = g?.slug
          if (name && typeof name === 'string') {
            const key = name.trim().toLowerCase()
            if (!this.genreLookupByName.has(key) || (this.genreLookupByName.get(key)! > id)) {
              this.genreLookupByName.set(key, id)
            }
          }
          if (slug && typeof slug === 'string') {
            const sKey = slug.trim().toLowerCase()
            if (!this.genreLookupBySlug.has(sKey) || (this.genreLookupBySlug.get(sKey)! > id)) {
              this.genreLookupBySlug.set(sKey, id)
            }
          }
        }
        console.log(`✅ Genre lookup built: ${this.genreLookupByName.size} names, ${this.genreLookupBySlug.size} slugs`)
      } catch (e) {
        console.warn('⚠️ Failed to build genre lookup; migration will rely on provided mappings only', e)
      }

    } catch (error) {
      console.error('❌ Failed to initialize connections:', error)
      throw error
    }
  }

  /**
   * Create MongoDB indexes for better performance
   */
  private async createMongoIndexes(): Promise<void> {
    try {
      const novelsCollection = this.mongoDb.collection('novels')
      const chaptersCollection = this.mongoDb.collection('chapters')

      // Novel indexes
      await novelsCollection.createIndex({ novelId: 1 }, { unique: true })
      await novelsCollection.createIndex({ uuid: 1 }, { unique: true })
      await novelsCollection.createIndex({ slug: 1 }, { unique: true })
      await novelsCollection.createIndex({ ownerUserId: 1 })
      await novelsCollection.createIndex({ tagIds: 1 })
      await novelsCollection.createIndex({ genreIds: 1 })
      await novelsCollection.createIndex({ source: 1 }) // Index for source field
      await novelsCollection.createIndex({ status: 1 })
      await novelsCollection.createIndex({ updatedAt: -1 })
      await novelsCollection.createIndex({ favoritesCount: -1, updatedAt: -1 })
      await novelsCollection.createIndex({ upvoteCount: -1, updatedAt: -1 })

      // Chapter indexes
      await chaptersCollection.createIndex({ chapterId: 1 }, { unique: true })
      await chaptersCollection.createIndex({ uuid: 1 }, { unique: true })
      await chaptersCollection.createIndex({ novelId: 1, sequence: 1 }, { unique: true })
      await chaptersCollection.createIndex({ novelUuid: 1 })
      await chaptersCollection.createIndex({ novelId: 1, updatedAt: -1 })

      console.log('✅ MongoDB indexes created')
    } catch (error) {
      console.error('❌ Failed to create indexes:', error)
      throw error
    }
  }

  /**
   * Get novels from PostgreSQL (only published ones)
   */
  private async getPgNovels(limit: number, offset: number): Promise<PgNovel[]> {
    if (!this.pgClient) throw new Error('PostgreSQL client not initialized')

    const query = `
      SELECT * FROM "${this.dbConfig.postgres.schema}".novels 
      WHERE deleted_at IS NULL AND published = true
      ORDER BY id 
      LIMIT $1 OFFSET $2
    `
    const result = await this.pgClient.query(query, [limit, offset])
    return result.rows
  }

  /**
   * Get chapters for a novel from PostgreSQL
   */
  private async getPgChapters(novelId: number): Promise<PgChapter[]> {
    if (!this.pgClient) throw new Error('PostgreSQL client not initialized')

    const query = `
      SELECT * FROM "${this.dbConfig.postgres.schema}".chapters 
      WHERE novel_id = $1 
      ORDER BY chapter_number, id
    `
    const result = await this.pgClient.query(query, [novelId])
    return result.rows
  }

  /**
   * Transform PostgreSQL novel to MongoDB novel
   */
  private transformNovel(pgNovel: PgNovel): MongoNovel {
    // Parse JSON fields
    const tags = Array.isArray(pgNovel.tags) ? pgNovel.tags : []
    const genres = Array.isArray(pgNovel.genres) ? pgNovel.genres : []
    
    // Parse source field - ensure it's an array of numbers
    const source = Array.isArray(pgNovel.source) 
      ? pgNovel.source.filter(s => typeof s === 'number').map(s => Number(s))
      : []
    
    // Map status
    const statusMap: Record<string, string> = {
      'Ongoing': 'ongoing',
      'Completed': 'completed',
      'Hiatus': 'hiatus'
    }

    // Determine approval status based on published field
    const approvalStatus = pgNovel.published ? 'approved' : 'pending'

    // Convert tag names to tag IDs using mappings
    const tagIds = tags
      .map(tagName => this.tagMappings[tagName])
      .filter(id => id !== undefined)

    // Resolve genre IDs with priority:
    // 1) Exact name match in taxonomy
    // 2) Mapped name via genre-mapper.ts
    // 3) Slug-based lookup of mapped name
    const resolvedGenreIds: number[] = []
    const seen = new Set<number>()
    for (const rawName of genres) {
      if (!rawName || typeof rawName !== 'string') continue
      const nameKey = rawName.trim().toLowerCase()
      let id: number | undefined = this.genreLookupByName.get(nameKey) ?? this.genreMappings[rawName]
      if (id == null) {
        const mappedName = mapGenres([rawName])[0]
        if (mappedName) {
          const mappedKey = mappedName.trim().toLowerCase()
          id = this.genreLookupByName.get(mappedKey) ?? this.genreMappings[mappedName]
          if (id == null) {
            // try slug-style key (kebab-case)
            const slug = mappedName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
            id = this.genreLookupBySlug.get(slug)
          }
        }
      }
      if (typeof id === 'number' && Number.isFinite(id) && !seen.has(id)) {
        seen.add(id)
        resolvedGenreIds.push(id)
      }
    }
    // If no genres matched, attempt mapping-only set to catch cases where source provided only unmapped names
    if (resolvedGenreIds.length === 0 && Array.isArray(genres) && genres.length) {
      const mappedUnique = Array.from(new Set(mapGenres(genres)))
      for (const mapped of mappedUnique) {
        const mk = mapped.trim().toLowerCase()
        let id = this.genreLookupByName.get(mk) ?? this.genreMappings[mapped]
        if (id == null) {
          const slug = mapped.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
          id = this.genreLookupBySlug.get(slug)
        }
        if (typeof id === 'number' && Number.isFinite(id) && !seen.has(id)) {
          seen.add(id)
          resolvedGenreIds.push(id)
        }
      }
    }

    return {
      novelId: pgNovel.id,
      uuid: randomUUID(),
      ownerUserId: pgNovel.author_id || 1, // Default to user ID 1 if no author
      title: pgNovel.name,
      slug: pgNovel.slug,
      description: pgNovel.description || '',
      tagIds: tagIds, // Use tag IDs instead of tag names
      genreIds: resolvedGenreIds, // Use resolved genre IDs (deduped)
      status: statusMap[pgNovel.status] || 'ongoing',
      approvalStatus: approvalStatus, // Set based on published field
      coverImg: pgNovel.thumbnail || pgNovel.cover || '',
      language: 'en', // Default to English
      views: pgNovel.views || 0,
      favoritesCount: pgNovel.bookmarkcount || 0,
      chaptersCount: pgNovel.chaptercount || 0,
      wordCount: pgNovel.wordcount || 0, // Migrate word count from PostgreSQL
      upvoteCount: Math.floor((pgNovel.rating || 0) * 10), // Convert rating to upvotes
      downvoteCount: 0,
      source: source, // Copy source array from PostgreSQL
      // Initialize chapter info fields (will be populated after chapters are migrated)
      firstChapter: null,
      latestChapter: null,
      createdAt: pgNovel.created_at || new Date(),
      updatedAt: pgNovel.updated_at || new Date()
    }
  }

  /**
   * Transform PostgreSQL chapter to MongoDB chapter
   */
  private transformChapter(pgChapter: PgChapter, novelUuid: string, sequence: number): MongoChapter {
    return {
      chapterId: pgChapter.id,
      uuid: randomUUID(),
      novelId: pgChapter.novel_id || 0,
      novelUuid,
      title: pgChapter.chapter_title,
      sequence,
      wordCount: pgChapter.content ? pgChapter.content.trim().split(/\s+/).length : 0,
      content: pgChapter.content || '',
      isPublished: true,
      publishedAt: pgChapter.created_at || new Date(),
      createdAt: pgChapter.created_at || new Date(),
      updatedAt: pgChapter.updated_at || new Date()
    }
  }

  /**
   * Populate firstChapter and latestChapter for a novel
   */
  private async populateChapterInfo(novelId: number, novelUuid: string): Promise<void> {
    try {
      // Get first and latest published chapters
      const [firstChapter, latestChapter] = await Promise.all([
        this.mongoDb.collection('chapters').findOne(
          { novelId, isPublished: true },
          { sort: { sequence: 1 }, projection: { uuid: 1, title: 1, sequence: 1 } }
        ),
        this.mongoDb.collection('chapters').findOne(
          { novelId, isPublished: true },
          { sort: { sequence: -1 }, projection: { uuid: 1, title: 1, sequence: 1 } }
        )
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
      await this.mongoDb.collection('novels').updateOne(
        { novelId },
        { 
          $set: { 
            firstChapter: firstChapterData,
            latestChapter: latestChapterData
          } 
        }
      )

      console.log(`📝 Chapter info populated for novel ${novelId}`)
    } catch (error) {
      console.error(`❌ Failed to populate chapter info for novel ${novelId}:`, error)
    }
  }

  /**
   * Migrate a single novel with its chapters (or update if exists)
   */
  private async migrateNovel(pgNovel: PgNovel): Promise<{ novel: MongoNovel; chapters: MongoChapter[] }> {
    try {
      // Check if novel already exists
        const existing = await this.mongoDb.collection('novels').findOne({ novelId: pgNovel.id })
      
        if (existing) {
        console.log(`📝 Novel ${pgNovel.id} exists, checking for updates...`)
        return await this.updateExistingNovel(pgNovel, existing)
      }

      // Transform novel
      const novel = this.transformNovel(pgNovel)
      
      // Get and transform chapters
      const pgChapters = await this.getPgChapters(pgNovel.id)
      const chapters = pgChapters.map((pgChapter, index) => 
        this.transformChapter(pgChapter, novel.uuid, index + 1)
      )

      // Insert novel
      if (!this.config.dryRun) {
        await this.mongoDb.collection('novels').insertOne(novel)
        console.log(`✅ Novel ${novel.novelId} migrated`)
      }

      // Insert chapters
      if (chapters.length > 0 && !this.config.dryRun) {
        await this.mongoDb.collection('chapters').insertMany(chapters)
        console.log(`✅ ${chapters.length} chapters migrated for novel ${novel.novelId}`)
        
        // Populate chapter info for the novel
        await this.populateChapterInfo(novel.novelId, novel.uuid)
      }

      return { novel, chapters }

    } catch (error) {
      console.error(`❌ Failed to migrate novel ${pgNovel.id}:`, error)
      throw error
    }
  }

  /**
   * Update existing novel with new data (chapters, views, word count)
   */
  private async updateExistingNovel(pgNovel: PgNovel, existingNovel: any): Promise<{ novel: MongoNovel; chapters: MongoChapter[] }> {
    try {
      const novelId = pgNovel.id
      const novelUuid = existingNovel.uuid

      // Get chapters from PostgreSQL
      const pgChapters = await this.getPgChapters(novelId)
      
      // Get existing chapters from MongoDB
      const existingChapters = await this.mongoDb.collection('chapters')
        .find({ novelId })
        .toArray()
      
      const existingChapterIds = new Set(existingChapters.map((ch: any) => ch.chapterId))
      
      // Find new chapters
      const newPgChapters = pgChapters.filter(ch => !existingChapterIds.has(ch.id))
      
      let newChapters: MongoChapter[] = []
      
      if (newPgChapters.length > 0) {
        console.log(`📚 Found ${newPgChapters.length} new chapters for novel ${novelId}`)
        
        // Transform new chapters
        newChapters = newPgChapters.map((pgChapter) => {
          // Find the correct sequence number
          const sequence = pgChapter.chapter_number || (existingChapters.length + newChapters.length + 1)
          return this.transformChapter(pgChapter, novelUuid, sequence)
        })
        
        // Insert new chapters
        if (!this.config.dryRun && newChapters.length > 0) {
          await this.mongoDb.collection('chapters').insertMany(newChapters)
          console.log(`✅ ${newChapters.length} new chapters added to novel ${novelId}`)
        }
      } else {
        console.log(`⏭️  No new chapters for novel ${novelId}`)
      }

      // Calculate total word count from all chapters
      const allChapters = await this.mongoDb.collection('chapters')
        .find({ novelId, isPublished: true })
        .toArray()
      
      const totalWordCount = allChapters.reduce((sum: number, ch: any) => sum + (ch.wordCount || 0), 0)
      
      // Update novel with new stats
      const updateData: any = {
        views: pgNovel.views || existingNovel.views || 0,
        wordCount: totalWordCount,
        chaptersCount: allChapters.length,
        updatedAt: new Date()
      }

      if (!this.config.dryRun) {
        await this.mongoDb.collection('novels').updateOne(
          { novelId },
          { $set: updateData }
        )
        
        // Update chapter info (firstChapter/latestChapter)
        await this.populateChapterInfo(novelId, novelUuid)
        
        console.log(`✅ Novel ${novelId} updated: views=${updateData.views}, wordCount=${updateData.wordCount}, chapters=${updateData.chaptersCount}`)
      }

      return { 
        novel: { ...existingNovel, ...updateData } as MongoNovel, 
        chapters: newChapters 
      }

    } catch (error) {
      console.error(`❌ Failed to update novel ${pgNovel.id}:`, error)
      throw error
    }
  }

  /**
   * Main migration method - processes novels one by one with individual indexing
   */
  async migrate(): Promise<MigrationResult> {
    try {
      console.log('🚀 Starting migration...')
      
      let totalNovels = 0
      let totalChapters = 0
      let migratedNovels = 0
      let migratedChapters = 0
      const errors: string[] = []
      const warnings: string[] = []

      // Get total count (only published novels)
      if (!this.pgClient) throw new Error('PostgreSQL client not initialized')
      const countResult = await this.pgClient.query(
        `SELECT COUNT(*) FROM "${this.dbConfig.postgres.schema}".novels WHERE deleted_at IS NULL AND published = true`
      )
      totalNovels = parseInt(countResult.rows[0].count)
      
      // If maxNovels is 0, we're only doing index rebuilding, not migration
      if (this.config.maxNovels === 0) {
        console.log(`📊 Found ${totalNovels} novels in PostgreSQL`)
        console.log('🔄 Max novels set to 0 - skipping migration, will only rebuild indices if requested')
        
        // If Elasticsearch indexing is enabled, we should rebuild indices
        if (this.config.elasticsearchIndex) {
          console.log('🔍 Elasticsearch indexing enabled - will rebuild indices after migration completion')
        }
        
        return {
          success: true,
          message: `Migration skipped (maxNovels=0). Found ${totalNovels} novels in PostgreSQL.`,
          details: {
            novelsMigrated: 0,
            chaptersMigrated: 0,
            tagsMigrated: 0,
            genresMigrated: 0,
            errors,
            warnings
          }
        }
      }
      
      const novelsToMigrate = Math.min(totalNovels, this.config.maxNovels)

      console.log(`📊 Found ${totalNovels} novels, migrating ${novelsToMigrate}`)
      console.log('🔄 Processing novels one by one with individual Elasticsearch indexing...')

      // Get all novels to migrate (we'll process them one by one)
      const pgNovels = await this.getPgNovels(novelsToMigrate, 0)
      
      for (let i = 0; i < pgNovels.length; i++) {
        const pgNovel = pgNovels[i]
        if (!pgNovel) {
          console.warn(`⚠️  Skipping undefined novel at index ${i}`)
          continue
        }
        
        const novelNumber = i + 1
        
        try {
          console.log(`\n📚 Processing novel ${novelNumber}/${novelsToMigrate}: ${pgNovel.name} (ID: ${pgNovel.id})`)
          
          // Migrate single novel with its chapters
          const { novel, chapters } = await this.migrateNovel(pgNovel)
          migratedNovels++
          migratedChapters += chapters.length
          
          console.log(`✅ Novel ${novel.novelId} migrated with ${chapters.length} chapters`)
          
          // Individual Elasticsearch indexing for this novel
          if (this.config.elasticsearchIndex) {
            try {
              console.log(`🔍 Indexing novel ${novel.novelId} in Elasticsearch...`)
              
              // Index the novel
              await NovelSearchService.indexNovel(novel)
              console.log(`✅ Novel ${novel.novelId} indexed in Elasticsearch`)
              
              // Index chapters for this novel
              if (chapters.length > 0) {
                console.log(`🔍 Indexing ${chapters.length} chapters for novel ${novel.novelId}...`)
                await ChapterListSearchService.rebuildNovel(novel.uuid, novel.novelId)
                console.log(`✅ Chapters indexed in Elasticsearch for novel ${novel.novelId}`)
              }
              
            } catch (e) {
              const idxErr = `Indexing to Elasticsearch failed for novel ${novel.novelId}: ${e}`
              warnings.push(idxErr)
              console.warn(`⚠️ ${idxErr}`)
            }
          }
          
          // Progress update
          const progress = ((migratedNovels / novelsToMigrate) * 100).toFixed(1)
          console.log(`📈 Progress: ${progress}% (${migratedNovels}/${novelsToMigrate})`)
          console.log(`📊 Total chapters migrated so far: ${migratedChapters}`)
          
          // Memory management: Clear any cached data between novels
          if (global.gc) {
            global.gc()
            console.log(`🧹 Memory cleaned up after novel ${novel.novelId}`)
          }
          
        } catch (error) {
          const errorMsg = `Failed to migrate novel ${pgNovel.id}: ${error}`
          errors.push(errorMsg)
          console.error(`❌ ${errorMsg}`)
          
          // Continue with next novel instead of stopping
          console.log(`⏭️  Continuing with next novel...`)
        }
      }

      console.log('\n🎉 Migration completed!')
      
      return {
        success: errors.length === 0,
        message: `Migration completed. ${migratedNovels} novels and ${migratedChapters} chapters migrated.`,
        details: {
          novelsMigrated: migratedNovels,
          chaptersMigrated: migratedChapters,
          tagsMigrated: 0, // Not implemented yet
          genresMigrated: 0, // Not implemented yet
          errors,
          warnings
        }
      }

    } catch (error) {
      console.error('❌ Migration failed:', error)
      return {
        success: false,
        message: `Migration failed: ${error}`,
        details: {
          novelsMigrated: 0,
          chaptersMigrated: 0,
          tagsMigrated: 0,
          genresMigrated: 0,
          errors: [error as string],
          warnings: []
        }
      }
    }
  }

  /**
   * Rebuild Elasticsearch indices for existing data (without migration)
   * This is useful when you already have data and just need to rebuild indices
   */
  async rebuildIndicesForExistingData(): Promise<void> {
    if (!this.config.elasticsearchIndex) {
      console.log('⚠️  Elasticsearch indexing disabled, skipping rebuild')
      return
    }

    try {
      console.log('\n🔨 Rebuilding Elasticsearch indices for existing data...')
      
      // Rebuild novel index
      console.log('📚 Rebuilding novel index...')
      const novelResult = await NovelSearchService.rebuildIndex()
      if (novelResult.success) {
        console.log(`✅ Novel index rebuilt with ${novelResult.indexed} novels`)
      } else {
        console.error('❌ Failed to rebuild novel index:', novelResult.error)
        return
      }

      // Rebuild chapter list indices for all novels
      console.log('📖 Rebuilding chapter list indices...')
      const novels = await this.mongoDb.collection('novels').find({}).project({ uuid: 1, novelId: 1 }).toArray()
      let chapterIndexed = 0
      let chapterFailed = 0

      console.log(`📊 Found ${novels.length} novels to rebuild chapter indices for...`)

      for (const novel of novels) {
        try {
          await ChapterListSearchService.rebuildNovel(novel.uuid, novel.novelId)
          chapterIndexed++
          
          // Progress update for large datasets
          if (chapterIndexed % 100 === 0) {
            const progress = ((chapterIndexed / novels.length) * 100).toFixed(1)
            console.log(`📈 Chapter index progress: ${progress}% (${chapterIndexed}/${novels.length})`)
          }
        } catch (error) {
          console.error(`❌ Failed to rebuild chapter index for novel ${novel.uuid}:`, error)
          chapterFailed++
        }
      }

      console.log(`✅ Chapter indices rebuilt: ${chapterIndexed} successful, ${chapterFailed} failed`)
      console.log('🎉 Elasticsearch indices rebuild completed!')

    } catch (error) {
      console.error('❌ Failed to rebuild Elasticsearch indices:', error)
      throw error
    }
  }

  /**
   * Rebuild all Elasticsearch indices after migration completion
   * This is useful for large datasets to ensure consistency
   */
  async rebuildAllIndices(): Promise<void> {
    if (!this.config.elasticsearchIndex) {
      console.log('⚠️  Elasticsearch indexing disabled, skipping rebuild')
      return
    }

    try {
      console.log('\n🔨 Rebuilding all Elasticsearch indices...')
      
      // Rebuild novel index
      console.log('📚 Rebuilding novel index...')
      const novelResult = await NovelSearchService.rebuildIndex()
      if (novelResult.success) {
        console.log(`✅ Novel index rebuilt with ${novelResult.indexed} novels`)
      } else {
        console.error('❌ Failed to rebuild novel index:', novelResult.error)
      }

      // Rebuild chapter list indices for all novels
      console.log('📖 Rebuilding chapter list indices...')
      const novels = await this.mongoDb.collection('novels').find({}).project({ uuid: 1, novelId: 1 }).toArray()
      let chapterIndexed = 0
      let chapterFailed = 0

      for (const novel of novels) {
        try {
          await ChapterListSearchService.rebuildNovel(novel.uuid, novel.novelId)
          chapterIndexed++
          
          // Progress update for large datasets
          if (chapterIndexed % 10 === 0) {
            const progress = ((chapterIndexed / novels.length) * 100).toFixed(1)
            console.log(`📈 Chapter index progress: ${progress}% (${chapterIndexed}/${novels.length})`)
          }
        } catch (error) {
          console.error(`❌ Failed to rebuild chapter index for novel ${novel.uuid}:`, error)
          chapterFailed++
        }
      }

      console.log(`✅ Chapter indices rebuilt: ${chapterIndexed} successful, ${chapterFailed} failed`)
      console.log('🎉 Elasticsearch indices rebuild completed!')

    } catch (error) {
      console.error('❌ Failed to rebuild Elasticsearch indices:', error)
      throw error
    }
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

      // Disconnect ES if used
      if (this.config.elasticsearchIndex) {
        try { await elasticsearchManager.disconnect() } catch {}
      }
    } catch (error) {
      console.error('❌ Error during cleanup:', error)
    }
  }

  /**
   * Validate migrated data
   */
  async validateMigration(): Promise<void> {
    if (this.config.dryRun) {
      console.log('⚠️  Skipping validation in dry-run mode')
      return
    }

    try {
      console.log('🔍 Validating migrated data...')
      
      const novelsCount = await this.mongoDb.collection('novels').countDocuments()
      const chaptersCount = await this.mongoDb.collection('chapters').countDocuments()
      
      console.log(`📊 MongoDB contains ${novelsCount} novels and ${chaptersCount} chapters`)
      
      // Sample validation
      const sampleNovel = await this.mongoDb.collection('novels').findOne()
      if (sampleNovel) {
        console.log('✅ Sample novel structure:', {
          novelId: sampleNovel.novelId,
          title: sampleNovel.title,
          tagIds: sampleNovel.tagIds,
          genreIds: sampleNovel.genreIds,
          firstChapter: sampleNovel.firstChapter,
          latestChapter: sampleNovel.latestChapter
        })
      }
      
    } catch (error) {
      console.error('❌ Validation failed:', error)
    }
  }
} 