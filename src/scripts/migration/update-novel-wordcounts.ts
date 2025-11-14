#!/usr/bin/env node

/**
 * Update Word Counts for Existing Novels
 * 
 * This script updates word counts for novels that were already migrated
 * without word counts.
 */

import mongoose from 'mongoose'
import { NovelWordCountService } from '../../services/NovelWordCountService.js'

async function main() {
	try {
		console.log('🔢 Starting word count update for existing novels...')
		console.log('=' .repeat(60))
		
		/* Connect to MongoDB via Mongoose */
		const mongoUri = process.env.MONGO_URI || `mongodb://${process.env.MONGODB_USERNAME || ''}:${process.env.MONGODB_PASSWORD || ''}@${process.env.MONGODB_CLUSTER_HOST || ''}`
		const mongoDatabase = process.env.MONGO_DATABASE || process.env.MONGODB_NAME || 'kira_asterales'
		
		await mongoose.connect(`${mongoUri}/${mongoDatabase}`)
		console.log('✅ Connected to MongoDB via Mongoose')
		
		/* Update all novel word counts */
		const batchSize = parseInt(process.env.BATCH_SIZE || '50')
		console.log(`\n📊 Processing in batches of ${batchSize}...`)
		
		const result = await NovelWordCountService.updateAllNovelWordCounts(batchSize)
		
		console.log('\n' + '='.repeat(60))
		console.log('✅ Word count update completed!')
		console.log(`📊 Results:`)
		console.log(`   Total novels: ${result.total}`)
		console.log(`   Successfully updated: ${result.updated}`)
		console.log(`   Failed: ${result.failed}`)
		console.log('='.repeat(60))
		
		/* Disconnect */
		await mongoose.disconnect()
		console.log('✅ MongoDB connection closed')
		
		process.exit(0)
	} catch (error) {
		console.error('\n💥 Word count update failed:', error)
		try {
			await mongoose.disconnect()
		} catch {}
		process.exit(1)
	}
}

/* Run if executed directly */
if (import.meta.url === `file://${process.argv[1]}`) {
	main()
}

