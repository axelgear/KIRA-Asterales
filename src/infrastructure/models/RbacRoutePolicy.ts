import { Schema, model, type InferSchemaType } from 'mongoose'

const RbacRoutePolicySchema = new Schema({
  routePattern: { type: String, required: true, index: true }, // e.g., '/admin/*', '/novels/*'
  methods: { type: [String], default: ['GET','POST','PUT','PATCH','DELETE'] },
  requiredPermissions: { type: [String], default: [] },
  rolesAllowed: { type: [String], default: [] },
  enabled: { type: Boolean, default: true },
  description: { type: String }
}, { timestamps: true })

RbacRoutePolicySchema.index({ routePattern: 1, enabled: 1 })

export type RbacRoutePolicyDocument = InferSchemaType<typeof RbacRoutePolicySchema>
export const RbacRoutePolicyModel = model('rbac_route_policy', RbacRoutePolicySchema) 