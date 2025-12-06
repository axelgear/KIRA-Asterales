import type { FastifyInstance } from 'fastify'
import { UpdateRequestController } from '../controllers/UpdateRequestController.js'
import { createRbacGuard } from '../../plugins/rbac.js'

export default async function updateRequestRoutes(fastify: FastifyInstance) {
	// Public routes
	fastify.get('/update-requests/list', UpdateRequestController.list)
	fastify.get('/update-requests/top', UpdateRequestController.top)
	fastify.get('/update-requests/check', UpdateRequestController.check)
	fastify.get('/update-requests/weekly-info', UpdateRequestController.weeklyInfo)
	fastify.get('/update-requests/past-winners', UpdateRequestController.pastWinners)
	fastify.get('/update-requests/weeks', UpdateRequestController.availableWeeks)

	// Authenticated routes
	fastify.post('/update-requests/create', { preHandler: [createRbacGuard('both')] }, UpdateRequestController.create)
	fastify.get('/update-requests/my', { preHandler: [createRbacGuard('both')] }, UpdateRequestController.myRequests)
	fastify.post('/update-requests/vote', { preHandler: [createRbacGuard('both')] }, UpdateRequestController.vote)
	fastify.delete('/update-requests/delete', { preHandler: [createRbacGuard('both')] }, UpdateRequestController.delete)

	// Admin routes (TODO: add admin guard)
	fastify.patch('/update-requests/status', { preHandler: [createRbacGuard('both')] }, UpdateRequestController.updateStatus)
}

