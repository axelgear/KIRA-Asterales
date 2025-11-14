#!/usr/bin/env tsx

/**
 * Elasticsearch Optimization Script
 * 
 * This script optimizes Elasticsearch settings for better caching and performance
 * Run this after setting up indices to improve response times
 */

import { elasticsearchManager } from '../infrastructure/elasticsearch.js'
import { ElasticsearchCacheService } from '../services/ElasticsearchCacheService.js'

async function optimizeElasticsearch() {
  console.log('🚀 Starting Elasticsearch optimization...')
  
  try {
    await elasticsearchManager.connect()
    console.log('✅ Connected to Elasticsearch')
    
    // Step 1: Optimize index settings
    console.log('\n📊 Step 1: Optimizing index settings...')
    await ElasticsearchCacheService.optimizeIndexSettings()
    
    // Step 2: Warm up caches with common queries
    console.log('\n🔥 Step 2: Warming up caches...')
    await ElasticsearchCacheService.warmupCaches()
    
    // Step 3: Show cache statistics
    console.log('\n📈 Step 3: Cache statistics...')
    const stats = await ElasticsearchCacheService.getCacheStats()
    if (stats) {
      console.log('Novels cache stats:', JSON.stringify(stats.novels, null, 2))
      console.log('Chapters cache stats:', JSON.stringify(stats.chapters, null, 2))
    }
    
    console.log('\n🎉 Elasticsearch optimization completed!')
    console.log('💡 Tips for better performance:')
    console.log('   - Keep request_cache: true in your queries')
    console.log('   - Use filter context for non-scoring queries')
    console.log('   - Limit _source fields to only what you need')
    console.log('   - Use routing for chapter queries')
    console.log('   - Run this script periodically to warm up caches')
    
  } catch (error) {
    console.error('💥 Elasticsearch optimization failed:', error)
    process.exit(1)
  } finally {
    try { await elasticsearchManager.disconnect() } catch {}
    console.log('✅ Connection closed')
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  optimizeElasticsearch()
}

export { optimizeElasticsearch } 