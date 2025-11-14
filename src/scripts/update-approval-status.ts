#!/usr/bin/env tsx

/**
 * Update Approval Status Script
 * 
 * This script updates existing novels to add the approvalStatus field
 * Run this after adding the approvalStatus field to the Novel schema
 */

import { databaseManager } from '../infrastructure/database.js'
import { NovelModel } from '../infrastructure/models/Novel.js'

async function updateApprovalStatus() {
  console.log('🚀 Starting approval status update for existing novels...')
  
  try {
    // Connect to MongoDB
    await databaseManager.connect()
    console.log('✅ Connected to MongoDB')
    
    // Update all novels that don't have approvalStatus field
    const result = await NovelModel.updateMany(
      { approvalStatus: { $exists: false } },
      { $set: { approvalStatus: 'pending' } }
    )
    
    console.log(`✅ Updated ${result.modifiedCount} novels with approval status 'pending'`)
    
    // Verify the update
    const totalNovels = await NovelModel.countDocuments({})
    const novelsWithApprovalStatus = await NovelModel.countDocuments({ approvalStatus: { $exists: true } })
    
    console.log(`📊 Total novels: ${totalNovels}`)
    console.log(`📊 Novels with approval status: ${novelsWithApprovalStatus}`)
    
    if (totalNovels === novelsWithApprovalStatus) {
      console.log('🎉 All novels now have approval status field!')
    } else {
      console.log('⚠️ Some novels still missing approval status field')
    }
    
  } catch (error) {
    console.error('💥 Approval status update failed:', error)
    process.exit(1)
  } finally {
    // Cleanup
    try {
      await databaseManager.disconnect()
      console.log('✅ Connection closed')
    } catch (error) {
      console.warn('⚠️ Error during cleanup:', error)
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  updateApprovalStatus()
}

export { updateApprovalStatus } 