import type { FastifyRequest } from 'fastify'
import { CommentService } from '../../services/CommentService.js'
import { validateTokenAndGetUserUuid } from '../../common/jwtAuth.js'
import { UserModel } from '../../infrastructure/models/User.js'

function parsePagination(query: any) {
	const result: {
		page?: number
		pageSize?: number
		sort?: 'newest' | 'oldest' | 'top'
	} = {}

	if (query?.page != null) {
		const parsed = Number(query.page)
		if (!Number.isNaN(parsed)) result.page = parsed
	}

	if (query?.pageSize != null) {
		const parsed = Number(query.pageSize)
		if (!Number.isNaN(parsed)) result.pageSize = parsed
	}

	if (typeof query?.sort === 'string') {
		const value = query.sort.toLowerCase()
		if (value === 'newest' || value === 'oldest' || value === 'top') {
			result.sort = value
		}
	}

	return result
}

async function resolveUserId(userUuid: string | null | undefined) {
	if (!userUuid) return undefined
	const user = await UserModel.findOne({ uuid: userUuid }).select('userId').lean()
	return user?.userId
}

export const CommentController = {
	// Novel comment endpoints
	listNovelComments: async (request: FastifyRequest) => {
		const { novelUuid } = request.params as { novelUuid?: string }
		const query = request.query as any
		const currentUserUuid = validateTokenAndGetUserUuid(request) || undefined

		if (!novelUuid) {
			return { success: false, message: 'novelUuid required' }
		}

		const listParams: Parameters<typeof CommentService.listComments>[0] = {
			entityType: 'novel',
			entityUuid: String(novelUuid),
			includeDeleted: false,
		}

		const pagination = parsePagination(query)
		if (pagination.page != null) listParams.page = pagination.page
		if (pagination.pageSize != null) listParams.pageSize = pagination.pageSize
		if (pagination.sort) listParams.sort = pagination.sort
		if (currentUserUuid) listParams.currentUserUuid = currentUserUuid

		const result = await CommentService.listComments(listParams)

		return result
	},

	createNovelComment: async (request: FastifyRequest) => {
		const { novelUuid } = request.params as { novelUuid?: string }
		const body = request.body as any
		const userUuid = validateTokenAndGetUserUuid(request)

		if (!novelUuid) {
			return { success: false, message: 'novelUuid required' }
		}

		if (!userUuid) {
			return { success: false, message: 'Authentication required' }
		}

		const userId = await resolveUserId(userUuid)

		const createParams: Parameters<typeof CommentService.createComment>[0] = {
			entityType: 'novel',
			entityUuid: String(novelUuid),
			userUuid,
			content: String(body?.content ?? ''),
		}

		if (userId !== undefined) createParams.userId = userId
		if (body?.parentCommentId != null) {
			const parsed = Number(body.parentCommentId)
			if (!Number.isNaN(parsed)) createParams.parentCommentId = parsed
		}

		const result = await CommentService.createComment(createParams)

		return result
	},

	deleteNovelComment: async (request: FastifyRequest) => {
		const { novelUuid, commentId } = request.params as { novelUuid?: string; commentId?: string }
		const userUuid = validateTokenAndGetUserUuid(request)

		if (!novelUuid || !commentId) {
			return { success: false, message: 'novelUuid and commentId required' }
		}

		const numericCommentId = Number(commentId)
		if (Number.isNaN(numericCommentId)) {
			return { success: false, message: 'Invalid commentId' }
		}

		if (!userUuid) {
			return { success: false, message: 'Authentication required' }
		}

		const result = await CommentService.deleteComment({
			entityType: 'novel',
			entityUuid: String(novelUuid),
			commentId: numericCommentId,
			requestingUserUuid: userUuid,
		})

		return result
	},

	voteNovelComment: async (request: FastifyRequest) => {
		const { novelUuid, commentId } = request.params as { novelUuid?: string; commentId?: string }
		const body = request.body as any
		const userUuid = validateTokenAndGetUserUuid(request)

		if (!novelUuid || !commentId) {
			return { success: false, message: 'novelUuid and commentId required' }
		}

		const numericCommentId = Number(commentId)
		if (Number.isNaN(numericCommentId)) {
			return { success: false, message: 'Invalid commentId' }
		}

		if (!userUuid) {
			return { success: false, message: 'Authentication required' }
		}

		const action = mapVoteAction(body?.action)
		if (!action) {
			return { success: false, message: 'Invalid vote action' }
		}

		const result = await CommentService.voteComment({
			entityType: 'novel',
			entityUuid: String(novelUuid),
			commentId: numericCommentId,
			userUuid,
			action,
		})

		return result
	},

	// Reading list comment endpoints
	listReadingListComments: async (request: FastifyRequest) => {
		const { listUuid } = request.params as { listUuid?: string }
		const query = request.query as any
		const currentUserUuid = validateTokenAndGetUserUuid(request) || undefined

		if (!listUuid) {
			return { success: false, message: 'listUuid required' }
		}

		const listParams: Parameters<typeof CommentService.listComments>[0] = {
			entityType: 'readingList',
			entityUuid: String(listUuid),
			includeDeleted: false,
		}

		const pagination = parsePagination(query)
		if (pagination.page != null) listParams.page = pagination.page
		if (pagination.pageSize != null) listParams.pageSize = pagination.pageSize
		if (pagination.sort) listParams.sort = pagination.sort
		if (currentUserUuid) listParams.currentUserUuid = currentUserUuid

		const result = await CommentService.listComments(listParams)

		return result
	},

	createReadingListComment: async (request: FastifyRequest) => {
		const { listUuid } = request.params as { listUuid?: string }
		const body = request.body as any
		const userUuid = validateTokenAndGetUserUuid(request)

		if (!listUuid) {
			return { success: false, message: 'listUuid required' }
		}

		if (!userUuid) {
			return { success: false, message: 'Authentication required' }
		}

		const userId = await resolveUserId(userUuid)

		const createParams: Parameters<typeof CommentService.createComment>[0] = {
			entityType: 'readingList',
			entityUuid: String(listUuid),
			userUuid,
			content: String(body?.content ?? ''),
		}

		if (userId !== undefined) createParams.userId = userId
		if (body?.parentCommentId != null) {
			const parsed = Number(body.parentCommentId)
			if (!Number.isNaN(parsed)) createParams.parentCommentId = parsed
		}

		const result = await CommentService.createComment(createParams)

		return result
	},

	deleteReadingListComment: async (request: FastifyRequest) => {
		const { listUuid, commentId } = request.params as { listUuid?: string; commentId?: string }
		const userUuid = validateTokenAndGetUserUuid(request)

		if (!listUuid || !commentId) {
			return { success: false, message: 'listUuid and commentId required' }
		}

		const numericCommentId = Number(commentId)
		if (Number.isNaN(numericCommentId)) {
			return { success: false, message: 'Invalid commentId' }
		}

		if (!userUuid) {
			return { success: false, message: 'Authentication required' }
		}

		const result = await CommentService.deleteComment({
			entityType: 'readingList',
			entityUuid: String(listUuid),
			commentId: numericCommentId,
			requestingUserUuid: userUuid,
		})

		return result
	},

	voteReadingListComment: async (request: FastifyRequest) => {
		const { listUuid, commentId } = request.params as { listUuid?: string; commentId?: string }
		const body = request.body as any
		const userUuid = validateTokenAndGetUserUuid(request)

		if (!listUuid || !commentId) {
			return { success: false, message: 'listUuid and commentId required' }
		}

		const numericCommentId = Number(commentId)
		if (Number.isNaN(numericCommentId)) {
			return { success: false, message: 'Invalid commentId' }
		}

		if (!userUuid) {
			return { success: false, message: 'Authentication required' }
		}

		const action = mapVoteAction(body?.action)
		if (!action) {
			return { success: false, message: 'Invalid vote action' }
		}

		const result = await CommentService.voteComment({
			entityType: 'readingList',
			entityUuid: String(listUuid),
			commentId: numericCommentId,
			userUuid,
			action,
		})

		return result
	},
}

type VoteAction = 'upvote' | 'downvote' | 'removeUpvote' | 'removeDownvote'

function mapVoteAction(input: unknown): VoteAction | null {
	const raw = typeof input === 'string' ? input.trim().toLowerCase() : ''
	switch (raw) {
		case 'upvote':
			return 'upvote'
		case 'downvote':
			return 'downvote'
		case 'removeupvote':
			return 'removeUpvote'
		case 'removedownvote':
			return 'removeDownvote'
		default:
			return null
	}
}

