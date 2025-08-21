import type { FastifyInstance } from 'fastify'
import { UserController } from '../controllers/UserController.js'
import { createRbacGuard, createAdminGuard, createRoleGuard } from '../../plugins/rbac.js'

export default async function userRoutes(fastify: FastifyInstance) {
	// Public routes (no RBAC protection)
	fastify.post('/user/registering', UserController.registering)
	fastify.post('/user/login', UserController.login)
	fastify.get('/user/check', UserController.check)
	fastify.post('/user/requestSendVerificationCode', UserController.requestSendVerificationCode)
	fastify.get('/user/logout', UserController.logout)
	fastify.post('/user/self', UserController.self)
	
	// User routes (RBAC protected with elegant syntax)
	fastify.post('/user/update/info', { preHandler: [createRbacGuard('both')] }, UserController.updateInfo)
	fastify.post('/user/updateOrCreateUserInfo', { preHandler: [createRbacGuard('both')] }, UserController.updateOrCreateUserInfo)
	fastify.get('/user/infoByUid', { preHandler: [createRbacGuard('both')] }, UserController.getUserInfoByUid)
	fastify.get('/user/existsByUID', { preHandler: [createRbacGuard('both')] }, UserController.userExistsCheckByUID)
	fastify.get('/user/emailExists', { preHandler: [createRbacGuard('both')] }, UserController.userEmailExistsCheck)
	fastify.post('/user/createTotpAuthenticator', { preHandler: [createRbacGuard('both')] }, UserController.createTotp)
	fastify.post('/user/confirmUserTotpAuthenticator', { preHandler: [createRbacGuard('both')] }, UserController.confirmTotp)
	fastify.delete('/user/deleteTotpAuthenticatorByTotpVerificationCodeController', { preHandler: [createRbacGuard('both')] }, UserController.deleteTotpByCode)

	// Email 2FA routes (RBAC protected)
	fastify.post('/user/createEmailAuthenticator', { preHandler: [createRbacGuard('both')] }, UserController.createEmailAuthenticator)
	fastify.post('/user/sendUserEmailAuthenticator', { preHandler: [createRbacGuard('both')] }, UserController.sendUserEmailAuthenticator)
	fastify.post('/user/sendDeleteUserEmailAuthenticator', { preHandler: [createRbacGuard('both')] }, UserController.sendDeleteUserEmailAuthenticator)
	fastify.delete('/user/deleteUserEmailAuthenticator', { preHandler: [createRbacGuard('both')] }, UserController.deleteUserEmailAuthenticator)
	fastify.get('/user/checkUserHave2FAByEmail', UserController.checkUserHave2FAByEmail)
	fastify.get('/user/checkUserHave2FAByUUID', { preHandler: [createRbacGuard('both')] }, UserController.checkUserHave2FAByUUID)

	// Settings routes (simple authentication - no RBAC)
	fastify.post('/user/settings', UserController.getUserSettings)
	fastify.post('/user/settings/update', UserController.updateUserSettings)

	// Invitation code routes (RBAC protected)
	fastify.post('/user/createInvitationCode', { preHandler: [createRbacGuard('both')] }, UserController.createInvitationCode)
	fastify.get('/user/myInvitationCode', { preHandler: [createRbacGuard('both')] }, UserController.getMyInvitationCode)
	fastify.post('/user/checkInvitationCode', { preHandler: [createRbacGuard('both')] }, UserController.checkInvitationCode)

	// Password/Email change routes (RBAC protected)
	fastify.post('/user/requestSendChangeEmailVerificationCode', { preHandler: [createRbacGuard('both')] }, UserController.requestSendChangeEmailVerificationCode)
	fastify.post('/user/requestSendChangePasswordVerificationCode', { preHandler: [createRbacGuard('both')] }, UserController.requestSendChangePasswordVerificationCode)
	fastify.post('/user/update/email', { preHandler: [createRbacGuard('both')] }, UserController.updateUserEmail)
	fastify.post('/user/update/password', { preHandler: [createRbacGuard('both')] }, UserController.updateUserPassword)
	fastify.get('/user/checkUsername', { preHandler: [createRbacGuard('both')] }, UserController.checkUsername)
	fastify.get('/user/avatar/preUpload', { preHandler: [createRbacGuard('both')] }, UserController.getUserAvatarUploadSignedUrl)

	// Admin routes (Admin RBAC protected)
	fastify.get('/user/info', { preHandler: [createRbacGuard('both')] }, UserController.info)
	fastify.get('/user/exists', { preHandler: [createRbacGuard('both')] }, UserController.exists)
	fastify.get('/user/blocked/info', { preHandler: [createRbacGuard('both')] }, UserController.getBlockedUser)
	fastify.get('/user/adminGetUserInfo', { preHandler: [createRbacGuard('both')] }, UserController.adminGetUserInfo)
	fastify.post('/user/adminEditUserInfo', { preHandler: [createRbacGuard('both')] }, UserController.adminEditUserInfo)
	fastify.post('/user/approveUserInfo', { preHandler: [createRbacGuard('both')] }, UserController.approveUserInfo)
	fastify.post('/user/adminClearUserInfo', { preHandler: [createRbacGuard('both')] }, UserController.adminClearUserInfo)
	fastify.get('/user/getUserByInvitationCode', { preHandler: [createRbacGuard('both')] }, UserController.adminGetUserByInvitationCode)
	
	// Additional admin user management routes
	fastify.post('/user/adminBlockUser', { preHandler: [createRbacGuard('both')] }, UserController.adminBlockUser)
	fastify.post('/user/adminUnblockUser', { preHandler: [createRbacGuard('both')] }, UserController.adminUnblockUser)
	fastify.post('/user/adminUpdateUserRoles', { preHandler: [createRbacGuard('both')] }, UserController.adminUpdateUserRoles)
} 