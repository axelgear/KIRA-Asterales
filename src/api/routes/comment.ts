import type { FastifyInstance } from 'fastify'
import { CommentController } from '../controllers/CommentController.js'
import { createRbacGuard } from '../../plugins/rbac.js'

export default async function commentRoutes(fastify: FastifyInstance) {
	// Novel comments
	fastify.get('/novel/:novelUuid/comments', CommentController.listNovelComments)
	fastify.post('/novel/:novelUuid/comments', { preHandler: [createRbacGuard('both')] }, CommentController.createNovelComment)
	fastify.delete('/novel/:novelUuid/comments/:commentId', { preHandler: [createRbacGuard('both')] }, CommentController.deleteNovelComment)
	fastify.post('/novel/:novelUuid/comments/:commentId/vote', { preHandler: [createRbacGuard('both')] }, CommentController.voteNovelComment)

	// Reading list comments
	fastify.get('/reading-list/:listUuid/comments', CommentController.listReadingListComments)
	fastify.post('/reading-list/:listUuid/comments', { preHandler: [createRbacGuard('both')] }, CommentController.createReadingListComment)
	fastify.delete('/reading-list/:listUuid/comments/:commentId', { preHandler: [createRbacGuard('both')] }, CommentController.deleteReadingListComment)
	fastify.post('/reading-list/:listUuid/comments/:commentId/vote', { preHandler: [createRbacGuard('both')] }, CommentController.voteReadingListComment)
}

