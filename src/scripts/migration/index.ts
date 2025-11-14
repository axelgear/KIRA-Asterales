#!/usr/bin/env node

/**
 * PostgreSQL to MongoDB Migration Script
 * 
 * Usage: pnpm run migrate:novels
 * 
 * This script migrates novels and chapters from the old PostgreSQL database
 * to the new MongoDB database with proper data transformation.
 */

import { NovelMigrator } from './migrator.js'
import { TaxonomyMigrator } from './taxonomy-migrator.js'
import type { MigrationConfig, DatabaseConfig } from './types.js'
import { getGenreMappingStats } from './genre-mapper.js'
import { MongoClient } from 'mongodb'

// Default configuration
const defaultConfig: MigrationConfig = {
  batchSize: parseInt(process.env.MIGRATION_BATCH_SIZE || '10'),
  maxNovels: parseInt(process.env.MIGRATION_MAX_NOVELS || '100'),
  skipExisting: process.env.MIGRATION_SKIP_EXISTING === 'true',
  dryRun: process.env.MIGRATION_DRY_RUN === 'true',
  validateData: process.env.MIGRATION_VALIDATE_DATA === 'true',
  createIndexes: process.env.MIGRATION_CREATE_INDEXES === 'true',
  elasticsearchIndex: process.env.ES_ENABLED === 'true',
  skipTaxonomy: process.env.MIGRATION_SKIP_TAXONOMY === 'true',
  rebuildIndicesAfterMigration: process.env.MIGRATION_REBUILD_INDICES === 'true'
}

// Database configuration - modify these values
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

// Standalone function to rebuild indices for existing data
async function rebuildIndicesForExistingData() {
  try {
    console.log('🔨 Rebuilding Elasticsearch indices for existing data...')
    
    const migrator = new NovelMigrator({
      ...defaultConfig,
      elasticsearchIndex: true,
      maxNovels: 0
    }, dbConfig)
    
    await migrator.initialize()
    await migrator.rebuildIndicesForExistingData()
    await migrator.cleanup()
    
    console.log('✅ Index rebuilding completed!')
  } catch (error) {
    console.error('❌ Index rebuilding failed:', error)
    process.exit(1)
  }
}

async function main() {
  try {
    console.log('🚀 PostgreSQL to MongoDB Migration Tool')
    console.log('=====================================')
    
    // Show genre mapping statistics
    console.log('\n📋 Genre Mapping Statistics:')
    const genreStats = getGenreMappingStats()
    console.log(`Total Original Genres: ${genreStats.totalOriginalGenres}`)
    console.log(`Total Unique Genres: ${genreStats.totalUniqueGenres}`)
    console.log(`Mapping Efficiency: ${genreStats.mappingEfficiency}`)
    console.log(`Tags: Will be migrated first, then novels will use tag/genre IDs`)
    
    // Show configuration
    console.log('\n⚙️  Configuration:')
    console.log('Batch Size:', defaultConfig.batchSize)
    console.log('Max Novels:', defaultConfig.maxNovels)
    console.log('Skip Existing:', defaultConfig.skipExisting)
    console.log('Dry Run:', defaultConfig.dryRun)
    console.log('Create Indexes:', defaultConfig.createIndexes)
    console.log('Elasticsearch Indexing:', defaultConfig.elasticsearchIndex)
    console.log('Rebuild Indices After Migration:', defaultConfig.rebuildIndicesAfterMigration)
    
    // Show database configs
    console.log('\n🗄️  Database Configuration:')
    console.log('PostgreSQL:', `${dbConfig.postgres.host}:${dbConfig.postgres.port}/${dbConfig.postgres.database}?schema=${dbConfig.postgres.schema}`)
    console.log('MongoDB:', `${dbConfig.mongodb.uri}/${dbConfig.mongodb.database}`)
    
    // Ask for confirmation
    console.log('\n⚠️  WARNING: This will migrate data to MongoDB!')
    console.log('Make sure you have backed up your data.')
    
    // Declare taxonomy mappings at function level
    let tagMappings: Record<string, number> = {}
    let genreMappings: Record<string, number> = {}
    
    // Step 1: Migrate taxonomy (tags and genres) - optional
    if (!defaultConfig.skipTaxonomy) {
      console.log('\n🔄 Step 1: Migrating taxonomy (tags and genres)...')
      const taxonomyMigrator = new TaxonomyMigrator(dbConfig)
      await taxonomyMigrator.initialize()
      
      const tagResult = await taxonomyMigrator.migrateTags()
      if (!tagResult.success && tagResult.details?.tagsMigrated === 0 && Object.keys(tagResult.details?.tagMappings || {}).length === 0) {
        throw new Error(`Tag migration failed: ${tagResult.message}`)
      }
      
      const genreResult = await taxonomyMigrator.migrateGenres()
      if (!genreResult.success && genreResult.details?.genresMigrated === 0 && Object.keys(genreResult.details?.genreMappings || {}).length === 0) {
        throw new Error(`Genre migration failed: ${genreResult.message}`)
      }
      
      // Get taxonomy mappings
      tagMappings = await taxonomyMigrator.getTagMappings()
      genreMappings = await taxonomyMigrator.getGenreMappings()
      
      console.log(`✅ Taxonomy migration completed:`)
      console.log(`   Tags: ${tagResult.details?.tagsMigrated || 0} migrated, ${Object.keys(tagResult.details?.tagMappings || {}).length} total available`)
      console.log(`   Genres: ${genreResult.details?.genresMigrated || 0} migrated, ${Object.keys(genreResult.details?.genreMappings || {}).length} total available`)
      
      await taxonomyMigrator.cleanup()
    } else {
      console.log('\n⏭️  Skipping taxonomy migration (using existing data)...')
      
      // Get existing taxonomy mappings from MongoDB
      const mongoClient = new MongoClient(dbConfig.mongodb.uri)
      await mongoClient.connect()
      const mongoDb = mongoClient.db(dbConfig.mongodb.database)
      
      // Get existing tags
      const existingTags = await mongoDb.collection('novel-tags').find({}).toArray()
      existingTags.forEach(tag => {
        if (tag.names?.en) {
          tagMappings[tag.names.en] = tag.tagId
        } else if (tag.slug) {
          tagMappings[tag.slug] = tag.tagId
        }
      })
      
      // Get existing genres
      const existingGenres = await mongoDb.collection('novel-genres').find({}).toArray()
      existingGenres.forEach(genre => {
        if (genre.names?.en) {
          genreMappings[genre.names.en] = genre.genreId
        } else if (genre.slug) {
          genreMappings[genre.slug] = genre.genreId
        }
      })
      
      console.log(`📊 Found existing taxonomy:`)
      console.log(`   Tags: ${Object.keys(tagMappings).length} available`)
      console.log(`   Genres: ${Object.keys(genreMappings).length} available`)
      
      await mongoClient.close()
    }
    
    // Step 2: Migrate novels using taxonomy mappings
    console.log('\n🔄 Step 2: Migrating novels with taxonomy mappings...')
    const migrator = new NovelMigrator(defaultConfig, dbConfig)
    
    // Set the taxonomy mappings
    migrator.setTaxonomyMappings(tagMappings, genreMappings)
    
    // Run migration
    await migrator.initialize()
    
    const result = await migrator.migrate()
    
    if (result.success) {
      console.log('\n✅ Migration completed successfully!')
      if (result.details) {
        console.log(`📊 Results:`)
        console.log(`   Novels: ${result.details.novelsMigrated}`)
        console.log(`   Chapters: ${result.details.chaptersMigrated}`)
        console.log(`   Errors: ${result.details.errors.length}`)
        console.log(`   Warnings: ${result.details.warnings.length}`)
      }
      
      // Validate if requested
      if (defaultConfig.validateData) {
        await migrator.validateMigration()
      }
      
      // Rebuild all Elasticsearch indices after migration if requested
      if (defaultConfig.rebuildIndicesAfterMigration && defaultConfig.elasticsearchIndex) {
        console.log('\n🔄 Rebuilding all Elasticsearch indices after migration...')
        
        // If maxNovels is 0, we're only rebuilding indices for existing data
        if (defaultConfig.maxNovels === 0) {
          console.log('📊 Rebuilding indices for existing data (no migration performed)...')
          await migrator.rebuildIndicesForExistingData()
        } else {
          await migrator.rebuildAllIndices()
        }
      } else if (defaultConfig.maxNovels === 0 && defaultConfig.elasticsearchIndex) {
        // Special case: maxNovels=0 but Elasticsearch is enabled
        // This means we want to rebuild indices for existing data
        console.log('\n🔄 Max novels is 0 but Elasticsearch is enabled - rebuilding indices for existing data...')
        await migrator.rebuildIndicesForExistingData()
      }
      
    } else {
      console.log('\n❌ Migration failed!')
      console.log('Error:', result.message)
    }
    
    // Cleanup
    await migrator.cleanup()
    
  } catch (error) {
    console.error('\n💥 Migration script failed:', error)
    process.exit(1)
  }
}

// Handle command line arguments
function parseArgs() {
  const args = process.argv.slice(2)
  
  for (const arg of args) {
    if (arg === '--dry-run') {
      defaultConfig.dryRun = true
      console.log('🔍 Dry run mode enabled')
    } else if (arg === '--max-novels') {
      const index = args.indexOf(arg)
      if (index + 1 < args.length) {
        const value = parseInt(args[index + 1] || '0')
        if (!isNaN(value)) {
          defaultConfig.maxNovels = value
          console.log(`📚 Max novels set to ${value}`)
        }
      }
    } else if (arg === '--batch-size') {
      const index = args.indexOf(arg)
      if (index + 1 < args.length) {
        const value = parseInt(args[index + 1] || '0')
        if (!isNaN(value)) {
          defaultConfig.batchSize = value
          console.log(`📦 Batch size set to ${value}`)
        }
      }
    } else if (arg === '--skip-taxonomy') {
      defaultConfig.skipTaxonomy = true
      console.log('⏭️  Skipping taxonomy migration (using existing data)')
    } else if (arg === '--rebuild-indices') {
      defaultConfig.rebuildIndicesAfterMigration = true
      console.log('🔨 Will rebuild all Elasticsearch indices after migration completion')
    } else if (arg === '--rebuild-only') {
      console.log('🔨 Rebuilding indices for existing data only (no migration)...')
      rebuildIndicesForExistingData()
      return
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: pnpm run migrate:novels [options]

Options:
  --dry-run              Run without actually migrating data
  --max-novels <number>  Maximum number of novels to migrate (default: 100)
  --batch-size <number>  Number of novels to process per batch (default: 10)
  --skip-taxonomy        Skip taxonomy migration (use existing tags/genres)
  --rebuild-indices      Rebuild all Elasticsearch indices after migration
  --rebuild-only         Rebuild indices for existing data only (no migration)
  --help, -h            Show this help message

Environment Variables:
  PG_HOST               PostgreSQL host (default: localhost)
  PG_PORT               PostgreSQL port (default: 5432)
  PG_DATABASE           PostgreSQL database name (default: novel_api)
  PG_USERNAME           PostgreSQL username (default: postgres)
  PG_PASSWORD           PostgreSQL password
  PG_SSL                Enable SSL (default: false)
  
  MONGO_URI             MongoDB connection URI (default: mongodb://localhost:27017)
  MONGO_DATABASE        MongoDB database name (default: kira_asterales)
  
  ES_ENABLED            Enable Elasticsearch indexing (default: false)
  ES_NODES              Elasticsearch nodes (comma-separated, default: localhost:9200)
  ES_USERNAME           Elasticsearch username (default: elastic)
  ES_PASSWORD           Elasticsearch password
  
  MIGRATION_SKIP_TAXONOMY  Skip taxonomy migration if true (default: false)
  MIGRATION_REBUILD_INDICES  Rebuild all indices after migration if true (default: true)
      `)
      process.exit(0)
    }
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  parseArgs()
  main()
} 