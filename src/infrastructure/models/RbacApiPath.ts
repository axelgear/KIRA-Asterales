import { Schema, model } from 'mongoose'

const RbacApiPathSchema = new Schema({
	apiPathUuid: { type: String, required: true, unique: true },
	apiPath: { type: String, required: true, unique: true },
	apiPathType: { type: String },
	apiPathColor: { type: String },
	apiPathDescription: { type: String },
	creatorUuid: { type: String, required: true },
	lastEditorUuid: { type: String, required: true },
	createDateTime: { type: Number, required: true },
	editDateTime: { type: Number, required: true }
}, { collection: 'rbac-api-list', versionKey: false })

export const RbacApiPathModel = model('RbacApiPath', RbacApiPathSchema) 