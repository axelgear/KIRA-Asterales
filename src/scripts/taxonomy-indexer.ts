#!/usr/bin/env tsx

/**
 * Taxonomy Indexer Script
 * 
 * This script indexes all existing tags and genres from MongoDB into Elasticsearch
 * Run this after setting up the taxonomy indices for fast listing
 */

import { databaseManager } from '../infrastructure/database.js'
import { elasticsearchManager } from '../infrastructure/elasticsearch.js'
import { TaxonomySearchService } from '../services/TaxonomySearchService.js'
import { NovelTagModel } from '../infrastructure/models/NovelTag.js'
import { NovelGenreModel } from '../infrastructure/models/NovelGenre.js'

async function indexAllTaxonomy() {
  console.log('🚀 Starting Elasticsearch indexing for all taxonomy...')
  
  try {
    // Connect to MongoDB using existing manager
    await databaseManager.connect()
    console.log('✅ Connected to MongoDB via DatabaseManager')
    
    // Connect to Elasticsearch using existing manager
    await elasticsearchManager.connect()
    console.log('✅ Connected to Elasticsearch via ElasticsearchManager')
    
    // Index Tags
    console.log('🏷️ Indexing tags...')
    await TaxonomySearchService.ensureTagIndex()
    const tags = await NovelTagModel.find({}).lean()
    console.log(`📊 Found ${tags.length} tags to index`)
    
    if (tags.length > 0) {
      await TaxonomySearchService.bulkIndexTags(tags)
      console.log(`✅ Indexed ${tags.length} tags`)
    }
    
    // Index Genres
    console.log('🎭 Indexing genres...')
    await TaxonomySearchService.ensureGenreIndex()
    const genres = await NovelGenreModel.find({}).lean()
    console.log(`📊 Found ${genres.length} genres to index`)
    
    if (genres.length > 0) {
      await TaxonomySearchService.bulkIndexGenres(genres)
      console.log(`✅ Indexed ${genres.length} genres`)
    }
    
    console.log('🎉 Taxonomy indexing completed!')
    
    // Test listing
    console.log('🧪 Testing taxonomy listing functionality...')
    const tagResult = await TaxonomySearchService.listTags(1, 5)
    const genreResult = await TaxonomySearchService.listGenres(1, 5)
    
    if (tagResult) {
      console.log(`   🏷️ Tag listing test returned ${tagResult.items.length} results`)
    }
    if (genreResult) {
      console.log(`   🎭 Genre listing test returned ${genreResult.items.length} results`)
    }
    
  } catch (error) {
    console.error('💥 Taxonomy indexing failed:', error)
    process.exit(1)
  } finally {
    // Cleanup - disconnect managers
    try {
      await databaseManager.disconnect()
      await elasticsearchManager.disconnect()
      console.log('✅ Connections closed')
    } catch (error) {
      console.warn('⚠️ Error during cleanup:', error)
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  indexAllTaxonomy()
}

export { indexAllTaxonomy } 