#!/usr/bin/env tsx

/**
 * Comprehensive Elasticsearch Indexer Script
 * 
 * This script indexes all existing novels and chapters from MongoDB into Elasticsearch
 * Run this when Elasticsearch becomes available after migration
 */

import { databaseManager } from '../infrastructure/database.js'
import { elasticsearchManager } from '../infrastructure/elasticsearch.js'
import { NovelSearchService } from '../services/NovelSearchService.js'
import { ChapterListSearchService } from '../services/ChapterListSearchService.js'
import { NovelModel } from '../infrastructure/models/Novel.js'

async function indexAllNovels() {
  console.log('🚀 Starting Elasticsearch indexing for all novels...')
  
  try {
    await databaseManager.connect()
    console.log('✅ Connected to MongoDB via DatabaseManager')
    
    await elasticsearchManager.connect()
    console.log('✅ Connected to Elasticsearch via ElasticsearchManager')
    
    await NovelSearchService.ensureIndex()
    console.log('✅ Elasticsearch novel index ensured')
    
    const novels = await NovelModel.find({}).lean()
    console.log(`📊 Found ${novels.length} novels to index`)
    
    if (novels.length === 0) {
      console.log('ℹ️ No novels found to index')
      return
    }
    
    const batchSize = 100
    let indexed = 0
    let errors = 0
    
    for (let i = 0; i < novels.length; i += batchSize) {
      const batch = novels.slice(i, i + batchSize)
      const batchNumber = Math.floor(i / batchSize) + 1
      const totalBatches = Math.ceil(novels.length / batchSize)
      
      console.log(`📝 Indexing batch ${batchNumber}/${totalBatches} (${batch.length} novels)`) 

      try {
        // Index novels in batch
        for (const novel of batch) {
          try {
            await NovelSearchService.indexNovel(novel)
            indexed++
          } catch (error) {
            console.error(`❌ Failed to index novel ${novel.novelId}:`, error)
            errors++
          }
        }
        
        // Progress update
        if (indexed % 1000 === 0 || batchNumber === totalBatches) {
          const progress = ((indexed / novels.length) * 100).toFixed(1)
          console.log(`📈 Progress: ${progress}% (${indexed}/${novels.length} novels indexed)`)
        }
        
        // Small delay between batches to prevent overwhelming ES
        if (i + batchSize < novels.length) {
          await new Promise(r => setTimeout(r, 50))
        }
        
      } catch (error) {
        console.error(`❌ Failed to index batch ${batchNumber}:`, error)
        errors += batch.length
      }
    }
    
    console.log('🎉 Novel indexing completed!')
    console.log(`   ✅ Successfully indexed: ${indexed} novels`)
    if (errors > 0) console.log(`   ❌ Errors: ${errors} novels`)
    
    // Test search functionality
    console.log('🧪 Testing novel search functionality...')
    try {
      const testResult = await NovelSearchService.search({ from: 0, size: 5, trackTotal: false })
      console.log(`   🔍 Search test returned ${testResult.items?.length || 0} results`)
    } catch (error) {
      console.warn('⚠️ Search test failed:', error)
    }
    
    return { indexed, errors }
    
  } catch (error) {
    console.error('💥 Novel indexing failed:', error)
    throw error
  }
}

async function indexAllChapters() {
  console.log('\n🚀 Starting Elasticsearch chapter indexing for all novels...')
  
  try {
    await ChapterListSearchService.ensureIndex()
    console.log('✅ Chapter list index ensured')
    
    const novels = await NovelModel.find({}).select('uuid novelId').lean()
    console.log(`📊 Found ${novels.length} novels to rebuild chapter indices for`)
    
    if (novels.length === 0) {
      console.log('ℹ️ No novels found to index chapters for')
      return { indexed: 0, errors: 0 }
    }
    
    let indexed = 0
    let errors = 0
    
    for (let i = 0; i < novels.length; i++) {
      const novel = novels[i]
      if (!novel) {
        console.warn(`⚠️  Skipping undefined novel at index ${i}`)
        continue
      }
      
      const novelNumber = i + 1
      
      try {
        console.log(`📖 Rebuilding chapter index for novel ${novelNumber}/${novels.length}: ${novel.novelId}`)
        
        await ChapterListSearchService.rebuildNovel(novel.uuid, novel.novelId)
        indexed++
        
        // Progress update every 100 novels
        if (indexed % 100 === 0 || novelNumber === novels.length) {
          const progress = ((indexed / novels.length) * 100).toFixed(1)
          console.log(`📈 Chapter index progress: ${progress}% (${indexed}/${novels.length} novels)`)
        }
        
        // Small delay to prevent overwhelming ES
        if (i < novels.length - 1) {
          await new Promise(r => setTimeout(r, 10))
        }
        
      } catch (error) {
        console.error(`❌ Failed to rebuild chapter index for novel ${novel.novelId}:`, error)
        errors++
      }
    }
    
    console.log('🎉 Chapter indexing completed!')
    console.log(`   ✅ Successfully indexed: ${indexed} novels' chapters`)
    if (errors > 0) console.log(`   ❌ Errors: ${errors} novels' chapters`)
    
    return { indexed, errors }
    
  } catch (error) {
    console.error('💥 Chapter indexing failed:', error)
    throw error
  }
}

async function indexEverything() {
  console.log('🚀 Starting comprehensive Elasticsearch indexing...')
  console.log('================================================')
  
  try {
    // Index all novels first
    const novelResult = await indexAllNovels()
    
    // Then index all chapters
    const chapterResult = await indexAllChapters()
    
    console.log('\n🎉 Comprehensive indexing completed!')
    console.log('=====================================')
    console.log(`📚 Novels indexed: ${novelResult?.indexed || 0} (${novelResult?.errors || 0} errors)`)
    console.log(`📖 Chapters indexed: ${chapterResult?.indexed || 0} novels (${chapterResult?.errors || 0} errors)`)
    
    // Final test
    console.log('\n🧪 Final verification...')
    try {
      const novelCount = await NovelSearchService.search({ from: 0, size: 1, trackTotal: true })
      console.log(`   📚 Novel index contains: ${novelCount.total} novels`)
      
      // Test chapter search
      const sampleNovel = await NovelModel.findOne({}).select('uuid').lean()
      if (sampleNovel) {
        const chapterResult = await ChapterListSearchService.listByNovel(sampleNovel.uuid, 0, 10)
        console.log(`   📖 Chapter index test: Found ${chapterResult.total} chapters for sample novel`)
      }
    } catch (error) {
      console.warn('⚠️ Final verification failed:', error)
    }
    
  } catch (error) {
    console.error('💥 Comprehensive indexing failed:', error)
    process.exit(1)
  } finally {
    try { await databaseManager.disconnect() } catch {}
    try { await elasticsearchManager.disconnect() } catch {}
    console.log('✅ Connections closed')
  }
}

// Handle command line arguments
function parseArgs() {
  const args = process.argv.slice(2)
  
  for (const arg of args) {
    if (arg === '--novels-only') {
      console.log('📚 Indexing novels only...')
      indexAllNovels().then(() => process.exit(0)).catch(() => process.exit(1))
      return
    } else if (arg === '--chapters-only') {
      console.log('📖 Indexing chapters only...')
      indexAllChapters().then(() => process.exit(0)).catch(() => process.exit(1))
      return
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: pnpm run elasticsearch:index [options]

Options:
  --novels-only      Index only novels (skip chapters)
  --chapters-only    Index only chapters (skip novels)
  --help, -h        Show this help message

Default: Index both novels and chapters
      `)
      process.exit(0)
    }
  }
  
  // Default: index everything
  indexEverything()
}

if (import.meta.url === `file://${process.argv[1]}`) {
  parseArgs()
}

export { indexAllNovels, indexAllChapters, indexEverything } 