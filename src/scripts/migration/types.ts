/**
 * Migration Types for PostgreSQL to MongoDB
 */

// PostgreSQL source types
export interface PgNovel {
  id: number
  custom_id?: bigint | null
  name: string
  slug: string
  alt_name?: any
  description?: string | null
  status: 'Ongoing' | 'Completed' | 'Hiatus'
  thumbnail?: string | null
  cover?: string | null
  rating?: number | null
  popularity?: number | null
  reviewcount?: number | null
  bookmarkcount?: number | null
  author_id?: number | null
  genres?: any
  tags?: any
  firstchapter?: any
  latestchapter?: any
  wordcount?: number | null
  views: number
  dailyviews?: number | null
  weeklyviews?: number | null
  monthlyviews?: number | null
  chaptercount: number
  created_at?: Date | null
  updated_at?: Date | null
  last_viewed: Date
  published: boolean
  published_at?: Date | null
  dmca_status?: string | null
  dmca_reported_at?: Date | null
  dmca_resolved_at?: Date | null
  reports_count: number
  deleted_at?: Date | null
  source?: any
}

export interface PgChapter {
  id: number
  novel_id?: number | null
  novel_slug?: string | null
  chapter_number?: number | null
  chapter_title: string
  chapter_slug: string
  content?: string | null
  views?: number | null
  comment_count?: number | null
  likes?: number | null
  created_at?: Date | null
  updated_at?: Date | null
}

export interface PgUser {
  id: number
  name?: string | null
  email: string
  password: string
  email_verified?: boolean | null
  bookmarks?: any
  user_defaults?: any
  image?: string | null
  created_at?: Date | null
  updated_at?: Date | null
  review_count: number
  discord_id?: string | null
  roles?: any
  total_points: number
  vote_count: number
  rating_count: number
  comment_count: number
  bookmark_count: number
  novels_read_count: number
  chapters_read_count: number
  rank_level: number
  rank_title: string
  novels_created_count: number
  chapters_created_count: number
  ratings_received_count: number
  warnings: number
  suspended_until?: Date | null
  deleted_at?: Date | null
  img?: boolean | null
}

export interface PgTag {
  id: number
  name: string
  count?: number | null
  description?: string | null
}

export interface PgGenre {
  id: number
  name: string
  count?: number | null
  description?: string | null
}

export interface PgRating {
  id: number
  novel_id: number
  user_id: number
  rating: number
  created_at?: Date | null
  updated_at?: Date | null
}

export interface PgComment {
  id: number
  user_id: number
  novel_id?: number | null
  chapter_id?: number | null
  content: string
  parent_id?: number | null
  likes: number
  created_at?: Date | null
  updated_at?: Date | null
  reports_count: number
}

// MongoDB target types
export interface MongoNovel {
  novelId: number
  uuid: string
  ownerUserId: number
  title: string
  slug: string
  description: string
  tagIds: number[] // Array of tag IDs instead of tag names
  genreIds: number[] // Array of genre IDs instead of tag names
  status: string
  approvalStatus: string // New field for approval status
  coverImg: string
  language: string
  views: number
  favoritesCount: number
  chaptersCount: number
  wordCount: number
  upvoteCount: number
  downvoteCount: number
  source: number[] // Array of source IDs like [1] or [2,3] or [1,4,2]
  firstChapter?: {
    uuid: string
    title: string
    sequence: number
  } | null
  latestChapter?: {
    uuid: string
    title: string
    sequence: number
  } | null
  createdAt?: Date
  updatedAt?: Date
}

export interface MongoChapter {
  chapterId: number
  uuid: string
  novelId: number
  novelUuid: string
  title: string
  sequence: number
  wordCount: number
  content: string
  isPublished: boolean
  publishedAt: Date
  createdAt?: Date
  updatedAt?: Date
}

// Migration result types
export interface MigrationResult {
  success: boolean
  message: string
  details?: {
    novelsMigrated: number
    chaptersMigrated: number
    tagsMigrated: number
    genresMigrated: number
    errors: string[]
    warnings: string[]
  }
}

export interface TagMigrationResult {
  success: boolean
  message: string
  details?: {
    tagsMigrated: number
    tagMappings: Record<string, number> // tag name -> tag ID mapping
    errors: string[]
    warnings: string[]
  }
}

export interface GenreMigrationResult {
  success: boolean
  message: string
  details?: {
    genresMigrated: number
    genreMappings: Record<string, number> // genre name -> genre ID mapping
    errors: string[]
    warnings: string[]
  }
}

export interface MigrationProgress {
  current: number
  total: number
  percentage: number
  currentItem: string
  status: 'preparing' | 'migrating' | 'completed' | 'error'
}

// Configuration types
export interface MigrationConfig {
  batchSize: number
  maxNovels: number
  skipExisting: boolean
  dryRun: boolean
  validateData: boolean
  createIndexes: boolean
  elasticsearchIndex: boolean
  skipTaxonomy: boolean // Skip taxonomy migration if data already exists
  rebuildIndicesAfterMigration: boolean // Rebuild all indices after migration completion
}

export interface DatabaseConfig {
  postgres: {
    host: string
    port: number
    database: string
    username: string
    password: string
    ssl: boolean
    schema: string
  }
  mongodb: {
    uri: string
    database: string
  }
  elasticsearch: {
    enabled: boolean
    nodes: string[]
    auth: {
      username: string
      password: string
    }
  }
} 