import { Schema, model, type InferSchemaType } from 'mongoose'

const UserSettingsSchema = new Schema({
	uid: { type: Number, required: true, index: true, unique: true },
	enableCookie: { type: Boolean, default: true },
	themeType: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
	themeColor: { type: String, default: '#3b82f6' },
	themeColorCustom: { type: String, default: '' },
	wallpaper: { type: String, default: '' },
	coloredSideBar: { type: Boolean, default: true },
	dataSaverMode: { type: String, enum: ['standard', 'limit', 'preview'], default: 'standard' },
	noSearchRecommendations: { type: Boolean, default: false },
	noRelatedVideos: { type: Boolean, default: false },
	noRecentSearch: { type: Boolean, default: false },
	noViewHistory: { type: Boolean, default: false },
	openInNewWindow: { type: Boolean, default: false },
	currentLocale: { type: String, default: 'en' },
	timezone: { type: String, default: 'UTC' },
	unitSystemType: { type: String, default: 'metric' },
	devMode: { type: Boolean, default: false },
	showCssDoodle: { type: Boolean, default: false },
	sharpAppearanceMode: { type: Boolean, default: false },
	flatAppearanceMode: { type: Boolean, default: false },
	userPrivaryVisibilitiesSetting: [{ type: Schema.Types.Mixed }],
	userLinkedAccountsVisibilitiesSetting: [{ type: Schema.Types.Mixed }],
	userWebsitePrivacySetting: { type: String, enum: ['public', 'following', 'private'], default: 'public' },
	editDateTime: { type: Number, default: () => Date.now() }
}, { timestamps: true })

UserSettingsSchema.index({ uid: 1 })

export type UserSettingsDocument = InferSchemaType<typeof UserSettingsSchema>
export const UserSettingsModel = model('userSettings', UserSettingsSchema) 