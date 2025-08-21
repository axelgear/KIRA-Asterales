import type { FastifyInstance } from 'fastify'
import { ReportController } from '../controllers/ReportController.js'
import { createRbacGuard } from '../../plugins/rbac.js'

export default async function reportRoutes(fastify: FastifyInstance) {
	fastify.post('/report/create', { preHandler: [createRbacGuard('both')] }, ReportController.create)
	fastify.get('/report/list', { preHandler: [createRbacGuard('both')] }, ReportController.list)
	fastify.patch('/report/status', { preHandler: [createRbacGuard('both')] }, ReportController.updateStatus)
	fastify.get('/report/:reportId', { preHandler: [createRbacGuard('both')] }, ReportController.get)
} 