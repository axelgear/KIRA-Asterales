#!/usr/bin/env tsx

/**
 * Chapter Indexer Script
 * 
 * This script rebuilds all novel chapter lists in Elasticsearch
 * Run this after setting up the chapter index for fast listing
 */

import { databaseManager } from '../infrastructure/database.js'
import { elasticsearchManager } from '../infrastructure/elasticsearch.js'
import { ChapterListSearchService } from '../services/ChapterListSearchService.js'
import { NovelModel } from '../infrastructure/models/Novel.js'

async function rebuildAllChapterLists() {
  console.log('🚀 Starting Elasticsearch chapter list rebuild for all novels...')
  
  try {
    await databaseManager.connect()
    console.log('✅ Connected to MongoDB via DatabaseManager')
    
    await elasticsearchManager.connect()
    console.log('✅ Connected to Elasticsearch via ElasticsearchManager')
    
    await ChapterListSearchService.ensureIndex()
    console.log('✅ Chapter list index ensured')
    
    // Get all novels to rebuild chapter indices for
    const novels = await NovelModel.find({}).select('uuid novelId').lean()
    console.log(`📊 Found ${novels.length} novels to rebuild chapter indices for`)
    
    if (novels.length === 0) {
      console.log('ℹ️ No novels found to rebuild chapter indices for')
      return
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
    
    console.log('🎉 Chapter list rebuild completed!')
    console.log(`   ✅ Successfully rebuilt: ${indexed} novels' chapter indices`)
    if (errors > 0) console.log(`   ❌ Errors: ${errors} novels' chapter indices`)
    
    // Test the result
    console.log('\n🧪 Testing chapter index...')
    try {
      const sampleNovel = await NovelModel.findOne({}).select('uuid').lean()
      if (sampleNovel) {
        const chapterResult = await ChapterListSearchService.listByNovel(sampleNovel.uuid, 0, 10)
        console.log(`   📖 Sample novel has ${chapterResult.total} chapters indexed`)
      }
    } catch (error) {
      console.warn('⚠️ Chapter index test failed:', error)
    }

  } catch (error) {
    console.error('💥 Chapter list rebuild failed:', error)
    process.exit(1)
  } finally {
    try { await databaseManager.disconnect() } catch {}
    try { await elasticsearchManager.disconnect() } catch {}
    console.log('✅ Connections closed')
  }
}

// Run the rebuild
rebuildAllChapterLists() 