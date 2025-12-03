import {
  BrowsingHistoryModel,
  type BrowsingHistoryDocument,
} from "../infrastructure/models/BrowsingHistory.js";
import { NovelModel } from "../infrastructure/models/Novel.js";
import { ChapterModel } from "../infrastructure/models/Chapter.js";

export interface CreateBrowsingHistoryParams {
  userUuid: string; // Changed from userId to userUuid for security
  novelSlug: string;
  chapterUuid: string;
  progress?: number;
  device?: string;
}

export interface UpdateBrowsingHistoryParams {
  progress?: number;
  device?: string;
  chapterUuid?: string;
}

export const BrowsingHistoryService = {
  // Get user's browsing history with pagination
  async getUserHistory(userUuid: string, page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;
      const query = { userUuid };

      console.log(
        `🔍 Fetching user ${userUuid} browsing history (page=${page}, limit=${limit})`
      );

      const [items, total] = await Promise.all([
        BrowsingHistoryModel.find(query)
          .sort({ lastReadAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        BrowsingHistoryModel.countDocuments(query),
      ]);

      // OPTIMIZATION: Batch fetch all novels and chapters in 2 queries instead of N*2 queries
      const novelSlugs = [...new Set(items.map(item => item.novelSlug))];
      const chapterUuids = [...new Set(items.map(item => item.chapterUuid))];

      const [novels, chapters] = await Promise.all([
        NovelModel.find({ slug: { $in: novelSlugs } })
          .select("uuid slug title coverImg author authorNickname description readCount status wordCount tagIds genreIds chapterCount")
          .lean(),
        ChapterModel.find({ uuid: { $in: chapterUuids } })
          .select("uuid title sequence")
          .lean(),
      ]);

      // Create lookup maps for O(1) access
      const novelMap = new Map(novels.map(n => [n.slug, n]));
      const chapterMap = new Map(chapters.map(c => [c.uuid, c]));

      // Enrich items using the maps (no additional DB queries)
      const enrichedItems = items.map((item) => {
        const novel = novelMap.get(item.novelSlug) || null;
        const chapter = chapterMap.get(item.chapterUuid) || null;
        return {
          ...item,
          novel,
          chapter,
        };
      });

      const result = {
        items: enrichedItems,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      };

      console.log(
        `✅ Retrieved ${items.length} history items for user ${userUuid} (${novels.length} novels, ${chapters.length} chapters fetched)`
      );
      return result;
    } catch (error) {
      console.error(
        `❌ Error fetching user ${userUuid} browsing history:`,
        error
      );
      return {
        items: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      };
    }
  },

  // Get specific browsing history entry
  async getHistoryEntry(userUuid: string, novelSlug: string) {
    try {
      console.log(`🔍 Fetching history entry ${userUuid}:${novelSlug}`);

      const history = await BrowsingHistoryModel.findOne({
        userUuid,
        novelSlug,
      }).lean();

      if (history) {
        console.log(`✅ History entry found for ${userUuid}:${novelSlug}`);
      } else {
        console.log(`ℹ️ No history entry found for ${userUuid}:${novelSlug}`);
      }

      return history;
    } catch (error) {
      console.error(
        `❌ Error fetching history entry ${userUuid}:${novelSlug}:`,
        error
      );
      return null;
    }
  },

  // Create or update browsing history entry
  async upsertHistoryEntry(params: CreateBrowsingHistoryParams) {
    try {
      const {
        userUuid,
        novelSlug,
        chapterUuid,
        progress = 0,
        device = "",
      } = params;

      // Get novel and chapter details
      const [novel, chapter] = await Promise.all([
        NovelModel.findOne({ slug: novelSlug })
          .select("uuid slug title")
          .lean(),
        ChapterModel.findOne({ uuid: chapterUuid })
          .select("uuid title sequence")
          .lean(),
      ]);

      if (!novel || !chapter) {
        throw new Error("Novel or chapter not found");
      }

      const historyData = {
        userUuid,
        novelSlug,
        chapterUuid,
        chapterTitle: chapter.title,
        chapterSequence: chapter.sequence,
        progress,
        device,
        lastReadAt: new Date(),
      };

      const history = await BrowsingHistoryModel.findOneAndUpdate(
        { userUuid, novelSlug },
        { $set: historyData },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
        }
      );

      return history;
    } catch (error) {
      console.error(`❌ Error upserting history entry:`, error);
      throw error;
    }
  },

  // Update existing browsing history entry
  async updateHistoryEntry(
    userUuid: string,
    novelSlug: string,
    updates: UpdateBrowsingHistoryParams
  ) {
    try {
      const { chapterUuid, ...rest } = updates || {};

      let derivedChapter: { title?: string; sequence?: number } | null = null;
      if (chapterUuid) {
        const chapter = await ChapterModel.findOne({ uuid: chapterUuid })
          .select("title sequence")
          .lean();
        if (chapter) {
          derivedChapter = { title: chapter.title, sequence: chapter.sequence };
        }
      }

      const $set: any = {
        ...rest,
        lastReadAt: new Date(),
      };
      if (chapterUuid) {
        $set.chapterUuid = chapterUuid;
        if (derivedChapter?.title) $set.chapterTitle = derivedChapter.title;
        if (typeof derivedChapter?.sequence === "number")
          $set.chapterSequence = derivedChapter.sequence as number;
      }

      const history = await BrowsingHistoryModel.findOneAndUpdate(
        { userUuid, novelSlug },
        { $set },
        { new: true }
      );

      return history;
    } catch (error) {
      console.error(
        `❌ Error updating history entry ${userUuid}:${novelSlug}:`,
        error
      );
      throw error;
    }
  },

  // Delete browsing history entry
  async deleteHistoryEntry(userUuid: string, novelSlug: string) {
    try {
      const result = await BrowsingHistoryModel.deleteOne({
        userUuid,
        novelSlug,
      });

      return {
        success: result.deletedCount > 0,
        deletedCount: result.deletedCount,
      };
    } catch (error) {
      console.error(
        `❌ Error deleting history entry ${userUuid}:${novelSlug}:`,
        error
      );
      throw error;
    }
  },

  // Clear all browsing history for a user
  async clearUserHistory(userUuid: string) {
    try {
      const result = await BrowsingHistoryModel.deleteMany({ userUuid });

      return {
        success: result.deletedCount > 0,
        deletedCount: result.deletedCount,
      };
    } catch (error) {
      console.error(`❌ Error clearing history for user ${userUuid}:`, error);
      throw error;
    }
  },

  // Get reading statistics for a user
  async getUserReadingStats(userUuid: string) {
    try {
      console.log(`📊 Calculating reading stats for user ${userUuid}`);

      const stats = await BrowsingHistoryModel.aggregate([
        { $match: { userUuid } },
        {
          $group: {
            _id: null,
            totalNovels: { $addToSet: "$novelSlug" },
            totalEntries: { $sum: 1 },
            avgProgress: { $avg: "$progress" },
            lastReadAt: { $max: "$lastReadAt" },
            mostReadNovel: { $first: "$novelSlug" },
          },
        },
        {
          $project: {
            _id: 0,
            totalNovelsRead: { $size: "$totalNovels" },
            totalHistoryEntries: "$totalEntries",
            averageProgress: { $round: ["$avgProgress", 2] },
            lastReadAt: 1,
            mostReadNovel: 1,
          },
        },
      ]);

      const result =
        stats.length > 0
          ? stats[0]
          : {
              totalNovelsRead: 0,
              totalHistoryEntries: 0,
              averageProgress: 0,
              lastReadAt: null,
              mostReadNovel: null,
            };

      console.log(
        `✅ Reading stats calculated for user ${userUuid}: ${result.totalNovelsRead} novels, ${result.totalHistoryEntries} entries`
      );
      return result;
    } catch (error) {
      console.error(
        `❌ Error getting reading stats for user ${userUuid}:`,
        error
      );
      return {
        totalNovelsRead: 0,
        totalHistoryEntries: 0,
        averageProgress: 0,
        lastReadAt: null,
        mostReadNovel: null,
      };
    }
  },

  // Bulk sync local history entries with server (optimized merge strategy)
  async bulkSyncHistory(userUuid: string, localEntries: Array<{
    novelSlug: string;
    chapterUuid: string;
    chapterTitle?: string;
    chapterSequence?: number;
    progress?: number;
    device?: string;
    lastReadAt?: string | Date;
  }>) {
    try {
      console.log(`🔄 Bulk syncing ${localEntries.length} local history entries for user ${userUuid}`);

      if (localEntries.length === 0) {
        return { synced: 0, skipped: 0, failed: 0, errors: [] };
      }

      const results = {
        synced: 0,
        skipped: 0,
        failed: 0,
        errors: [] as string[],
      };

      // OPTIMIZATION: Batch fetch all existing server entries in ONE query
      const novelSlugs = localEntries.map(e => e.novelSlug);
      const existingEntries = await BrowsingHistoryModel.find({
        userUuid,
        novelSlug: { $in: novelSlugs }
      }).lean();
      
      // Create lookup map for O(1) access
      const existingMap = new Map(existingEntries.map(e => [e.novelSlug, e]));
      console.log(`📊 Found ${existingEntries.length} existing entries on server`);

      // OPTIMIZATION: Batch fetch all chapter info in ONE query
      const chapterUuidsNeedingInfo = localEntries
        .filter(e => !e.chapterTitle || typeof e.chapterSequence !== 'number')
        .map(e => e.chapterUuid);
      
      const chapters = chapterUuidsNeedingInfo.length > 0 
        ? await ChapterModel.find({ uuid: { $in: chapterUuidsNeedingInfo } })
            .select("uuid title sequence")
            .lean()
        : [];
      
      const chapterMap = new Map(chapters.map(c => [c.uuid, c]));
      console.log(`📊 Fetched ${chapters.length} chapter details`);

      // Prepare bulk operations
      const bulkOps: any[] = [];

      for (const entry of localEntries) {
        try {
          const { novelSlug, chapterUuid, chapterTitle, chapterSequence, progress, device, lastReadAt } = entry;
          const localReadAt = lastReadAt ? new Date(lastReadAt) : new Date();
          const existing = existingMap.get(novelSlug);

          // Get chapter info from map if not provided
          let finalChapterTitle = chapterTitle;
          let finalChapterSequence = chapterSequence;
          
          if (!finalChapterTitle || typeof finalChapterSequence !== 'number') {
            const chapterInfo = chapterMap.get(chapterUuid);
            if (chapterInfo) {
              finalChapterTitle = finalChapterTitle || chapterInfo.title;
              finalChapterSequence = finalChapterSequence ?? chapterInfo.sequence;
            }
          }

          if (existing) {
            const existingReadAt = new Date(existing.lastReadAt);
            
            // Only update if local is newer
            if (localReadAt > existingReadAt) {
              bulkOps.push({
                updateOne: {
                  filter: { userUuid, novelSlug },
                  update: {
                    $set: {
                      chapterUuid,
                      chapterTitle: finalChapterTitle || existing.chapterTitle,
                      chapterSequence: finalChapterSequence ?? existing.chapterSequence,
                      progress: progress ?? existing.progress,
                      device: device || existing.device,
                      lastReadAt: localReadAt,
                      updatedAt: new Date(),
                    },
                  },
                },
              });
              results.synced++;
            } else {
              results.skipped++;
            }
          } else {
            // Create new entry if we have valid chapter info
            if (finalChapterTitle && typeof finalChapterSequence === 'number') {
              bulkOps.push({
                insertOne: {
                  document: {
                    userUuid,
                    novelSlug,
                    chapterUuid,
                    chapterTitle: finalChapterTitle,
                    chapterSequence: finalChapterSequence,
                    progress: progress ?? 0,
                    device: device || '',
                    lastReadAt: localReadAt,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                },
              });
              results.synced++;
            } else {
              results.failed++;
              results.errors.push(`Missing chapter info for ${novelSlug}`);
            }
          }
        } catch (error) {
          results.failed++;
          const errorMsg = error instanceof Error ? error.message : String(error);
          results.errors.push(`${entry.novelSlug}: ${errorMsg}`);
        }
      }

      // Execute all operations in one bulk write
      if (bulkOps.length > 0) {
        console.log(`📝 Executing ${bulkOps.length} bulk operations...`);
        await BrowsingHistoryModel.bulkWrite(bulkOps, { ordered: false });
      }

      console.log(
        `✅ Bulk sync complete for user ${userUuid}: ${results.synced} synced, ${results.skipped} skipped, ${results.failed} failed`
      );
      return results;
    } catch (error) {
      console.error(`❌ Error during bulk sync for user ${userUuid}:`, error);
      throw error;
    }
  },
};
