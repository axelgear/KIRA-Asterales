#!/usr/bin/env tsx

import { databaseManager } from '../infrastructure/database.js'
import { elasticsearchManager, getElasticsearchClient } from '../infrastructure/elasticsearch.js'
import { redisManager } from '../infrastructure/redis.js'
import { NovelModel } from '../infrastructure/models/Novel.js'
import { ChapterModel } from '../infrastructure/models/Chapter.js'
import { NovelSearchService } from '../services/NovelSearchService.js'
import { ChapterSearchService } from '../services/ChapterSearchService.js'

const NOVEL_CURSOR_KEY = 'es:cursor:novel'
const CHAPTER_CURSOR_KEY = 'es:cursor:chapter'
const BATCH_SIZE = parseInt(process.env.INDEXER_BATCH_SIZE || '500', 10)
const NOVEL_INDEX = 'novels'
const CHAPTER_INDEX = 'chapters'

function hasFlag(flag: string) {
  return process.argv.includes(flag)
}

async function resetCursors(reason: string) {
  const redis = redisManager.getClient()
  await redis.set(NOVEL_CURSOR_KEY, '0')
  await redis.set(CHAPTER_CURSOR_KEY, '0')
  console.log(`🔄 Cursors reset to 0 (${reason})`)
}

async function ensureIndicesAndMaybeResetCursors() {
  const client = getElasticsearchClient()

  // Ensure indices exist
  await NovelSearchService.ensureIndex()
  await ChapterSearchService.ensureIndex()

  // Detect emptiness and reset cursors if needed
  try {
    const [novelCount, chapterCount] = await Promise.all([
      client.count({ index: NOVEL_INDEX }).then(r => (typeof r.count === 'number' ? r.count : 0)).catch(() => 0),
      client.count({ index: CHAPTER_INDEX }).then(r => (typeof r.count === 'number' ? r.count : 0)).catch(() => 0)
    ])

    if (novelCount === 0 || chapterCount === 0) {
      await resetCursors('index empty')
    }
  } catch (e) {
    console.warn('⚠️ Failed to count indices; skipping auto-reset:', e)
  }
}

async function indexNovelsIncremental() {
  const redis = redisManager.getClient()
  const lastTsStr = (await redis.get(NOVEL_CURSOR_KEY)) || '0'
  const lastTs = parseInt(lastTsStr, 10) || 0

  let processed = 0
  while (true) {
    const novels = await NovelModel.find({ updatedAt: { $gt: new Date(lastTs) } })
      .sort({ updatedAt: 1 })
      .limit(BATCH_SIZE)
      .lean()

    if (novels.length === 0) break

    for (const novel of novels) {
      await NovelSearchService.indexNovel(novel)
    }

    processed += novels.length
    const lastNovel = novels[novels.length - 1]
    const maxTs = lastNovel && lastNovel.updatedAt ? (lastNovel.updatedAt instanceof Date ? (lastNovel.updatedAt as Date).getTime() : Date.parse(String(lastNovel.updatedAt))) : Date.now()
    await redis.set(NOVEL_CURSOR_KEY, String(maxTs))

    if (novels.length < BATCH_SIZE) break
  }
  return processed
}

async function indexChaptersIncremental() {
  const redis = redisManager.getClient()
  const lastTsStr = (await redis.get(CHAPTER_CURSOR_KEY)) || '0'
  const lastTs = parseInt(lastTsStr, 10) || 0

  let processed = 0
  while (true) {
    const chapters = await ChapterModel.find({ updatedAt: { $gt: new Date(lastTs) }, isPublished: true })
      .sort({ updatedAt: 1 })
      .limit(BATCH_SIZE)
      .lean()

    if (chapters.length === 0) break

    await ChapterSearchService.bulkIndexChapters(chapters.map(c => ({
      uuid: c.uuid,
      chapterId: c.chapterId,
      novelUuid: c.novelUuid,
      title: c.title,
      sequence: c.sequence,
      wordCount: c.wordCount || 0,
      isPublished: c.isPublished !== false,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      publishedAt: c.publishedAt || c.createdAt
    })))

    processed += chapters.length
    const lastChapter = chapters[chapters.length - 1]
    const maxTs = lastChapter && lastChapter.updatedAt ? (lastChapter.updatedAt instanceof Date ? (lastChapter.updatedAt as Date).getTime() : Date.parse(String(lastChapter.updatedAt))) : Date.now()
    await redis.set(CHAPTER_CURSOR_KEY, String(maxTs))

    if (chapters.length < BATCH_SIZE) break
  }
  return processed
}

async function main() {
  try {
    const forceReset = hasFlag('--reset-cursors') || hasFlag('--full')

    await databaseManager.connect()
    await elasticsearchManager.connect()
    await redisManager.connect()

    if (forceReset) {
      await resetCursors('manual --reset-cursors')
    }

    await ensureIndicesAndMaybeResetCursors()

    const n = await indexNovelsIncremental()
    const c = await indexChaptersIncremental()

    console.log(`✅ Incremental indexing done. Novels: ${n}, Chapters: ${c}`)
  } catch (e) {
    console.error('💥 Incremental indexer failed:', e)
    process.exit(1)
  } finally {
    try { await databaseManager.disconnect() } catch {}
    try { await elasticsearchManager.disconnect() } catch {}
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
} 