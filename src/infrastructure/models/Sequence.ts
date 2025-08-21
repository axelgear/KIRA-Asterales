import { Schema, model } from 'mongoose'

const SequenceSchema = new Schema({
	name: { type: String, required: true, unique: true, index: true },
	value: { type: Number, required: true, default: 0 }
}, { collection: 'sequences', versionKey: false })

const SequenceModel = model('Sequence', SequenceSchema)

export async function getNextSequence(name: string): Promise<number> {
	const doc = await SequenceModel.findOneAndUpdate(
		{ name },
		{ $inc: { value: 1 } },
		{ new: true, upsert: true }
	).lean()
	return doc!.value
} 