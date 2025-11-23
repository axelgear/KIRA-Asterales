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

      // Enrich items with novel and chapter details
      const enrichedItems = await Promise.all(
        items.map(async (item) => {
          try {
            const [novel, chapter] = await Promise.all([
              NovelModel.findOne({ slug: item.novelSlug })
                .select("uuid slug title coverImg author authorNickname description readCount status wordCount tagIds genreIds")
                .lean(),
              ChapterModel.findOne({ uuid: item.chapterUuid })
                .select("uuid title sequence")
                .lean(),
            ]);

            return {
              ...item,
              novel: novel || null,
              chapter: chapter || null,
            };
          } catch (error) {
            console.warn(`⚠️ Failed to enrich history item ${item._id}:`, error);
            return {
              ...item,
              novel: null,
              chapter: null,
            };
          }
        })
      );

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
        `✅ Retrieved ${items.length} history items for user ${userUuid}`
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

  // Bulk sync local history entries with server (merge strategy)
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

      const results = {
        synced: 0,
        skipped: 0,
        failed: 0,
        errors: [] as string[],
      };

      // Process entries in batches to avoid overwhelming the database
      const batchSize = 50;
      for (let i = 0; i < localEntries.length; i += batchSize) {
        const batch = localEntries.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(async (entry) => {
            try {
              const { novelSlug, chapterUuid, chapterTitle, chapterSequence, progress, device, lastReadAt } = entry;

              // Check if server already has this entry
              const existing = await BrowsingHistoryModel.findOne({
                userUuid,
                novelSlug,
              }).lean();

              const localReadAt = lastReadAt ? new Date(lastReadAt) : new Date();

              // Merge strategy: keep the entry with the most recent lastReadAt
              if (existing) {
                const existingReadAt = new Date(existing.lastReadAt);
                
                // If local entry is newer, update server
                if (localReadAt > existingReadAt) {
                  // Get chapter details if not provided
                  let finalChapterTitle = chapterTitle;
                  let finalChapterSequence = chapterSequence;

                  if (!finalChapterTitle || typeof finalChapterSequence !== 'number') {
                    const chapter = await ChapterModel.findOne({ uuid: chapterUuid })
                      .select("title sequence")
                      .lean();
                    
                    if (chapter) {
                      finalChapterTitle = finalChapterTitle || chapter.title;
                      finalChapterSequence = finalChapterSequence ?? chapter.sequence;
                    }
                  }

                  await BrowsingHistoryModel.findOneAndUpdate(
                    { userUuid, novelSlug },
                    {
                      $set: {
                        chapterUuid,
                        chapterTitle: finalChapterTitle || existing.chapterTitle,
                        chapterSequence: finalChapterSequence ?? existing.chapterSequence,
                        progress: progress ?? existing.progress,
                        device: device || existing.device,
                        lastReadAt: localReadAt,
                        updatedAt: new Date(),
                      },
                    }
                  );

                  results.synced++;
                  console.log(`✅ Updated server entry for ${novelSlug} (local was newer)`);
                } else {
                  results.skipped++;
                  console.log(`⏭️ Skipped ${novelSlug} (server entry is newer or equal)`);
                }
              } else {
                // Entry doesn't exist on server, create it
                // Get chapter details if not provided
                let finalChapterTitle = chapterTitle;
                let finalChapterSequence = chapterSequence;

                if (!finalChapterTitle || typeof finalChapterSequence !== 'number') {
                  const chapter = await ChapterModel.findOne({ uuid: chapterUuid })
                    .select("title sequence")
                    .lean();
                  
                  if (chapter) {
                    finalChapterTitle = finalChapterTitle || chapter.title;
                    finalChapterSequence = finalChapterSequence ?? chapter.sequence;
                  }
                }

                // Only create if we have valid chapter info
                if (finalChapterTitle && typeof finalChapterSequence === 'number') {
                  await BrowsingHistoryModel.create({
                    userUuid,
                    novelSlug,
                    chapterUuid,
                    chapterTitle: finalChapterTitle,
                    chapterSequence: finalChapterSequence,
                    progress: progress ?? 0,
                    device: device || '',
                    lastReadAt: localReadAt,
                  });

                  results.synced++;
                  console.log(`✅ Created new server entry for ${novelSlug}`);
                } else {
                  results.failed++;
                  results.errors.push(`Missing chapter info for ${novelSlug}`);
                  console.warn(`⚠️ Skipped ${novelSlug} - missing chapter information`);
                }
              }
            } catch (error) {
              results.failed++;
              const errorMsg = error instanceof Error ? error.message : String(error);
              results.errors.push(`${entry.novelSlug}: ${errorMsg}`);
              console.error(`❌ Failed to sync entry ${entry.novelSlug}:`, error);
            }
          })
        );
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
