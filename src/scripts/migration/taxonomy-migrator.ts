/**
 * Taxonomy Migration Service
 * 
 * This service migrates tags and genres from PostgreSQL to MongoDB first,
 * then provides mappings for the novel migration.
 */

import { Client } from 'pg'
import { MongoClient } from 'mongodb'
import { randomUUID } from 'node:crypto'
import { mapGenres } from './genre-mapper.js'
import { NovelTagModel } from '../../infrastructure/models/NovelTag.js'
import { NovelGenreModel } from '../../infrastructure/models/NovelGenre.js'
import type { 
  PgTag, 
  PgGenre, 
  TagMigrationResult, 
  GenreMigrationResult,
  DatabaseConfig
} from './types.js'

export class TaxonomyMigrator {
  private pgClient: Client | null = null
  private mongoClient: MongoClient | null = null
  private mongoDb: any = null
  private dbConfig: DatabaseConfig

  constructor(dbConfig: DatabaseConfig) {
    this.dbConfig = dbConfig
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
      console.log('✅ Connected to PostgreSQL for taxonomy migration')

      // Connect to MongoDB
      this.mongoClient = new MongoClient(this.dbConfig.mongodb.uri)
      await this.mongoClient.connect()
      this.mongoDb = this.mongoClient.db(this.dbConfig.mongodb.database)
      console.log('✅ Connected to MongoDB for taxonomy migration')

    } catch (error) {
      console.error('❌ Failed to initialize taxonomy migration connections:', error)
      throw error
    }
  }

  /**
   * Get all tags from PostgreSQL
   */
  private async getPgTags(): Promise<PgTag[]> {
    if (!this.pgClient) throw new Error('PostgreSQL client not initialized')

    const query = `
      SELECT * FROM "${this.dbConfig.postgres.schema}".tags 
      ORDER BY id
    `
    const result = await this.pgClient.query(query)
    return result.rows
  }

  /**
   * Get all genres from PostgreSQL
   */
  private async getPgGenres(): Promise<PgGenre[]> {
    if (!this.pgClient) throw new Error('PostgreSQL client not initialized')

    const query = `
      SELECT * FROM "${this.dbConfig.postgres.schema}".genres 
      ORDER BY id
    `
    const result = await this.pgClient.query(query)
    return result.rows
  }

  /**
   * Transform PostgreSQL tag to MongoDB tag
   */
  private async transformTag(pgTag: PgTag) {
    // Generate base slug
    let slug = pgTag.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    
    // Handle empty slug case
    if (!slug) {
      slug = `tag-${pgTag.id}`
    }
    
    // Check for slug uniqueness and add suffix if needed
    let finalSlug = slug
    let counter = 1
    while (await this.mongoDb.collection('novel-tags').findOne({ slug: finalSlug })) {
      finalSlug = `${slug}-${counter}`
      counter++
    }
    
    return {
      tagId: pgTag.id,
      uuid: randomUUID(),
      slug: finalSlug,
      defaultLocale: 'en',
      names: { en: pgTag.name }, // Store name in English locale
      color: '#999999',
      description: pgTag.description || ''
    }
  }

  /**
   * Transform PostgreSQL genre to MongoDB genre (with mapping)
   */
  private async transformGenre(pgGenre: PgGenre) {
    // Apply genre mapping to get standardized name
    const mappedName = mapGenres([pgGenre.name])[0] || pgGenre.name
    
    // Generate base slug
    let slug = mappedName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    
    // Handle empty slug case
    if (!slug) {
      slug = `genre-${pgGenre.id}`
    }
    
    // Check for slug uniqueness and add suffix if needed
    let finalSlug = slug
    let counter = 1
    while (await this.mongoDb.collection('novel-genres').findOne({ slug: finalSlug })) {
      finalSlug = `${slug}-${counter}`
      counter++
    }
    
    return {
      genreId: pgGenre.id,
      uuid: randomUUID(),
      slug: finalSlug,
      defaultLocale: 'en',
      names: { en: mappedName }, // Store mapped name in English locale
      color: '#6666ff',
      description: pgGenre.description || ''
    }
  }

  /**
   * Migrate all tags
   */
  async migrateTags(): Promise<TagMigrationResult> {
    try {
      console.log('🏷️  Starting tag migration...')
      
      const pgTags = await this.getPgTags()
      console.log(`📊 Found ${pgTags.length} tags in PostgreSQL`)
      
      const tagMappings: Record<string, number> = {}
      let tagsMigrated = 0
      const errors: string[] = []
      const warnings: string[] = []

      for (const pgTag of pgTags) {
        try {
          // Check if tag already exists
          const existing = await this.mongoDb.collection('novel-tags').findOne({ tagId: pgTag.id })
          if (existing) {
            console.log(`⏭️  Tag ${pgTag.id} already exists, skipping`)
            tagMappings[pgTag.name] = existing.tagId
            continue
          }

          // Transform and insert tag
          const tag = await this.transformTag(pgTag)
          await this.mongoDb.collection('novel-tags').insertOne(tag)
          
          tagMappings[pgTag.name] = tag.tagId
          tagsMigrated++
          console.log(`✅ Tag ${tag.tagId} migrated: ${pgTag.name}`)

        } catch (error) {
          const errorMsg = `Failed to migrate tag ${pgTag.id}: ${error}`
          errors.push(errorMsg)
          console.error(errorMsg)
        }
      }

      console.log(`🎉 Tag migration completed: ${tagsMigrated} tags migrated`)
      
      return {
        success: true, // Always return success if we have mappings (even if 0 migrated)
        message: `Tag migration completed. ${tagsMigrated} tags migrated.`,
        details: {
          tagsMigrated,
          tagMappings,
          errors,
          warnings
        }
      }

    } catch (error) {
      console.error('❌ Tag migration failed:', error)
      return {
        success: false,
        message: `Tag migration failed: ${error}`,
        details: {
          tagsMigrated: 0,
          tagMappings: {},
          errors: [error as string],
          warnings: []
        }
      }
    }
  }

  /**
   * Migrate all genres
   */
  async migrateGenres(): Promise<GenreMigrationResult> {
    try {
      console.log('🎭 Starting genre migration...')
      
      const pgGenres = await this.getPgGenres()
      console.log(`📊 Found ${pgGenres.length} genres in PostgreSQL`)
      
      const genreMappings: Record<string, number> = {}
      let genresMigrated = 0
      const errors: string[] = []
      const warnings: string[] = []

      for (const pgGenre of pgGenres) {
        try {
          // Check if genre already exists
          const existing = await this.mongoDb.collection('novel-genres').findOne({ genreId: pgGenre.id })
          if (existing) {
            console.log(`⏭️  Genre ${pgGenre.id} already exists, skipping`)
            genreMappings[pgGenre.name] = existing.genreId
            continue
          }

          // Transform and insert genre
          const genre = await this.transformGenre(pgGenre)
          await this.mongoDb.collection('novel-genres').insertOne(genre)
          
          genreMappings[pgGenre.name] = genre.genreId
          genresMigrated++
          console.log(`✅ Genre ${genre.genreId} migrated: ${pgGenre.name}`)

        } catch (error) {
          const errorMsg = `Failed to migrate genre ${pgGenre.id}: ${error}`
          errors.push(errorMsg)
          console.error(errorMsg)
        }
      }

      console.log(`🎉 Genre migration completed: ${genresMigrated} genres migrated`)
      
      return {
        success: true, // Always return success if we have mappings (even if 0 migrated)
        message: `Genre migration completed. ${genresMigrated} genres migrated.`,
        details: {
          genresMigrated,
          genreMappings,
          errors,
          warnings
        }
      }

    } catch (error) {
      console.error('❌ Genre migration failed:', error)
      return {
        success: false,
        message: `Genre migration failed: ${error}`,
        details: {
          genresMigrated: 0,
          genreMappings: {},
          errors: [error as string],
          warnings: []
        }
      }
    }
  }

  /**
   * Get tag mappings (tag name -> tag ID)
   */
  async getTagMappings(): Promise<Record<string, number>> {
    const tags = await this.mongoDb.collection('novel-tags').find({}).toArray()
    const mappings: Record<string, number> = {}
    
    for (const tag of tags) {
      // Use the English name from the names map
      const tagName = tag.names?.en || tag.slug
      mappings[tagName] = tag.tagId
    }
    
    return mappings
  }

  /**
   * Get genre mappings (genre name -> genre ID)
   */
  async getGenreMappings(): Promise<Record<string, number>> {
    const genres = await this.mongoDb.collection('novel-genres').find({}).toArray()
    const mappings: Record<string, number> = {}
    
    for (const genre of genres) {
      // Use the English name from the names map
      const genreName = genre.names?.en || genre.slug
      mappings[genreName] = genre.genreId
    }
    
    return mappings
  }

  /**
   * Clean up connections
   */
  async cleanup(): Promise<void> {
    try {
      if (this.pgClient) {
        await this.pgClient.end()
        console.log('✅ PostgreSQL connection closed for taxonomy migration')
      }
      
      if (this.mongoClient) {
        await this.mongoClient.close()
        console.log('✅ MongoDB connection closed for taxonomy migration')
      }
    } catch (error) {
      console.error('❌ Error during taxonomy migration cleanup:', error)
    }
  }
} 