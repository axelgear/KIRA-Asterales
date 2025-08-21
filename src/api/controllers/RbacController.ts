import type { FastifyReply, FastifyRequest } from 'fastify'
import { RbacApiPathModel } from '../../infrastructure/models/RbacApiPath.js'
import { RbacRoleModelV2 } from '../../infrastructure/models/RbacRole.js'
import { RbacUserBindingModel } from '../../infrastructure/models/RbacUserBinding.js'
import { v4 as uuidv4 } from 'uuid'

async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const uidRaw = (request.cookies as any)?.uid as string | undefined
  const uid = uidRaw ? Number(uidRaw) : undefined
  if (!uid) {
    reply.code(403).send({ success: false, error: 'Forbidden' })
    return false
  }
  const binding = await RbacUserBindingModel.findOne({ userId: uid }).lean()
  const roles: string[] = binding?.roles || []
  const isAdmin = roles.includes('root') || roles.includes('administrator')
  if (!isAdmin) {
    reply.code(403).send({ success: false, error: 'Forbidden' })
    return false
  }
  return true
}

export const RbacController = {
  // RBAC Api Paths
  createRbacApiPath: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireAdmin(request, reply))) return
    const body = (request.body as any) || {}
    const now = Date.now()
    const doc = await RbacApiPathModel.create({
      apiPathUuid: uuidv4(),
      apiPath: body.apiPath || '',
      apiPathType: body.apiPathType,
      apiPathColor: body.apiPathColor,
      apiPathDescription: body.apiPathDescription,
      creatorUuid: (request.cookies as any)?.uuid || 'system',
      lastEditorUuid: (request.cookies as any)?.uuid || 'system',
      createDateTime: now,
      editDateTime: now
    })
    return reply.send({ success: true, result: { ...doc.toObject(), isAssignedOnce: false } })
  },
  deleteRbacApiPath: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireAdmin(request, reply))) return
    const body = (request.body as any) || {}
    const res = await RbacApiPathModel.deleteOne({ apiPath: body.apiPath || '' })
    return reply.send({ success: true, isAssigned: false })
  },
  getRbacApiPath: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireAdmin(request, reply))) return
    const q = request.query as any
    const page = Number(q.page) || 1
    const pageSize = Number(q.pageSize) || 20
    const filter: any = {}
    if (q.apiPath) filter.apiPath = q.apiPath
    if (q.apiPathType) filter.apiPathType = q.apiPathType
    if (q.apiPathColor) filter.apiPathColor = q.apiPathColor
    if (q.apiPathDescription) filter.apiPathDescription = q.apiPathDescription
    const [list, count] = await Promise.all([
      RbacApiPathModel.find(filter).skip((page-1)*pageSize).limit(pageSize).lean(),
      RbacApiPathModel.countDocuments(filter)
    ])
    const result = list.map(d => ({ ...d, isAssignedOnce: false }))
    return reply.send({ success: true, result, count })
  },

  // RBAC Roles
  createRbacRole: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireAdmin(request, reply))) return
    const body = (request.body as any) || {}
    const now = Date.now()
    const role = await RbacRoleModelV2.create({
      roleUuid: uuidv4(),
      roleName: body.roleName || '',
      roleType: body.roleType,
      roleColor: body.roleColor,
      roleDescription: body.roleDescription,
      apiPathPermissions: [],
      creatorUuid: (request.cookies as any)?.uuid || 'system',
      lastEditorUuid: (request.cookies as any)?.uuid || 'system',
      createDateTime: now,
      editDateTime: now
    })
    return reply.send({ success: true, result: role })
  },
  deleteRbacRole: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireAdmin(request, reply))) return
    const body = (request.body as any) || {}
    await RbacRoleModelV2.deleteOne({ roleName: body.roleName || '' })
    return reply.send({ success: true })
  },
  getRbacRole: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireAdmin(request, reply))) return
    const q = request.query as any
    const page = Number(q.page) || 1
    const pageSize = Number(q.pageSize) || 20
    const filter: any = {}
    if (q.roleName) filter.roleName = q.roleName
    if (q.roleType) filter.roleType = q.roleType
    if (q.roleColor) filter.roleColor = q.roleColor
    if (q.roleDescription) filter.roleDescription = q.roleDescription
    const [list, count] = await Promise.all([
      RbacRoleModelV2.find(filter).skip((page-1)*pageSize).limit(pageSize).lean(),
      RbacRoleModelV2.countDocuments(filter)
    ])
    return reply.send({ success: true, result: list.map(r => ({ ...r, apiPathList: [] })), count })
  },
  updateApiPathPermissionsForRole: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireAdmin(request, reply))) return
    const body = (request.body as any) || {}
    const now = Date.now()
    await RbacRoleModelV2.updateOne({ roleName: body.roleName || '' }, { $set: { apiPathPermissions: body.apiPathPermissions || [], editDateTime: now } })
    const role = await RbacRoleModelV2.findOne({ roleName: body.roleName || '' }).lean()
    return reply.send({ success: true, result: role })
  },

  // Admin user role ops
  adminUpdateUserRole: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireAdmin(request, reply))) return
    const body = (request.body as any) || {}
    const uid = typeof body.uid === 'number' ? body.uid : undefined
    const uuid = typeof body.uuid === 'string' ? body.uuid : undefined
    const query: any = uid ? { userId: uid } : uuid ? { uuid } : null
    if (!query) return reply.code(400).send({ success: false, message: 'uid or uuid required' })
    await RbacUserBindingModel.updateOne(query, { $set: { roles: body.newRoles || [] } }, { upsert: true })
    return reply.send({ success: true })
  },
  adminGetUserRolesByUid: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireAdmin(request, reply))) return
    const q = request.query as any
    const uid = Number(q.uid)
    
    // Get user binding and user details
    const [binding, user] = await Promise.all([
      RbacUserBindingModel.findOne({ userId: uid }).lean(),
      (await import('../../infrastructure/models/User.js')).UserModel.findOne({ userId: uid }).lean()
    ])
    
    if (!binding) {
      return reply.send({ 
        success: true, 
        result: { 
          uid, 
          uuid: '', 
          username: '', 
          userNickname: '', 
          avatar: '', 
          roles: [] 
        } 
      })
    }
    
    return reply.send({ 
      success: true, 
      result: { 
        uid, 
        uuid: binding.uuid, 
        username: user?.username || '', 
        userNickname: user?.nickname || '', 
        avatar: (user as any)?.avatar || '', 
        roles: (binding.roles || []).map(r => ({ roleName: r })) 
      } 
    })
  }
} 