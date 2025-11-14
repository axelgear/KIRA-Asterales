#!/usr/bin/env tsx

/**
 * Export Tags and Genres from PostgreSQL
 * 
 * This script exports all tags and genres from PostgreSQL to JSON files
 * for analysis and migration planning.
 * 
 * Usage: pnpm run export:taxonomy
 */

import { Client } from 'pg'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { PgTag, PgGenre, DatabaseConfig } from './types.js'

// Database configuration - uses same env vars as migration
const dbConfig: DatabaseConfig = {
  postgres: {
    host: process.env.PG_HOST || '',
    port: parseInt(process.env.PG_PORT || ''),
    database: process.env.PG_DATABASE || '',
    username: process.env.PG_USERNAME || '',
    password: process.env.PG_PASSWORD || '',
    ssl: process.env.PG_SSL === '',
    schema: process.env.PG_SCHEMA || ''
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

class TaxonomyExporter {
  private pgClient: Client | null = null

  constructor(private dbConfig: DatabaseConfig) {}

  /**
   * Initialize PostgreSQL connection
   */
  async initialize(): Promise<void> {
    try {
      console.log('🔌 Connecting to PostgreSQL...')
      console.log(`   Host: ${this.dbConfig.postgres.host}:${this.dbConfig.postgres.port}`)
      console.log(`   Database: ${this.dbConfig.postgres.database}`)
      console.log(`   Schema: ${this.dbConfig.postgres.schema}`)

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

    } catch (error) {
      console.error('❌ Failed to connect to PostgreSQL:', error)
      throw error
    }
  }

  /**
   * Get all tags from PostgreSQL
   */
  async getTags(): Promise<PgTag[]> {
    if (!this.pgClient) throw new Error('PostgreSQL client not initialized')

    console.log('📋 Fetching tags from PostgreSQL...')
    const query = `
      SELECT 
        id,
        name,
        count,
        description
      FROM "${this.dbConfig.postgres.schema}".tags 
      ORDER BY id
    `
    const result = await this.pgClient.query(query)
    console.log(`✅ Found ${result.rows.length} tags`)
    return result.rows
  }

  /**
   * Get all genres from PostgreSQL
   */
  async getGenres(): Promise<PgGenre[]> {
    if (!this.pgClient) throw new Error('PostgreSQL client not initialized')

    console.log('📋 Fetching genres from PostgreSQL...')
    const query = `
      SELECT 
        id,
        name,
        count,
        description
      FROM "${this.dbConfig.postgres.schema}".genres 
      ORDER BY id
    `
    const result = await this.pgClient.query(query)
    console.log(`✅ Found ${result.rows.length} genres`)
    return result.rows
  }

  /**
   * Get tag usage statistics
   */
  async getTagUsageStats(): Promise<any[]> {
    if (!this.pgClient) throw new Error('PostgreSQL client not initialized')

    console.log('📊 Fetching tag usage statistics...')
    const query = `
      SELECT 
        t.id,
        t.name,
        t.count,
        COUNT(DISTINCT nt.novel_id) as novel_count,
        COUNT(DISTINCT c.id) as chapter_count
      FROM "${this.dbConfig.postgres.schema}".tags t
      LEFT JOIN "${this.dbConfig.postgres.schema}".novel_tags nt ON t.id = nt.tag_id
      LEFT JOIN "${this.dbConfig.postgres.schema}".chapters c ON nt.novel_id = c.novel_id
      GROUP BY t.id, t.name, t.count
      ORDER BY novel_count DESC, t.count DESC
    `
    const result = await this.pgClient.query(query)
    console.log(`✅ Generated usage stats for ${result.rows.length} tags`)
    return result.rows
  }

  /**
   * Get genre usage statistics
   */
  async getGenreUsageStats(): Promise<any[]> {
    if (!this.pgClient) throw new Error('PostgreSQL client not initialized')

    console.log('📊 Fetching genre usage statistics...')
    const query = `
      SELECT 
        g.id,
        g.name,
        g.count,
        COUNT(DISTINCT ng.novel_id) as novel_count,
        COUNT(DISTINCT c.id) as chapter_count
      FROM "${this.dbConfig.postgres.schema}".genres g
      LEFT JOIN "${this.dbConfig.postgres.schema}".novel_genres ng ON g.id = ng.genre_id
      LEFT JOIN "${this.dbConfig.postgres.schema}".chapters c ON ng.novel_id = c.novel_id
      GROUP BY g.id, g.name, g.count
      ORDER BY novel_count DESC, g.count DESC
    `
    const result = await this.pgClient.query(query)
    console.log(`✅ Generated usage stats for ${result.rows.length} genres`)
    return result.rows
  }

  /**
   * Export data to JSON files
   */
  async exportToJson(): Promise<void> {
    try {
      // Create export directory
      const exportDir = join(process.cwd(), 'exports')
      mkdirSync(exportDir, { recursive: true })

      console.log('📁 Export directory created:', exportDir)

      // Export tags
      const tags = await this.getTags()
      const tagStats = await this.getTagUsageStats()
      
      const tagExport = {
        metadata: {
          exportedAt: new Date().toISOString(),
          totalTags: tags.length,
          source: 'postgresql',
          schema: this.dbConfig.postgres.schema
        },
        tags: tags,
        usageStats: tagStats
      }

      writeFileSync(
        join(exportDir, 'tags-export.json'), 
        JSON.stringify(tagExport, null, 2)
      )
      console.log('✅ Tags exported to exports/tags-export.json')

      // Export genres
      const genres = await this.getGenres()
      const genreStats = await this.getGenreUsageStats()
      
      const genreExport = {
        metadata: {
          exportedAt: new Date().toISOString(),
          totalGenres: genres.length,
          source: 'postgresql',
          schema: this.dbConfig.postgres.schema
        },
        genres: genres,
        usageStats: genreStats
      }

      writeFileSync(
        join(exportDir, 'genres-export.json'), 
        JSON.stringify(genreExport, null, 2)
      )
      console.log('✅ Genres exported to exports/genres-export.json')

      // Export summary
      const summary = {
        exportedAt: new Date().toISOString(),
        tags: {
          total: tags.length,
          withUsage: tagStats.filter(t => t.novel_count > 0).length,
          topUsed: tagStats.slice(0, 10).map(t => ({
            name: t.name,
            novelCount: t.novel_count,
            chapterCount: t.chapter_count
          }))
        },
        genres: {
          total: genres.length,
          withUsage: genreStats.filter(g => g.novel_count > 0).length,
          topUsed: genreStats.slice(0, 10).map(g => ({
            name: g.name,
            novelCount: g.novel_count,
            chapterCount: g.chapter_count
          }))
        }
      }

      writeFileSync(
        join(exportDir, 'taxonomy-summary.json'), 
        JSON.stringify(summary, null, 2)
      )
      console.log('✅ Summary exported to exports/taxonomy-summary.json')

      // Print summary to console
      console.log('\n📊 Export Summary:')
      console.log(`   Tags: ${tags.length} total, ${tagStats.filter(t => t.novel_count > 0).length} with usage`)
      console.log(`   Genres: ${genres.length} total, ${genreStats.filter(g => g.novel_count > 0).length} with usage`)
      
      console.log('\n🏆 Top 5 Most Used Tags:')
      tagStats.slice(0, 5).forEach((tag, index) => {
        console.log(`   ${index + 1}. ${tag.name} (${tag.novel_count} novels, ${tag.chapter_count} chapters)`)
      })

      console.log('\n🏆 Top 5 Most Used Genres:')
      genreStats.slice(0, 5).forEach((genre, index) => {
        console.log(`   ${index + 1}. ${genre.name} (${genre.novel_count} novels, ${genre.chapter_count} chapters)`)
      })

    } catch (error) {
      console.error('❌ Failed to export data:', error)
      throw error
    }
  }

  /**
   * Cleanup connections
   */
  async cleanup(): Promise<void> {
    if (this.pgClient) {
      await this.pgClient.end()
      console.log('✅ PostgreSQL connection closed')
    }
  }
}

async function main() {
  const exporter = new TaxonomyExporter(dbConfig)
  
  try {
    console.log('🚀 PostgreSQL Taxonomy Export Tool')
    console.log('==================================')
    
    // Show configuration
    console.log('\n⚙️  Configuration:')
    console.log('PostgreSQL:', `${dbConfig.postgres.host}:${dbConfig.postgres.port}/${dbConfig.postgres.database}`)
    console.log('Schema:', dbConfig.postgres.schema)
    
    await exporter.initialize()
    await exporter.exportToJson()
    
    console.log('\n🎉 Export completed successfully!')
    console.log('📁 Check the "exports" directory for the exported files.')
    
  } catch (error) {
    console.error('\n💥 Export failed:', error)
    process.exit(1)
  } finally {
    await exporter.cleanup()
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { TaxonomyExporter } 