import { Schema, model, type InferSchemaType } from 'mongoose'

const RbacPermissionSchema = new Schema({
  key: { type: String, required: true, unique: true, index: true }, // e.g., 'novel.read', 'user.manage'
  resource: { type: String, required: true }, // e.g., 'novel', 'user'
  action: { type: String, required: true }, // e.g., 'read', 'write', 'delete'
  description: { type: String },
  isSystem: { type: Boolean, default: false }
}, { timestamps: true })

export type RbacPermissionDocument = InferSchemaType<typeof RbacPermissionSchema>
export const RbacPermissionModel = model('rbac_permission', RbacPermissionSchema) 