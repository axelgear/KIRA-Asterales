import type { FastifyRequest, FastifyReply } from 'fastify'
import { FavoriteService } from '../../services/FavoriteService.js'
import { validateTokenAndGetUserUuid } from '../../common/jwtAuth.js'

export const FavoriteController = {
	// POST /favorites/add - Add novel to favorites
	add: async (request: FastifyRequest) => {
		try {
			const body = request.body as any
			const novelUuid = String(body?.novelUuid)

			// Validate JWT token and get userUuid securely
			const userUuid = validateTokenAndGetUserUuid(request)
			if (!userUuid) {
				return { success: false, message: 'Authentication required - invalid or missing token' }
			}

			console.log('📚 Add favorite request:', { userUuid, novelUuid })

			if (!novelUuid) {
				return { success: false, message: 'Invalid novel UUID' }
			}

			const result = await FavoriteService.addFavoriteByUuid(userUuid, novelUuid)

			console.log(`📋 Add favorite result: ${result.success}`)

			return result
		} catch (error) {
			console.error('❌ Error adding favorite:', error)
			return {
				success: false,
				message: 'Error adding to favorites',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// POST /favorites/remove - Remove novel from favorites
	remove: async (request: FastifyRequest) => {
		try {
			const body = request.body as any
			const novelUuid = String(body?.novelUuid)

			// Validate JWT token and get userUuid securely
			const userUuid = validateTokenAndGetUserUuid(request)
			if (!userUuid) {
				return { success: false, message: 'Authentication required - invalid or missing token' }
			}

			console.log('🗑️ Remove favorite request:', { userUuid, novelUuid })

			if (!novelUuid) {
				return { success: false, message: 'Invalid novel UUID' }
			}

			const result = await FavoriteService.removeFavoriteByUuid(userUuid, novelUuid)

			console.log(`📋 Remove favorite result: ${result.success}`)

			return result
		} catch (error) {
			console.error('❌ Error removing favorite:', error)
			return {
				success: false,
				message: 'Error removing from favorites',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// GET /favorites/list - Get user's favorites with pagination
	list: async (request: FastifyRequest) => {
		try {
			const q = request.query as any
			const page = Number(q.page) || 1
			const pageSize = Math.min(Number(q.pageSize) || 20, 100) // Max 100 per page

			// Validate JWT token and get userUuid securely
			const userUuid = validateTokenAndGetUserUuid(request)
			if (!userUuid) {
				return { success: false, message: 'Authentication required - invalid or missing token' }
			}

			console.log('📋 List favorites request:', { userUuid, page, pageSize })

			const result = await FavoriteService.getUserFavorites(userUuid, page, pageSize)

			console.log(`📊 Favorites result: ${result.favorites?.length || 0} items, total: ${result.pagination?.total || 0}`)

			return result
		} catch (error) {
			console.error('❌ Error fetching favorites:', error)
			return {
				success: false,
				message: 'Error fetching favorites',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// GET /favorites/check/:novelUuid - Check if novel is favorited by user
	check: async (request: FastifyRequest) => {
		try {
			const params = request.params as any
			const novelUuid = String(params?.novelUuid)

			// Validate JWT token and get userUuid securely
			const userUuid = validateTokenAndGetUserUuid(request)
			if (!userUuid) {
				return { success: false, message: 'Authentication required - invalid or missing token', isBookmarked: false }
			}

			console.log('🔍 Check favorite request:', { userUuid, novelUuid })

			if (!novelUuid) {
				return { success: false, message: 'Invalid novel UUID', isBookmarked: false }
			}

			const result = await FavoriteService.checkFavoriteByUuid(userUuid, novelUuid)

			console.log(`📋 Check favorite result: ${result.isBookmarked}`)

			return result
		} catch (error) {
			console.error('❌ Error checking favorite:', error)
			return {
				success: false,
				message: 'Error checking favorite status',
				isBookmarked: false,
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// GET /favorites/check-slug/:slug - Check favorite by novel slug
	checkBySlug: async (request: FastifyRequest) => {
		try {
			const params = request.params as any
			const slug = String(params?.slug)

			// Validate JWT token and get userUuid securely
			const userUuid = validateTokenAndGetUserUuid(request)
			if (!userUuid) {
				return { success: false, message: 'Authentication required - invalid or missing token', isBookmarked: false }
			}

			console.log('🔍 Check favorite by slug request:', { userUuid, slug })

			if (!slug) {
				return { success: false, message: 'Invalid novel slug', isBookmarked: false }
			}

			const result = await FavoriteService.checkFavoriteBySlug(userUuid, slug)

			console.log(`📋 Check favorite by slug result: ${result.isBookmarked}`)

			return result
		} catch (error) {
			console.error('❌ Error checking favorite by slug:', error)
			return {
				success: false,
				message: 'Error checking favorite status',
				isBookmarked: false,
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// GET /favorites/count - Get user's favorites count
	count: async (request: FastifyRequest) => {
		try {
			// Validate JWT token and get userUuid securely
			const userUuid = validateTokenAndGetUserUuid(request)
			if (!userUuid) {
				return { success: false, message: 'Authentication required - invalid or missing token' }
			}

			console.log('📊 Get favorites count request:', { userUuid })

			const result = await FavoriteService.getUserFavoritesCount(userUuid)

			console.log(`📋 Favorites count result: ${result.count}`)

			return result
		} catch (error) {
			console.error('❌ Error getting favorites count:', error)
			return {
				success: false,
				message: 'Error getting favorites count',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// DELETE /favorites/clear - Clear all user favorites
	clear: async (request: FastifyRequest) => {
		try {
			// Validate JWT token and get userUuid securely
			const userUuid = validateTokenAndGetUserUuid(request)
			if (!userUuid) {
				return { success: false, message: 'Authentication required - invalid or missing token' }
			}

			console.log('🧹 Clear favorites request:', { userUuid })

			const result = await FavoriteService.clearUserFavorites(userUuid)

			console.log(`📋 Clear favorites result: ${result.success}`)

			return result
		} catch (error) {
			console.error('❌ Error clearing favorites:', error)
			return {
				success: false,
				message: 'Error clearing favorites',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	},

	// GET /favorites/novel/:novelUuid - Get novel's favorites count by UUID (public endpoint)
	novelCount: async (request: FastifyRequest) => {
		try {
			const params = request.params as any
			const novelUuid = String(params?.novelUuid)

			console.log('📊 Get novel favorites count request:', { novelUuid })

			if (!novelUuid) {
				return { success: false, message: 'Invalid novel UUID' }
			}

			const result = await FavoriteService.getNovelFavoritesCountByUuid(novelUuid)

			console.log(`📋 Novel favorites count result: ${result.count}`)

			return result
		} catch (error) {
			console.error('❌ Error getting novel favorites count:', error)
			return {
				success: false,
				message: 'Error getting novel favorites count',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	}
};
