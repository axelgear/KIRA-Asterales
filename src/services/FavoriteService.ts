import {
	FavoriteModel,
	type FavoriteDocument,
} from "../infrastructure/models/Favorite.js";
import { NovelModel } from "../infrastructure/models/Novel.js";
import { NovelSearchService } from "./NovelSearchService.js";

export interface CreateFavoriteParams {
	userId: number;
	novelId: number;
}

export interface FavoriteWithNovelDetails {
	_id: string;
	userUuid: string; // Updated to use userUuid instead of userId
	novelId: number;
	novelUuid: string;
	novelSlug: string;
	novelTitle: string;
	novelCover?: string;
	novelAuthor?: string;
	novelDescription?: string;
	novelStatus?: string;
	novelRating?: number;
	novelWordCount?: number;
	novelChapterCount?: number;
	novelReadCount?: number;
	novelBookmarkCount?: number;
	tagIds?: number[];
	genreIds?: number[];
	createdAt: string;
	updatedAt: string;
}

export const FavoriteService = {
	// Add a novel to user's favorites by userUuid (secure)
	async addFavorite(userUuid: string, novelId: number) {
		try {
			console.log(`📚 Adding favorite: userUuid=${userUuid}, novelId=${novelId}`);
			
			// Check if already favorited
			const existingFavorite = await FavoriteModel.findOne({ userUuid, novelId }).lean();
			if (existingFavorite) {
				return { success: false, message: 'Novel is already in favorites' };
			}
			
			// Get novel details
			const novel = await NovelModel.findOneAndUpdate(
				{ novelId }, 
				{ $inc: { favoritesCount: 1 } }, 
				{ new: true }
			);
			
			if (!novel) {
				return { success: false, message: 'Novel not found' };
			}
			
			// Create favorite entry with userUuid (secure)
			await FavoriteModel.create({
				userUuid,
				novelId,
				novelUuid: novel.uuid,
			});
			
			// Update search index and cache
			if (novel) {
				try {
					await NovelSearchService.indexNovel(novel);
					console.log(`🔍 Updated search index for novel ${novelId}`);
				} catch (indexError) {
					console.warn('⚠️ Failed to update search index:', indexError);
				}
				
				try {
					const { NovelService } = await import('./NovelService.js');
					await NovelService.invalidateNovelCache(novel.slug);
					console.log(`🗑️ Invalidated cache for novel ${novel.slug}`);
				} catch (cacheError) {
					console.warn('⚠️ Failed to invalidate cache:', cacheError);
				}
			}
			
			console.log(`✅ Successfully added favorite: userUuid=${userUuid}, novelId=${novelId}`);
			return { success: true, message: 'Added to favorites' };
			
		} catch (error) {
			console.error('❌ Error adding favorite:', error);
			return { success: false, message: 'Failed to add to favorites' };
		}
	},

	// Add a novel to user's favorites by novel UUID (public API)
	async addFavoriteByUuid(userUuid: string, novelUuid: string) {
		try {
			console.log(`📚 Adding favorite by UUID: userUuid=${userUuid}, novelUuid=${novelUuid}`);
			
			// First get the novel to find novelId
			const novel = await NovelModel.findOne({ uuid: novelUuid }).select('novelId').lean();
			if (!novel) {
				return { success: false, message: 'Novel not found' };
			}
			
			return await this.addFavorite(userUuid, novel.novelId);
		} catch (error) {
			console.error('❌ Error adding favorite by UUID:', error);
			return { success: false, message: 'Failed to add to favorites' };
		}
	},

	// Remove a novel from user's favorites by userUuid (secure)
	async removeFavorite(userUuid: string, novelId: number) {
		try {
			console.log(`🗑️ Removing favorite: userUuid=${userUuid}, novelId=${novelId}`);
			
			// Remove favorite entry
			const deleted = await FavoriteModel.deleteOne({ userUuid, novelId });
			
			if (deleted.deletedCount === 0) {
				return { success: false, message: 'Favorite not found' };
			}
			
			// Decrease favorite count
			const novel = await NovelModel.findOneAndUpdate(
				{ novelId }, 
				{ $inc: { favoritesCount: -1 } }, 
				{ new: true }
			);
			
			// Update search index and cache
			if (novel) {
				try {
					await NovelSearchService.indexNovel(novel);
					console.log(`🔍 Updated search index for novel ${novelId}`);
				} catch (indexError) {
					console.warn('⚠️ Failed to update search index:', indexError);
				}
				
				try {
					const { NovelService } = await import('./NovelService.js');
					await NovelService.invalidateNovelCache(novel.slug);
					console.log(`🗑️ Invalidated cache for novel ${novel.slug}`);
				} catch (cacheError) {
					console.warn('⚠️ Failed to invalidate cache:', cacheError);
				}
			}
			
			console.log(`✅ Successfully removed favorite: userUuid=${userUuid}, novelId=${novelId}`);
			return { success: true, message: 'Removed from favorites' };
			
		} catch (error) {
			console.error('❌ Error removing favorite:', error);
			return { success: false, message: 'Failed to remove from favorites' };
		}
	},

	// Remove a novel from user's favorites by novel UUID (public API)
	async removeFavoriteByUuid(userUuid: string, novelUuid: string) {
		try {
			console.log(`🗑️ Removing favorite by UUID: userUuid=${userUuid}, novelUuid=${novelUuid}`);
			
			// First get the novel to find novelId
			const novel = await NovelModel.findOne({ uuid: novelUuid }).select('novelId').lean();
			if (!novel) {
				return { success: false, message: 'Novel not found' };
			}
			
			return await this.removeFavorite(userUuid, novel.novelId);
		} catch (error) {
			console.error('❌ Error removing favorite by UUID:', error);
			return { success: false, message: 'Failed to remove from favorites' };
		}
	},

	// Get user's favorites with novel details and pagination
	async getUserFavorites(userUuid: string, page: number = 1, pageSize: number = 50) {
		try {
			console.log(`📋 Fetching favorites: userUuid=${userUuid}, page=${page}, pageSize=${pageSize}`);
			
			const skip = (page - 1) * pageSize;
			
			// Get favorites with novel details via aggregation
			const favorites = await FavoriteModel.aggregate([
				{ $match: { userUuid } },
				{ $sort: { createdAt: -1 } }, // Most recent first
				{ $skip: skip },
				{ $limit: pageSize },
				{
					$lookup: {
						from: 'novels', // Collection name for NovelModel
						localField: 'novelId',
						foreignField: 'novelId',
						as: 'novel'
					}
				},
				{ $unwind: '$novel' }, // Flatten the novel array
				{
					$project: {
						_id: 1,
						userUuid: 1,
						novelId: 1,
						novelUuid: '$novel.uuid',
						novelSlug: '$novel.slug',
						novelTitle: '$novel.title',
						novelCover: '$novel.coverImg',
						novelAuthor: { $toString: '$novel.ownerUserId' }, // Convert ownerUserId to string as author fallback
						novelDescription: '$novel.description',
						novelStatus: '$novel.status',
						novelRating: { $ifNull: ['$novel.upvoteCount', 0] }, // Use upvoteCount as rating fallback
						novelWordCount: { $literal: 0 }, // Not available in Novel model, set literal 0
						novelChapterCount: '$novel.chaptersCount', // Correct field name
						novelReadCount: '$novel.views', // Use views as read count
						novelBookmarkCount: '$novel.favoritesCount',
						tagIds: '$novel.tagIds',
						genreIds: '$novel.genreIds',
						createdAt: 1,
						updatedAt: 1
					}
				}
			]) as FavoriteWithNovelDetails[];
			
			// Get total count
			const totalCount = await FavoriteModel.countDocuments({ userUuid });
			
			console.log(`📊 Found ${favorites.length} favorites (total: ${totalCount})`);
			
			return {
				success: true,
				favorites,
				pagination: {
					page,
					pageSize,
					total: totalCount,
					totalPages: Math.ceil(totalCount / pageSize)
				}
			};
		} catch (error) {
			console.error('❌ Error getting user favorites:', error);
			return { success: false, message: 'Failed to get favorites', favorites: [] };
		}
	},

	// Check if user has favorited a specific novel by userUuid (secure)
	async checkFavorite(userUuid: string, novelId: number) {
		try {
			console.log(`🔍 Checking favorite: userUuid=${userUuid}, novelId=${novelId}`);
			
			const favorite = await FavoriteModel.findOne({ userUuid, novelId }).lean();
			const isBookmarked = !!favorite;
			
			console.log(`📋 Favorite check result: ${isBookmarked}`);
			
			return {
				success: true,
				isBookmarked,
				favoriteId: favorite?._id
			};
		} catch (error) {
			console.error('❌ Error checking favorite status:', error);
			return { success: false, isBookmarked: false };
		}
	},

	// Check if user has favorited a novel by novel UUID (public API)
	async checkFavoriteByUuid(userUuid: string, novelUuid: string) {
		try {
			console.log(`🔍 Checking favorite by UUID: userUuid=${userUuid}, novelUuid=${novelUuid}`);
			
			// First get the novel to find novelId
			const novel = await NovelModel.findOne({ uuid: novelUuid }).select('novelId').lean();
			if (!novel) {
				return { success: false, isBookmarked: false, message: 'Novel not found' };
			}
			
			return await this.checkFavorite(userUuid, novel.novelId);
		} catch (error) {
			console.error('❌ Error checking favorite by UUID:', error);
			return { success: false, isBookmarked: false };
		}
	},

	// Check favorite by novel slug (convenience method)
	async checkFavoriteBySlug(userUuid: string, novelSlug: string) {
		try {
			console.log(`🔍 Checking favorite by slug: userUuid=${userUuid}, slug=${novelSlug}`);
			
			// First get the novel to find novelId
			const novel = await NovelModel.findOne({ slug: novelSlug }).select('novelId').lean();
			if (!novel) {
				return { success: false, isBookmarked: false, message: 'Novel not found' };
			}
			
			return await this.checkFavorite(userUuid, novel.novelId);
		} catch (error) {
			console.error('❌ Error checking favorite by slug:', error);
			return { success: false, isBookmarked: false };
		}
	},

	// Get favorites count for a user
	async getUserFavoritesCount(userUuid: string) {
		try {
			console.log(`📊 Getting favorites count for user ${userUuid}`);
			
			const count = await FavoriteModel.countDocuments({ userUuid });
			
			console.log(`📋 User ${userUuid} favorites count: ${count}`);
			
			return { success: true, count };
		} catch (error) {
			console.error('❌ Error getting favorites count:', error);
			return { success: false, count: 0 };
		}
	},

	// Get novel's favorites count by novelId (internal use)
	async getNovelFavoritesCount(novelId: number) {
		try {
			const count = await FavoriteModel.countDocuments({ novelId });
			return { success: true, count };
		} catch (error) {
			console.error('❌ Error getting novel favorites count:', error);
			return { success: false, count: 0 };
		}
	},

	// Get novel's favorites count by UUID (public API)
	async getNovelFavoritesCountByUuid(novelUuid: string) {
		try {
			console.log(`📊 Getting novel favorites count by UUID: ${novelUuid}`);
			
			// First get the novel to find novelId
			const novel = await NovelModel.findOne({ uuid: novelUuid }).select('novelId').lean();
			if (!novel) {
				return { success: false, count: 0, message: 'Novel not found' };
			}
			
			const count = await FavoriteModel.countDocuments({ novelId: novel.novelId });
			
			console.log(`📋 Novel ${novelUuid} favorites count: ${count}`);
			
			return { success: true, count };
		} catch (error) {
			console.error('❌ Error getting novel favorites count by UUID:', error);
			return { success: false, count: 0 };
		}
	},

	// Clear all favorites for a user (admin function)
	async clearUserFavorites(userUuid: string) {
		try {
			console.log(`🧹 Clearing all favorites for user ${userUuid}`);
			
			// Get all novels that will have their count decreased
			const favorites = await FavoriteModel.find({ userUuid }).select('novelId').lean();
			const novelIds = favorites.map(f => f.novelId);
			
			// Remove all favorites
			const deleted = await FavoriteModel.deleteMany({ userUuid });
			
			// Decrease favorite counts for affected novels
			if (novelIds.length > 0) {
				await NovelModel.updateMany(
					{ novelId: { $in: novelIds } },
					{ $inc: { favoritesCount: -1 } }
				);
			}
			
			console.log(`✅ Cleared ${deleted.deletedCount} favorites for user ${userUuid}`);
			
			return { 
				success: true, 
				message: `Cleared ${deleted.deletedCount} favorites`,
				deletedCount: deleted.deletedCount 
			};
		} catch (error) {
			console.error('❌ Error clearing user favorites:', error);
			return { success: false, message: 'Failed to clear favorites' };
		}
	},

	// Clear all favorites for a specific novel (called when novel is deleted)
	async clearNovelFavorites(novelId: number) {
		try {
			console.log(`🧹 Clearing all favorites for novel ${novelId}`);
			
			// Remove all favorites for this novel
			const deleted = await FavoriteModel.deleteMany({ novelId });
			
			console.log(`✅ Cleared ${deleted.deletedCount} favorites for novel ${novelId}`);
			
			return { 
				success: true, 
				message: `Cleared ${deleted.deletedCount} favorites for novel`,
				deletedCount: deleted.deletedCount 
			};
		} catch (error) {
			console.error('❌ Error clearing novel favorites:', error);
			return { success: false, message: 'Failed to clear novel favorites' };
		}
	}
};
