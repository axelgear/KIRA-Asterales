import { Schema, model } from 'mongoose'

const RbacRoleSchema = new Schema({
	roleUuid: { type: String, required: true, unique: true },
	roleName: { type: String, required: true, unique: true },
	roleType: { type: String },
	roleColor: { type: String },
	roleDescription: { type: String },
	apiPathPermissions: { type: [String], required: true },
	creatorUuid: { type: String, required: true },
	lastEditorUuid: { type: String, required: true },
	createDateTime: { type: Number, required: true },
	editDateTime: { type: Number, required: true }
}, { collection: 'rbac-role', versionKey: false })

export const RbacRoleModelV2 = model('RbacRoleV2', RbacRoleSchema) 