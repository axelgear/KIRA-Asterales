import type { FastifyInstance } from 'fastify'
import { RbacController } from '../controllers/RbacController.js'

export default async function rosalesRbacRoutes(fastify: FastifyInstance) {
	fastify.post('/rbac/createRbacApiPath', RbacController.createRbacApiPath)
	fastify.delete('/rbac/deleteRbacApiPath', RbacController.deleteRbacApiPath)
	fastify.get('/rbac/getRbacApiPath', RbacController.getRbacApiPath)

	fastify.post('/rbac/createRbacRole', RbacController.createRbacRole)
	fastify.delete('/rbac/deleteRbacRole', RbacController.deleteRbacRole)
	fastify.get('/rbac/getRbacRole', RbacController.getRbacRole)
	fastify.post('/rbac/updateApiPathPermissionsForRole', RbacController.updateApiPathPermissionsForRole)

	fastify.post('/rbac/adminUpdateUserRole', RbacController.adminUpdateUserRole)
	fastify.get('/rbac/adminGetUserRolesByUid', RbacController.adminGetUserRolesByUid)
} 