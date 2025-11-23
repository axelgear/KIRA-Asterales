/**
 * Fix Missing RBAC Bindings Script
 * 
 * This script finds users who don't have RBAC bindings and creates them.
 * This is needed for users migrated before RBAC binding creation was added.
 */

import 'dotenv/config'
import { MongoClient } from 'mongodb'

async function fixMissingRbacBindings() {
	console.log('🚀 Starting RBAC Bindings Fix Script')
	
	const mongoUri = process.env.MONGO_URI || `mongodb://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_CLUSTER_HOST}`
	const mongoDbName = process.env.MONGO_DATABASE || process.env.MONGODB_NAME
	
	if (!mongoUri || !mongoDbName) {
		console.error('❌ MongoDB URI or database name not configured in environment variables.')
		return
	}
	
	const client = new MongoClient(mongoUri)
	
	try {
		await client.connect()
		console.log('✅ Connected to MongoDB')
		const db = client.db(mongoDbName)
		
		// Get all users
		const users = await db.collection('users').find({}).toArray()
		console.log(`📊 Found ${users.length} users`)
		
		let created = 0
		let existing = 0
		let failed = 0
		
		for (const user of users) {
			try {
				// Check if RBAC binding exists
				const binding = await db.collection('rbac-user-bindings').findOne({ 
					userId: user.userId 
				})
				
				if (binding) {
					existing++
					continue
				}
				
				// Create missing RBAC binding
				await db.collection('rbac-user-bindings').insertOne({
					userId: user.userId,
					uuid: user.uuid,
					roles: user.roles || ['user'], // Use existing roles or default to 'user'
					createdAt: user.createdAt || new Date(),
					updatedAt: new Date()
				})
				
				console.log(`✅ Created RBAC binding for user ${user.userId} (${user.username})`)
				created++
			} catch (error: any) {
				if (error.code === 11000) {
					// Duplicate key - binding already exists
					existing++
				} else {
					console.error(`❌ Failed to create RBAC binding for user ${user.userId}:`, error)
					failed++
				}
			}
		}
		
		console.log('\n🎉 RBAC Bindings Fix Complete!')
		console.log(`📊 Summary:`)
		console.log(`   - Total users: ${users.length}`)
		console.log(`   - Created bindings: ${created}`)
		console.log(`   - Already existed: ${existing}`)
		console.log(`   - Failed: ${failed}`)
		
	} catch (error) {
		console.error('❌ Fix failed:', error)
	} finally {
		await client.close()
		console.log('🔌 MongoDB connection closed')
	}
}

fixMissingRbacBindings()

