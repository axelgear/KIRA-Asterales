# Complete Migration Guide

## 🎯 Overview

This guide covers the complete migration from the old PostgreSQL database to the new MongoDB database, including:

1. **Novels & Chapters** - Stories and their content
2. **Users** - User accounts and authentication
3. **Ratings** - User ratings converted to favorites
4. **Bookmarks** - User bookmarks converted to favorites
5. **Comments** - Novel comments
6. **Word Counts** - Update word counts for existing novels

---

## 📋 Pre-Migration Checklist

### 1. Environment Variables

Create a `.env` file with the following variables:

```bash
# PostgreSQL (Old Database)
PG_HOST=your_postgres_host
PG_PORT=5432
PG_DATABASE=your_database
PG_USERNAME=your_username
PG_PASSWORD=your_password
PG_SCHEMA=public
PG_SSL=false

# MongoDB (New Database)
MONGO_URI=mongodb://username:password@host:port
MONGO_DATABASE=kira_asterales
# OR use separate variables
MONGODB_USERNAME=your_username
MONGODB_PASSWORD=your_password
MONGODB_CLUSTER_HOST=localhost:27017
MONGODB_NAME=kira_asterales

# Elasticsearch (Optional)
ES_ENABLED=true
ES_NODES=localhost:9200
ES_USERNAME=elastic
ES_PASSWORD=your_password
# OR
ELASTICSEARCH_CLUSTER_HOST=localhost:9200
ELASTICSEARCH_ADMIN_USERNAME=elastic
ELASTICSEARCH_ADMIN_PASSWORD=your_password

# Migration Settings
MIGRATION_BATCH_SIZE=50
MIGRATION_MAX_NOVELS=0  # 0 = all novels
MIGRATION_SKIP_EXISTING=true
MIGRATION_SKIP_TAXONOMY=false
MIGRATION_CREATE_INDEXES=true
MIGRATION_REBUILD_INDICES=true
```

### 2. Database Preparation

```bash
# Backup your PostgreSQL database
pg_dump -h localhost -U username database_name > backup_$(date +%Y%m%d).sql

# Ensure MongoDB is running
mongo --eval "db.adminCommand('ping')"

# Ensure Elasticsearch is running (if enabled)
curl -X GET "localhost:9200/_cluster/health?pretty"
```

---

## 🚀 Migration Options

### Option 1: Complete Migration (Recommended for Fresh Start)

Migrate everything in one go:

```bash
pnpm run migrate:all
```

This will migrate:
- ✅ Taxonomy (tags & genres)
- ✅ Novels & chapters
- ✅ Users
- ✅ Ratings → Favorites
- ✅ Bookmarks → Favorites
- ✅ Comments
- ✅ Update word counts

### Option 2: Selective Migration

Skip certain parts if already migrated:

```bash
# Skip novels (if already migrated)
pnpm run migrate:all --skip-novels

# Skip users (if already migrated)
pnpm run migrate:all --skip-users

# Only migrate users and comments
pnpm run migrate:all --skip-novels --skip-ratings --skip-bookmarks

# Only update word counts for existing novels
pnpm run migrate:all --skip-novels --skip-users --skip-ratings --skip-bookmarks --skip-comments
```

### Option 3: Step-by-Step Migration

Migrate each entity separately:

```bash
# Step 1: Migrate novels and chapters
pnpm run migrate:novels

# Step 2: Migrate users only
pnpm run migrate:users

# Step 3: Update word counts for existing novels
pnpm run migrate:wordcounts
```

---

## 📊 Migration Details

### 1. Taxonomy Migration (Tags & Genres)

**What it does:**
- Migrates tags and genres from PostgreSQL to MongoDB
- Creates mappings for use in novel migration

**Skip if:**
- You already have tags and genres in MongoDB
- Use `--skip-taxonomy` or set `MIGRATION_SKIP_TAXONOMY=true`

---

### 2. Novels & Chapters Migration

**What it does:**
- Migrates novels with all metadata
- Migrates chapters with content
- Converts tags/genres from names to IDs
- Maps ratings to upvote counts
- Populates firstChapter and latestChapter info
- Indexes in Elasticsearch (if enabled)

**Field Mappings:**

| PostgreSQL | MongoDB | Transformation |
|-----------|---------|----------------|
| `id` | `novelId` | Direct |
| `name` | `title` | Direct |
| `wordcount` | `wordCount` | Direct (✅ now supported) |
| `bookmarkcount` | `favoritesCount` | Direct |
| `rating` | `upvoteCount` | Multiplied by 10 |
| `genres` (JSON) | `genreIds` (array) | Converted to IDs |
| `tags` (JSON) | `tagIds` (array) | Converted to IDs |
| `published` | `approvalStatus` | true → 'approved', false → 'pending' |

**Configuration:**
```bash
MIGRATION_MAX_NOVELS=0  # 0 = all, or specify limit for testing
MIGRATION_SKIP_EXISTING=true  # Skip novels that already exist
```

---

### 3. Users Migration

**What it does:**
- Migrates user accounts
- Creates UUID for each user
- Generates username from email if not present
- Parses roles from JSON
- Sets up security fields
- Creates user ID to UUID lookup map

**Field Mappings:**

| PostgreSQL | MongoDB | Notes |
|-----------|---------|-------|
| `id` | `userId` | Legacy ID |
| - | `uuid` | New secure identifier |
| `email` | `email` & `username` | Username from email prefix |
| `name` | `nickname` | Display name |
| `image` | `avatar` | Profile picture |
| `email_verified` | `isEmailVerified` | Email verification status |
| `roles` (JSON) | `roles` (array) | Parsed from JSON |
| `deleted_at` | `isBlocked` | Soft delete → blocked |

**After Migration:**
- Users can log in with their existing credentials
- UUID is used for security in new API
- Old userId is kept for reference

---

### 4. Ratings Migration

**What it does:**
- Converts ratings ≥ 4 to favorites (bookmarks)
- Links users and novels via UUIDs
- Preserves creation dates

**Logic:**
```typescript
if (rating >= 4) {
  // Create favorite
  favorite = {
    userUuid: user.uuid,
    novelUuid: novel.uuid,
    createdAt: rating.created_at
  }
}
```

**Why ≥ 4?**
- Old system: 1-5 star rating
- New system: Favorites (binary - yes/no)
- Rating ≥ 4 = User likes it enough to favorite

---

### 5. Bookmarks Migration

**What it does:**
- Extracts bookmarks from `users.bookmarks` JSON field
- Converts to favorites in MongoDB
- Handles various JSON formats

**Supported Formats:**
```javascript
// Array format
bookmarks: [1, 2, 3]  // novelIds

// Object format
bookmarks: { "1": true, "2": true }

// Mixed format
bookmarks: { "novels": [1, 2, 3] }
```

**After Migration:**
- Bookmarks appear as favorites
- Duplicates are automatically deduplicated
- Creation date set to user creation date

---

### 6. Comments Migration

**What it does:**
- Migrates novel comments (not chapter comments yet)
- Preserves threading structure (parentCommentId)
- Converts likes to upvoteCount
- Links via UUIDs for security

**Field Mappings:**

| PostgreSQL | MongoDB | Notes |
|-----------|---------|-------|
| `id` | `commentId` | Legacy ID |
| `user_id` | `userUuid` | Secure user reference |
| `novel_id` | `novelUuid` | Secure novel reference |
| `content` | `content` | Comment text |
| `parent_id` | `parentCommentId` | For threaded replies |
| `likes` | `upvoteCount` | Positive votes |

**Threading:**
- Top-level comments: `parentCommentId: null`
- Replies: `parentCommentId: <parent comment ID>`
- `rootCommentId` and `path` calculated later if needed

---

### 7. Word Count Updates

**What it does:**
- Calculates total word count for each novel
- Sums word counts from all published chapters
- Updates MongoDB and Elasticsearch
- Invalidates Redis cache

**When to run:**
- After migrating novels that don't have word counts
- After bulk chapter updates
- To fix incorrect word counts

```bash
# Update word counts for all novels
pnpm run migrate:wordcounts

# Or as part of full migration
pnpm run migrate:all  # Includes word count update
```

**Performance:**
- Processes in batches (default: 50 novels at a time)
- Configurable via `BATCH_SIZE` environment variable
- Shows progress updates

---

## 🔍 Monitoring & Verification

### During Migration

The migration script provides detailed progress:

```
🚀 Comprehensive Migration Tool
======================================================================
This will migrate all data from PostgreSQL to MongoDB:
  1. Taxonomy (tags & genres)
  2. Novels & chapters
  3. Users
  4. Ratings → Favorites
  5. Bookmarks → Favorites
  6. Comments
  7. Update word counts for existing novels
======================================================================

⚙️  Migration flags:
   Novels & Chapters: ✅
   Users: ✅
   Ratings: ✅
   Bookmarks: ✅
   Comments: ✅
   Update Word Counts: ✅

======================================================================
📋 STEP 1: Migrating Taxonomy (Tags & Genres)
======================================================================
✅ Tags: 150 migrated
✅ Genres: 25 migrated

======================================================================
📚 STEP 2: Migrating Novels & Chapters
======================================================================
📊 Found 5000 novels, migrating 5000
📈 Progress: 20.0% (1000/5000)
...
✅ Novels: 5000 migrated
✅ Chapters: 150000 migrated

======================================================================
👥 STEP 3: Migrating Users
======================================================================
📊 Found 10000 users to migrate
📈 Progress: 50.0% (5000/10000)
...
✅ Users: 9950/10000 migrated, 50 failed

======================================================================
🎉 MIGRATION COMPLETED SUCCESSFULLY!
⏱️  Total duration: 1234.56s
======================================================================
```

### After Migration

#### 1. Verify Data in MongoDB

```javascript
// Connect to MongoDB
use kira_asterales

// Check counts
db.novels.countDocuments()
db.chapters.countDocuments()
db.users.countDocuments()
db.favorites.countDocuments()
db['novel-comments'].countDocuments()

// Verify sample data
db.novels.findOne({}, { title: 1, wordCount: 1, genreIds: 1, tagIds: 1 })
db.users.findOne({}, { username: 1, email: 1, uuid: 1 })
db.favorites.findOne({}, { userUuid: 1, novelUuid: 1 })
db['novel-comments'].findOne({}, { content: 1, userUuid: 1, novelUuid: 1 })
```

#### 2. Verify Elasticsearch Index

```bash
# Check index health
curl -X GET "localhost:9200/_cat/indices?v"

# Check document count
curl -X GET "localhost:9200/novels/_count?pretty"

# Sample search
curl -X GET "localhost:9200/novels/_search?pretty" -H 'Content-Type: application/json' -d'
{
  "_source": ["title", "wordCount", "upvoteCount"],
  "size": 5
}'
```

#### 3. Test API Endpoints

```bash
# Get a novel
curl http://localhost:3000/api/novel/sample-novel-slug | jq

# Search novels
curl "http://localhost:3000/api/search/novels?q=fantasy" | jq

# Get user favorites
curl -H "Cookie: uid=USER_UUID" http://localhost:3000/api/favorites | jq
```

---

## 🐛 Troubleshooting

### Migration Fails with Connection Error

**Problem:** Cannot connect to PostgreSQL/MongoDB/Elasticsearch

**Solution:**
1. Verify database is running: `pg_isready` / `mongo --eval "db.adminCommand('ping')"`
2. Check credentials in `.env`
3. Check firewall rules
4. Test connection manually

### Duplicate Key Errors

**Problem:** `E11000 duplicate key error`

**Solution:**
- This is normal for re-runs with `MIGRATION_SKIP_EXISTING=true`
- The migration will skip duplicates and continue
- Check logs to see how many were skipped vs. failed

### Word Counts are Zero

**Problem:** Novels have `wordCount: 0` after migration

**Solution:**
```bash
# Run word count update
pnpm run migrate:wordcounts

# Or specify batch size
BATCH_SIZE=100 pnpm run migrate:wordcounts
```

### Users Can't Find UUIDs

**Problem:** Need to find userUuid from old userId

**Solution:**
```javascript
// In MongoDB
db.users.findOne({ userId: 123 }, { uuid: 1 })
```

### Missing Favorites

**Problem:** Fewer favorites than expected

**Solution:**
1. Check rating threshold (only ≥ 4 are converted)
2. Check if novels exist (favorites require valid novelUuid)
3. Check migration logs for warnings

---

## 📈 Performance Tips

### 1. Adjust Batch Sizes

```bash
# For faster migration (uses more memory)
MIGRATION_BATCH_SIZE=200 pnpm run migrate:all

# For slower but safer migration
MIGRATION_BATCH_SIZE=10 pnpm run migrate:all
```

### 2. Disable Elasticsearch Temporarily

```bash
# Migrate without Elasticsearch indexing
ES_ENABLED=false pnpm run migrate:all

# Rebuild indexes later
pnpm run index:elasticsearch
```

### 3. Skip Already Migrated Data

```bash
# Skip novels if already done
pnpm run migrate:all --skip-novels

# Skip word count update if not needed
pnpm run migrate:all --skip-wordcounts
```

### 4. Migrate in Stages

```bash
# Day 1: Migrate core data
MIGRATE_COMMENTS=false pnpm run migrate:all

# Day 2: Migrate comments
pnpm run migrate:all --skip-novels --skip-users --skip-ratings --skip-bookmarks --skip-wordcounts
```

---

## 🔒 Security Considerations

### UUIDs for Security

The new API uses UUIDs instead of sequential IDs:

- **Old:** `/api/novel/123` (exposes ID)
- **New:** `/api/novel/550e8400-e29b-41d4-a716-446655440000` (secure)

### Password Migration

- Passwords are copied as-is (already hashed)
- Users can log in with existing credentials
- Consider forcing password reset for added security

### Data Validation

- Novel slugs must be unique
- User emails must be unique
- Usernames must be unique

---

## 📝 Post-Migration Tasks

### 1. Update Word Counts (If Needed)

```bash
pnpm run migrate:wordcounts
```

### 2. Rebuild Elasticsearch Indexes

   ```bash
pnpm run index:elasticsearch
pnpm run index:chapters
pnpm run index:taxonomy
```

### 3. Verify Data Integrity

Run the verification queries from the "After Migration" section above.

### 4. Update Application Configuration

Update your application to use the new MongoDB database and API endpoints.

### 5. Monitor Performance

- Check query performance
- Monitor memory usage
- Check Elasticsearch health
- Monitor Redis hit rates

---

## 🎯 Quick Reference

### Common Commands

   ```bash
# Complete migration
pnpm run migrate:all

# Only novels
   pnpm run migrate:novels

# Only users
pnpm run migrate:users

# Only word counts
pnpm run migrate:wordcounts

# Skip novels (if already done)
pnpm run migrate:all --skip-novels

# Dry run (test without writing)
MIGRATION_DRY_RUN=true pnpm run migrate:all
```

### Environment Variables

```bash
# Database connections
PG_HOST, PG_PORT, PG_DATABASE, PG_USERNAME, PG_PASSWORD
MONGO_URI, MONGO_DATABASE
ES_ENABLED, ES_NODES

# Migration settings
MIGRATION_MAX_NOVELS=0
MIGRATION_BATCH_SIZE=50
MIGRATION_SKIP_EXISTING=true
MIGRATION_DRY_RUN=false

# What to migrate
MIGRATE_NOVELS=true
MIGRATE_USERS=true
MIGRATE_RATINGS=true
MIGRATE_BOOKMARKS=true
MIGRATE_COMMENTS=true
UPDATE_WORDCOUNTS=true
```

---

## ✅ Success Criteria

Your migration is successful when:

- ✅ All novels and chapters are in MongoDB
- ✅ All users can log in
- ✅ Favorites work (bookmarks + ratings ≥ 4)
- ✅ Comments appear on novels
- ✅ Word counts are accurate
- ✅ Search works in Elasticsearch
- ✅ API returns correct data
- ✅ No critical errors in logs

---

## 📞 Need Help?

If you encounter issues:

1. Check the migration logs carefully
2. Verify environment variables
3. Test database connections manually
4. Check the troubleshooting section
5. Review the code in `src/scripts/migration/`

Good luck with your migration! 🚀
