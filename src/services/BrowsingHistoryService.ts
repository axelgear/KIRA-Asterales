import {
  BrowsingHistoryModel,
  type BrowsingHistoryDocument,
} from "../infrastructure/models/BrowsingHistory.js";
import { NovelModel } from "../infrastructure/models/Novel.js";
import { ChapterModel } from "../infrastructure/models/Chapter.js";

export interface CreateBrowsingHistoryParams {
  userId: number;
  novelSlug: string;
  chapterUuid: string;
  progress?: number;
  device?: string;
}

export interface UpdateBrowsingHistoryParams {
  progress?: number;
  device?: string;
}

export const BrowsingHistoryService = {
  // Get user's browsing history with pagination
  async getUserHistory(userId: number, page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;
      const query = { userId };

      console.log(
        `🔍 Fetching user ${userId} browsing history (page=${page}, limit=${limit})`
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
        `✅ Retrieved ${items.length} history items for user ${userId}`
      );
      return result;
    } catch (error) {
      console.error(
        `❌ Error fetching user ${userId} browsing history:`,
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
  async getHistoryEntry(userId: number, novelSlug: string) {
    try {
      console.log(`🔍 Fetching history entry ${userId}:${novelSlug}`);

      const history = await BrowsingHistoryModel.findOne({
        userId,
        novelSlug,
      }).lean();

      if (history) {
        console.log(`✅ History entry found for ${userId}:${novelSlug}`);
      } else {
        console.log(`ℹ️ No history entry found for ${userId}:${novelSlug}`);
      }

      return history;
    } catch (error) {
      console.error(
        `❌ Error fetching history entry ${userId}:${novelSlug}:`,
        error
      );
      return null;
    }
  },

  // Create or update browsing history entry
  async upsertHistoryEntry(params: CreateBrowsingHistoryParams) {
    try {
      const {
        userId,
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
        userId,
        novelSlug,
        chapterUuid,
        chapterTitle: chapter.title,
        chapterSequence: chapter.sequence,
        progress,
        device,
        lastReadAt: new Date(),
      };

      const history = await BrowsingHistoryModel.findOneAndUpdate(
        { userId, novelSlug },
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
    userId: number,
    novelSlug: string,
    updates: UpdateBrowsingHistoryParams
  ) {
    try {
      const history = await BrowsingHistoryModel.findOneAndUpdate(
        { userId, novelSlug },
        {
          $set: {
            ...updates,
            lastReadAt: new Date(),
          },
        },
        { new: true }
      );

      return history;
    } catch (error) {
      console.error(
        `❌ Error updating history entry ${userId}:${novelSlug}:`,
        error
      );
      throw error;
    }
  },

  // Delete browsing history entry
  async deleteHistoryEntry(userId: number, novelSlug: string) {
    try {
      const result = await BrowsingHistoryModel.deleteOne({
        userId,
        novelSlug,
      });

      return {
        success: result.deletedCount > 0,
        deletedCount: result.deletedCount,
      };
    } catch (error) {
      console.error(
        `❌ Error deleting history entry ${userId}:${novelSlug}:`,
        error
      );
      throw error;
    }
  },

  // Clear all browsing history for a user
  async clearUserHistory(userId: number) {
    try {
      const result = await BrowsingHistoryModel.deleteMany({ userId });

      return {
        success: result.deletedCount > 0,
        deletedCount: result.deletedCount,
      };
    } catch (error) {
      console.error(`❌ Error clearing history for user ${userId}:`, error);
      throw error;
    }
  },

  // Get reading statistics for a user
  async getUserReadingStats(userId: number) {
    try {
      console.log(`📊 Calculating reading stats for user ${userId}`);

      const stats = await BrowsingHistoryModel.aggregate([
        { $match: { userId } },
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
        `✅ Reading stats calculated for user ${userId}: ${result.totalNovelsRead} novels, ${result.totalHistoryEntries} entries`
      );
      return result;
    } catch (error) {
      console.error(
        `❌ Error getting reading stats for user ${userId}:`,
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
};
