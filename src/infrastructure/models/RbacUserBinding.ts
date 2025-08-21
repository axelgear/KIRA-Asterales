import { Schema, model, type InferSchemaType } from 'mongoose'

const RbacUserBindingSchema = new Schema({
  userId: { type: Number, index: true, required: true, unique: true },
  uuid: { type: String, index: true, required: true, unique: true },
  roles: { type: [String], default: [] }, // role keys
  permissions: { type: [String], default: [] } // extra permission keys (overrides)
}, { 
  timestamps: true,
  collection: 'rbac-user-bindings' // Match the actual collection name in MongoDB
})

export type RbacUserBindingDocument = InferSchemaType<typeof RbacUserBindingSchema>
export const RbacUserBindingModel = model('RbacUserBinding', RbacUserBindingSchema) 