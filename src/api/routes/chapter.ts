import type { FastifyInstance } from 'fastify'
import { ChapterController } from '../controllers/ChapterController.js'
import { createRbacGuard } from '../../plugins/rbac.js'

export default async function chapterRoutes(fastify: FastifyInstance) {
	// List chapters (public)
	fastify.get('/chapter/list', ChapterController.list)
	
	// Get chapter by UUID (public) - with Redis caching
	fastify.get('/chapter/:uuid', ChapterController.get)
	
	// Rebuild Elasticsearch chapter lists (admin only)
	fastify.post('/chapter/rebuild', { preHandler: [createRbacGuard('both')] }, ChapterController.rebuild)
	
	// Create chapter (requires RBAC)
	fastify.post('/chapter/create', { preHandler: [createRbacGuard('both')] }, ChapterController.create)
	
	// Update chapter (requires RBAC)
	fastify.patch('/chapter/update', { preHandler: [createRbacGuard('both')] }, ChapterController.update)
	
	// Delete chapter (requires RBAC)
	fastify.delete('/chapter/delete', { preHandler: [createRbacGuard('both')] }, ChapterController.remove)
	
	// Reorder chapter (requires RBAC)
	fastify.post('/chapter/reorder', { preHandler: [createRbacGuard('both')] }, ChapterController.reorder)
} 