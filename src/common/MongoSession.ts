import mongoose from 'mongoose'
import type { ClientSession } from 'mongoose'

export async function withMongoSession<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession()
  try {
    let result: T | undefined
    await session.withTransaction(async () => {
      result = await fn(session)
    })
    return result as T
  } finally {
    await session.endSession()
  }
} 