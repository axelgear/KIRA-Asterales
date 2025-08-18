import type { FastifyInstance } from 'fastify'
import { ReadingListController } from '../controllers/ReadingListController.js'
import { createRbacGuard } from '../../plugins/rbac.js'

export default async function readingListRoutes(fastify: FastifyInstance) {
	fastify.post('/reading-list/create', { preHandler: [createRbacGuard('both')] }, ReadingListController.createList)
	fastify.patch('/reading-list/update', { preHandler: [createRbacGuard('both')] }, ReadingListController.updateList)
	fastify.delete('/reading-list/delete', { preHandler: [createRbacGuard('both')] }, ReadingListController.deleteList)
	fastify.get('/reading-list/my', { preHandler: [createRbacGuard('both')] }, ReadingListController.myLists)
	fastify.get('/reading-list/public', ReadingListController.publicLists)
	fastify.post('/reading-list/item/add', { preHandler: [createRbacGuard('both')] }, ReadingListController.addItem)
	fastify.post('/reading-list/item/remove', { preHandler: [createRbacGuard('both')] }, ReadingListController.removeItem)
	fastify.get('/reading-list/items', { preHandler: [createRbacGuard('both')] }, ReadingListController.listItems)
} 