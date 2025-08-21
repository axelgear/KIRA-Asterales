import { Schema, model, type InferSchemaType } from 'mongoose'

const UserSchema = new Schema({
	userId: { type: Number, index: true, unique: true, required: true },
	uuid: { type: String, index: true, unique: true, required: true },
	username: { type: String, index: true, unique: true, required: true },
	email: { type: String, index: true, unique: true, required: true },
	password: { type: String, required: true },
	nickname: { type: String },
	avatar: { type: String },
	bio: { type: String },
	isEmailVerified: { type: Boolean, default: false },
	isPhoneVerified: { type: Boolean, default: false },
	is2FAEnabled: { type: Boolean, default: false },
	isBlocked: { type: Boolean, default: false },
	isHidden: { type: Boolean, default: false },
	roles: { type: [String], default: ['user'] },
	permissions: { type: [String], default: [] },
	lastLoginAt: { type: Date },
	lastActiveAt: { type: Date },

	// security & verification
	emailVerifyToken: { type: String, index: true },
	emailVerifyTokenExpiresAt: { type: Date },
	passwordResetToken: { type: String, index: true },
	passwordResetTokenExpiresAt: { type: Date },
	// TOTP
	totpSecret: { type: String },

	// moderation
	blockReason: { type: String }
}, { timestamps: true })

UserSchema.index({ email: 1, username: 1 })
UserSchema.index({ roles: 1 })
UserSchema.index({ createdAt: -1 })
UserSchema.index({ isBlocked: 1 })

export type UserDocument = InferSchemaType<typeof UserSchema>
export const UserModel = model('user', UserSchema) 