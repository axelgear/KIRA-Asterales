import 'dotenv/config'
import { MongoClient } from 'mongodb'

const MONGO_URI = process.env.MONGO_URI || `mongodb://${process.env.MONGODB_USERNAME || ''}:${process.env.MONGODB_PASSWORD || ''}@${process.env.MONGODB_CLUSTER_HOST || ''}`
const MONGO_DB = process.env.MONGO_DATABASE || process.env.MONGODB_NAME || 'novel'

async function updateReadingListCovers() {
	console.log('🚀 Starting Reading List Cover Images Update')
	
	const mongoClient = new MongoClient(MONGO_URI)
	
	try {
		await mongoClient.connect()
		console.log('✅ Connected to MongoDB')
		
		const db = mongoClient.db(MONGO_DB)
		const listsCollection = db.collection('reading-lists')
		const itemsCollection = db.collection('reading-list-items')
		const novelsCollection = db.collection('novels')
		
		/* Get all reading lists */
		const lists = await listsCollection.find({}).toArray()
		console.log(`📚 Found ${lists.length} reading lists to update`)
		
		let updated = 0
		let skipped = 0
		let failed = 0
		
		for (const list of lists) {
			try {
				/* Get first 4 items for this list */
				const items = await itemsCollection
					.find({ listUuid: list.uuid })
					.sort({ createdAt: -1 })
					.limit(4)
					.toArray()
				
				if (items.length === 0) {
					console.log(`⏭️  Skipping list "${list.name}" (no items)`)
					skipped++
					continue
				}
				
				/* Fetch cover images */
				const coverImages: string[] = []
				for (const item of items) {
					const novel = await novelsCollection.findOne(
						{ slug: item.novelSlug },
						{ projection: { coverImg: 1 } }
					)
					
					if (novel?.coverImg) {
						coverImages.push(novel.coverImg)
					}
				}
				
				/* Update the list */
				await listsCollection.updateOne(
					{ uuid: list.uuid },
					{ $set: { coverImages } }
				)
				
				updated++
				console.log(`✅ Updated list "${list.name}" with ${coverImages.length} cover images`)
				
			} catch (error) {
				failed++
				console.error(`❌ Failed to update list "${list.name}":`, error)
			}
		}
		
		console.log('\n✅ Update complete!')
		console.log(`📊 Summary:`)
		console.log(`   - Total lists: ${lists.length}`)
		console.log(`   - Updated: ${updated}`)
		console.log(`   - Skipped: ${skipped}`)
		console.log(`   - Failed: ${failed}`)
		
	} catch (error) {
		console.error('❌ Update failed:', error)
		process.exit(1)
	} finally {
		await mongoClient.close()
		console.log('🔌 Disconnected from MongoDB')
	}
}

/* Run the update */
updateReadingListCovers()
	.then(() => {
		console.log('✅ Update completed successfully')
		process.exit(0)
	})
	.catch((error) => {
		console.error('❌ Update failed:', error)
		process.exit(1)
	})

