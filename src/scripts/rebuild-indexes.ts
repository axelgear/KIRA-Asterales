import mongoose, { connect, disconnect } from 'mongoose'
import { config } from 'dotenv'

// Load environment variables
config()

async function rebuildIndexes() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mtlb')
    console.log('✅ Connected to MongoDB')

    // Get the novels collection
    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not established')
    }
    
    const novelsCollection = db.collection('novels')

    console.log('🔍 Current indexes:')
    const currentIndexes = await novelsCollection.indexes()
    currentIndexes.forEach((index: any) => {
      console.log(`   - ${index.name}: ${JSON.stringify(index.key)}`)
    })

    console.log('\n🗑️ Dropping all indexes except _id...')
    await novelsCollection.dropIndexes()
    console.log('✅ Indexes dropped')

    console.log('\n🔨 Rebuilding indexes...')
    
    // Rebuild indexes by restarting the application
    // This will trigger the index creation in the Novel model
    console.log('📝 Indexes will be rebuilt when you restart the application')
    console.log('   The new indexes include:')
    console.log('   - approvalStatus + updatedAt + novelId (CRITICAL for search)')
    console.log('   - approvalStatus + status + updatedAt')
    console.log('   - approvalStatus + language + updatedAt')
    console.log('   - approvalStatus + tagIds + updatedAt')
    console.log('   - approvalStatus + genreIds + updatedAt')
    console.log('   - All existing compound indexes')

    console.log('\n💡 To apply the new indexes:')
    console.log('   1. Restart your application (npm run dev)')
    console.log('   2. Or manually create indexes using MongoDB commands')
    console.log('   3. Monitor index creation in MongoDB logs')

  } catch (error) {
    console.error('❌ Error rebuilding indexes:', error)
  } finally {
    await disconnect()
    console.log('🔌 Disconnected from MongoDB')
  }
}

// Run the script
rebuildIndexes().catch(console.error)
