# 🚀 PostgreSQL to MongoDB Migration Guide

This guide explains how to migrate your novels and chapters from the old PostgreSQL database (`novel-api`) to the new MongoDB database (`KIRA-Asterales-new`).

## 📋 What Gets Migrated

### ✅ **Novels**
- Basic info (title, slug, description)
- Cover images (stored as filenames)
- Status (ongoing/completed/hiatus)
- View counts and statistics
- Tags and genres (with mapping)

### ✅ **Chapters**
- Chapter content and metadata
- Sequence numbers
- Word counts
- Publication dates

### ❌ **Not Migrated**
- User accounts (handled separately)
- Comments (can be migrated later)
- Reading lists (can be migrated later)
- Ratings and reviews (can be migrated later)

## 🛠️ Setup

### 1. Install Dependencies
The required dependencies are already installed:
- `pg` - PostgreSQL client
- `mongodb` - MongoDB client
- `mongoose` - MongoDB ODM

### 2. Environment Configuration
Copy the example environment file and configure your databases:

```bash
cp env.migration.example .env
```

Edit `.env` with your actual database credentials:

```bash
# PostgreSQL (Source)
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=novel_api
PG_USERNAME=postgres
PG_PASSWORD=your_actual_password
PG_SSL=false

# MongoDB (Target)
MONGO_URI=mongodb://localhost:27017
MONGO_DATABASE=kira_asterales
```

### 3. Test Connections
Before running the migration, test your database connections:

```bash
pnpm run test:connections
```

This will verify:
- PostgreSQL connection and data availability
- MongoDB connection and collection status
- Show mapping statistics

## 🎯 Running the Migration

### Basic Migration
```bash
# Migrate up to 100 novels (default)
pnpm run migrate:novels
```

### Dry Run (Recommended First)
```bash
# Test migration without moving data
pnpm run migrate:novels:dry
```

### Custom Options
```bash
# Migrate only 50 novels with smaller batches
pnpm run migrate:novels --max-novels 50 --batch-size 5
```

## 🗺️ Tag and Genre Mapping

### Current Mappings
The system includes comprehensive mappings for common tags and genres. You can customize these in `src/scripts/migration/mappers.ts`.

### Example Customizations
```typescript
export const TAG_MAPPER: Record<string, string> = {
  // Keep as-is
  'fantasy': 'fantasy',
  
  // Rename
  'rom-com': 'romantic-comedy',
  
  // Delete (map to empty string)
  'nsfw': '',
  'adult': '',
  
  // Add new standardized tags
  'isekai': 'isekai',
  'reincarnation': 'reincarnation'
}
```

### View Current Mappings
```bash
pnpm run test:connections
```
This will show statistics about your current tag/genre mappings.

## 📊 Migration Process

1. **Connection Setup** - Connects to both databases
2. **Index Creation** - Creates MongoDB indexes for performance
3. **Batch Processing** - Fetches novels in configurable batches
4. **Data Transformation** - Converts PostgreSQL format to MongoDB
5. **Tag/Genre Mapping** - Applies your custom mappings
6. **Data Insertion** - Inserts into MongoDB with error handling
7. **Validation** - Optionally validates migrated data
8. **Cleanup** - Closes connections and reports results

## 🔍 Monitoring and Progress

The migration provides real-time feedback:
- Connection status
- Batch progress
- Individual novel migration status
- Error reporting
- Final statistics

## ⚠️ Important Notes

### Data Safety
- **Always test with dry-run first**
- The system skips existing records by default
- All operations are logged for audit

### Performance
- Default batch size: 10 novels
- Default max novels: 100
- Adjust based on your system resources

### Error Handling
- Individual failures don't stop the entire migration
- All errors are logged and reported
- Failed records can be retried

## 🚨 Troubleshooting

### Common Issues

1. **Connection Failed**
   - Check database credentials
   - Verify network connectivity
   - Check firewall settings

2. **Permission Denied**
   - Ensure PostgreSQL user has SELECT permissions
   - Ensure MongoDB user has INSERT permissions

3. **Memory Issues**
   - Reduce batch size
   - Reduce max novels limit

4. **Duplicate Key Errors**
   - Enable `skipExisting` option
   - Check for conflicting IDs

### Debug Mode
For detailed debugging:
```bash
DEBUG=migration:* pnpm run migrate:novels
```

## 📈 Post-Migration

### 1. Verify Data
```bash
# Check MongoDB collections
mongosh kira_asterales
db.novels.countDocuments()
db.chapters.countDocuments()
```

### 2. Test Queries
Ensure your new MongoDB queries work correctly.

### 3. Update Frontend
Point your KIRA-Dahlia frontend to the new MongoDB backend.

### 4. Monitor Performance
Watch for any performance issues with the new data structure.

## 🔄 Re-running Migration

If you need to re-run the migration:

1. **Clear existing data** (if needed):
   ```bash
   mongosh kira_asterales
   db.novels.deleteMany({})
   db.chapters.deleteMany({})
   ```

2. **Run migration again**:
   ```bash
   pnpm run migrate:novels
   ```

## 📞 Support

If you encounter issues:

1. Check the logs for error details
2. Verify database connections with `pnpm run test:connections`
3. Test with dry-run mode first
4. Review the mapping configuration

## 🎉 Success Indicators

Your migration is successful when:
- ✅ All novels are present in MongoDB
- ✅ All chapters are linked correctly
- ✅ Tags and genres are properly mapped
- ✅ No critical errors in the logs
- ✅ Frontend can query the new data

---

**Happy Migrating! 🚀**

The migration system is designed to be safe, efficient, and transparent. Start with a dry-run to understand the process, then proceed with the actual migration when you're confident everything looks correct. 