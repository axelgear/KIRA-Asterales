import { startSession, type Model, type ClientSession } from 'mongoose'
import { getNextSequence } from '../infrastructure/models/Sequence.js'
import { NovelModel } from '../infrastructure/models/Novel.js'
import { ReadingListModel } from '../infrastructure/models/ReadingList.js'
import { NovelCommentModel } from '../infrastructure/models/NovelComment.js'
import { ReadingListCommentModel } from '../infrastructure/models/ReadingListComment.js'
import { CommentVoteModel } from '../infrastructure/models/CommentVote.js'

type CommentEntityType = 'novel' | 'readingList'

type EntityConfig = {
	model: Model<any>
	queryKey: 'novelUuid' | 'listUuid'
	sequence: string
}

const ENTITY_CONFIG: Record<CommentEntityType, EntityConfig> = {
	novel: {
		model: NovelCommentModel as unknown as Model<any>,
		queryKey: 'novelUuid',
		sequence: 'commentId',
	},
	readingList: {
		model: ReadingListCommentModel as unknown as Model<any>,
		queryKey: 'listUuid',
		sequence: 'readingListCommentId',
	},
}

interface CreateCommentParams {
	entityType: CommentEntityType
	entityUuid: string
	userUuid: string
	userId?: number // optional legacy support
	content: string
	parentCommentId?: number | null
}

interface ListCommentsParams {
	entityType: CommentEntityType
	entityUuid: string
	page?: number
	pageSize?: number
	includeDeleted?: boolean
	currentUserUuid?: string
	sort?: 'newest' | 'oldest' | 'top'
}

interface DeleteCommentParams {
	entityType: CommentEntityType
	commentId: number
	entityUuid: string
	requestingUserUuid?: string
}

interface VoteCommentParams {
	entityType: CommentEntityType
	entityUuid: string
	commentId: number
	userUuid: string
	action: 'upvote' | 'downvote' | 'removeUpvote' | 'removeDownvote'
}

function sanitizeContent(content: string): string {
	return content?.toString().trim() ?? ''
}

async function ensureEntityExists(entityType: CommentEntityType, entityUuid: string) {
	if (entityType === 'novel') {
		const novel = await NovelModel.findOne({ uuid: entityUuid })
			.select('uuid novelId ownerUserId slug')
			.lean()
		return novel
	}

	const list = await ReadingListModel.findOne({ uuid: entityUuid })
		.select('uuid ownerUserUuid name')
		.lean()
	return list
}

async function createCommentInternal(params: CreateCommentParams, useTransaction: boolean) {
	const { entityType, entityUuid } = params
	const content = sanitizeContent(params.content)

	if (!entityUuid || !content) {
		return { success: false, message: 'Invalid comment payload' }
	}

	const entity = await ensureEntityExists(entityType, entityUuid)
	if (!entity) {
		return { success: false, message: `${entityType === 'novel' ? 'Novel' : 'Reading list'} not found` }
	}

	const config = ENTITY_CONFIG[entityType]
	const commentId = await getNextSequence(config.sequence)

	let session: ClientSession | null = null
	if (useTransaction) {
		session = await startSession()
	}

	try {
		if (session) session.startTransaction()

		let parentCommentId: number | null = null
		let rootCommentId: number | null = null
		let path = ''
		let depth = 0

		if (params.parentCommentId != null) {
			const parentQuery = buildEntityQuery(entityType, entityUuid, params.parentCommentId)
			let parentQueryBuilder = config.model.findOne(parentQuery)
			if (session) parentQueryBuilder = parentQueryBuilder.session(session)
			const parent = await parentQueryBuilder.lean() as any
			if (parent) {
				parentCommentId = parent.commentId
				rootCommentId = parent.rootCommentId ?? parent.commentId
				depth = (parent.depth ?? 0) + 1
				const segment = String(commentId).padStart(8, '0')
				path = parent.path ? `${parent.path}/${segment}` : segment
			} else {
				rootCommentId = commentId
				path = String(commentId).padStart(8, '0')
			}
		} else {
			rootCommentId = commentId
			path = String(commentId).padStart(8, '0')
		}

		const createPayload: Record<string, any> = {
			commentId,
			content,
			userUuid: params.userUuid,
			parentCommentId,
			rootCommentId,
			path,
			depth,
		}

		if (entityType === 'novel') {
			createPayload.novelUuid = entityUuid
			const novelEntity = entity as { novelId?: number | null }
			createPayload.novelId = novelEntity?.novelId ?? null
		} else {
			createPayload.listUuid = entityUuid
		}

		if (typeof params.userId === 'number') {
			createPayload.userId = params.userId
		}

		const doc = new config.model(createPayload)
		if (session) {
			await doc.save({ session })
			await session.commitTransaction()
		} else {
			await doc.save()
		}

		return {
			success: true,
			comment: doc.toObject?.() ?? doc,
		}
	} catch (error) {
		if (session) {
			await session.abortTransaction()
		}
		const message = (error as Error)?.message ?? ''
		if (useTransaction && message.includes('Transaction numbers are only allowed on a replica set member or mongos')) {
			console.warn('⚠️ MongoDB transactions unsupported in current deployment, retrying without transaction.')
			return await createCommentInternal(params, false)
		}
		console.error('❌ Failed to create comment:', error)
		return { success: false, message: `Failed to create comment: ${message}` }
	} finally {
		if (session) {
			session.endSession()
		}
	}
}

function buildEntityQuery(entityType: CommentEntityType, entityUuid: string, commentId?: number) {
	const config = ENTITY_CONFIG[entityType]
	const query: Record<string, any> = { [config.queryKey]: entityUuid }
	if (commentId != null) query.commentId = commentId
	return query
}

export const CommentService = {
	async createComment(params: CreateCommentParams) {
		return await createCommentInternal(params, true)
	},

	async listComments(params: ListCommentsParams) {
		const { entityType, entityUuid, includeDeleted = false } = params
		const page = Math.max(1, Number(params.page) || 1)
		const pageSize = Math.min(Math.max(1, Number(params.pageSize) || 20), 100)
		const skip = (page - 1) * pageSize

		const config = ENTITY_CONFIG[entityType]
		const query = buildEntityQuery(entityType, entityUuid)
		if (!includeDeleted) {
			query.isDeleted = false
		}

		const sort: Record<string, 1 | -1> = {}
		switch (params.sort) {
			case 'oldest':
				sort.createdAt = 1
				break
			case 'top':
				sort.upvoteCount = -1
				sort.createdAt = -1
				break
			case 'newest':
			default:
				sort.createdAt = -1
		}

		const commentsPromise = config.model.find(query)
			.sort(sort)
			.skip(skip)
			.limit(pageSize)
			.lean() as Promise<Array<Record<string, any>>>

		const countPromise = config.model.countDocuments(query) as Promise<number>

		const [items, total] = await Promise.all([commentsPromise, countPromise])

		let userVotesMap = new Map<number, number>()
		if (params.currentUserUuid && items.length > 0) {
			const commentIds = items.map(item => item.commentId as number)
			const votes = await CommentVoteModel.find({
				entityType,
				entityUuid,
				userUuid: params.currentUserUuid,
				commentId: { $in: commentIds },
			}).lean()
			userVotesMap = new Map(votes.map(vote => [vote.commentId, vote.vote]))
		}

		const results = items.map(item => ({
			...item,
			userVote: userVotesMap.get(item.commentId) ?? 0,
		}))

		return {
			success: true,
			items: results,
			pagination: {
				page,
				pageSize,
				total,
				totalPages: Math.max(1, Math.ceil(total / pageSize)),
			},
		}
	},

	async deleteComment(params: DeleteCommentParams) {
		const { entityType, entityUuid, commentId } = params
		const config = ENTITY_CONFIG[entityType]
		const query = buildEntityQuery(entityType, entityUuid, commentId)

		const comment = await config.model.findOne(query).lean() as any
		if (!comment) {
			return { success: false, message: 'Comment not found' }
		}

		// If requesting user is provided, ensure ownership
		if (params.requestingUserUuid && comment.userUuid !== params.requestingUserUuid) {
			return { success: false, message: 'Not permitted to delete this comment' }
		}

		await config.model.updateOne(query, { $set: { isDeleted: true } })
		return { success: true }
	},

	async voteComment(params: VoteCommentParams) {
		return await voteCommentInternal(params, true)
	},
}

async function voteCommentInternal(params: VoteCommentParams, useTransaction: boolean) {
	const { entityType, entityUuid, commentId, userUuid, action } = params
	const config = ENTITY_CONFIG[entityType]
	const query = buildEntityQuery(entityType, entityUuid, commentId)

	const comment = await config.model.findOne(query).lean() as any
	if (!comment) {
		return { success: false, message: 'Comment not found' }
	}

	const existingVote = await CommentVoteModel.findOne({ commentId, userUuid }).lean()
	let session: ClientSession | null = null
	if (useTransaction) {
		session = await startSession()
	}

	const withSession = <T>(operation: any) => (session ? operation.session(session) : operation)

	try {
		if (session) session.startTransaction()

		const inc: Record<string, number> = {}

		const applyVote = async (vote: 1 | -1 | null) => {
			if (vote === null) {
				if (existingVote) {
					if (existingVote.vote === 1) inc.upvoteCount = (inc.upvoteCount ?? 0) - 1
					if (existingVote.vote === -1) inc.downvoteCount = (inc.downvoteCount ?? 0) - 1
					if (session) {
						await CommentVoteModel.deleteOne({ commentId, userUuid }).session(session)
					} else {
						await CommentVoteModel.deleteOne({ commentId, userUuid })
					}
				}
				return
			}

			if (existingVote?.vote === vote) {
				return
			}

			if (existingVote) {
				if (existingVote.vote === 1) inc.upvoteCount = (inc.upvoteCount ?? 0) - 1
				if (existingVote.vote === -1) inc.downvoteCount = (inc.downvoteCount ?? 0) - 1
			}

			if (vote === 1) {
				inc.upvoteCount = (inc.upvoteCount ?? 0) + 1
			} else {
				inc.downvoteCount = (inc.downvoteCount ?? 0) + 1
			}

			const updateOptions = session ? { upsert: true, session } : { upsert: true }
			await CommentVoteModel.updateOne(
				{ commentId, userUuid },
				{ $set: { vote, entityType, entityUuid } },
				updateOptions
			)
		}

		switch (action) {
			case 'upvote':
				await applyVote(1)
				break
			case 'downvote':
				await applyVote(-1)
				break
			case 'removeUpvote':
			case 'removeDownvote':
				await applyVote(null)
				break
			default:
				throw new Error(`Unsupported vote action: ${action}`)
		}

		if (Object.keys(inc).length > 0) {
			if (session) {
				await config.model.updateOne(query, { $inc: inc }).session(session)
			} else {
				await config.model.updateOne(query, { $inc: inc })
			}
		}

		let updated = await withSession(config.model.findOne(query)).lean() as any
		if (!updated) {
			throw new Error('Failed to refresh comment after vote')
		}

		const corrections: Record<string, number> = {}
		if ((updated.upvoteCount ?? 0) < 0) corrections.upvoteCount = 0
		if ((updated.downvoteCount ?? 0) < 0) corrections.downvoteCount = 0

		if (Object.keys(corrections).length > 0) {
			if (session) {
				await config.model.updateOne(query, { $set: corrections }).session(session)
				updated = (await config.model.findOne(query).session(session).lean()) ?? updated
			} else {
				await config.model.updateOne(query, { $set: corrections })
				updated = (await config.model.findOne(query).lean()) ?? updated
			}
		}

		if (session) await session.commitTransaction()

		const voteDoc = await CommentVoteModel.findOne({ commentId, userUuid }).lean()
		return {
			success: true,
			upvoteCount: updated.upvoteCount ?? 0,
			downvoteCount: updated.downvoteCount ?? 0,
			userVote: voteDoc?.vote ?? 0,
		}
	} catch (error) {
		if (session) await session.abortTransaction()
		const message = (error as Error)?.message ?? ''
		if (useTransaction && message.includes('Transaction numbers are only allowed')) {
			console.warn('⚠️ MongoDB transactions unsupported for vote, retrying without transaction.')
			return await voteCommentInternal(params, false)
		}
		console.error('❌ Failed to update comment vote:', error)
		return { success: false, message: 'Failed to update vote' }
	} finally {
		if (session) session.endSession()
	}
}

