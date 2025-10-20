import type { FastifyInstance } from 'fastify'
import { ReadingListController } from '../controllers/ReadingListController.js'
import { ReadingListVotingController } from '../controllers/ReadingListVotingController.js'
import { createRbacGuard } from '../../plugins/rbac.js'

export default async function readingListRoutes(fastify: FastifyInstance) {
	fastify.post('/reading-list/create', { preHandler: [createRbacGuard('both')] }, ReadingListController.createList)
	fastify.patch('/reading-list/update', { preHandler: [createRbacGuard('both')] }, ReadingListController.updateList)
	fastify.delete('/reading-list/delete', { preHandler: [createRbacGuard('both')] }, ReadingListController.deleteList)
	fastify.get('/reading-list/my', { preHandler: [createRbacGuard('both')] }, ReadingListController.myLists)
	fastify.get('/reading-list/public', ReadingListController.publicLists)
	fastify.post('/reading-list/item/add', { preHandler: [createRbacGuard('both')] }, ReadingListController.addItem)
	fastify.post('/reading-list/item/remove', { preHandler: [createRbacGuard('both')] }, ReadingListController.removeItem)
	fastify.get('/reading-list/items', ReadingListController.listItems)

	// Voting routes
	fastify.post('/reading-list/vote/upvote', { preHandler: [createRbacGuard('both')] }, ReadingListVotingController.upvote)
	fastify.post('/reading-list/vote/downvote', { preHandler: [createRbacGuard('both')] }, ReadingListVotingController.downvote)
	fastify.post('/reading-list/vote/upvote/remove', { preHandler: [createRbacGuard('both')] }, ReadingListVotingController.removeUpvote)
	fastify.post('/reading-list/vote/downvote/remove', { preHandler: [createRbacGuard('both')] }, ReadingListVotingController.removeDownvote)
} 