export interface NovelSearchDto {
  q?: string
  page?: number
  limit?: number
  sort?: string
  order?: 'asc'|'desc'
  genres?: string[]
  tags?: string[]
  status?: string[]
  uploaderId?: number
  published?: boolean
}

export interface ChapterSearchDto {
  q?: string
  page?: number
  limit?: number
  sort?: string
  order?: 'asc'|'desc'
  novelId?: number
  minChapter?: number
  maxChapter?: number
  published?: boolean
} 