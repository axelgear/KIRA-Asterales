/**
 * Genre Mapper - Consolidates Duplicate Genres
 * 
 * This script maps duplicate genres to unique ones and limits the total to 50
 * based on usage frequency and logical grouping.
 */

export const GENRE_MAPPER: Record<string, string> = {
  // High-usage genres (keep as-is)
  'Fan-Fiction': 'Fan-Fiction', // 39,256 novels
  'Fantasy': 'Fantasy', // 27,615 novels
  'Romance': 'Romance', // 9,630 novels
  'Action': 'Action', // 9,161 novels
  'Urban': 'Urban', // 7,926 novels
  'Historical': 'Historical', // 6,849 novels
  'Drama': 'Drama', // 5,533 novels
  'Adventure': 'Adventure', // 3,336 novels
  'Sci-fi': 'Science Fiction', // 3,318 novels
  'Comedy': 'Comedy', // 3,202 novels
  'Harem': 'Harem', // 2,772 novels
  'Slice Of Life': 'Slice of Life', // 1,942 novels
  'Xuanhuan': 'Xuanhuan', // 1,942 novels
  'Supernatural': 'Supernatural', // 1,579 novels
  'Xianxia': 'Xianxia', // 1,402 novels
  'School Life': 'School Life', // 1,340 novels
  'Martial Arts': 'Martial Arts', // 1,028 novels
  'Sports': 'Sports', // 901 novels
  'Game': 'Gaming', // 746 novels
  'Mystery': 'Mystery', // 693 novels
  'Psychological': 'Psychological', // 616 novels
  'Horror': 'Horror', // 378 novels
  'Tragedy': 'Tragedy', // 367 novels
  'Suspense': 'Suspense', // 340 novels
  'Military': 'Military', // 313 novels
  'Wuxia': 'Wuxia', // 236 novels
  'Ecchi': 'Ecchi', // 219 novels
  'Yuri': 'Yuri', // 198 novels
  'Virtual Reality': 'Virtual Reality', // 197 novels
  'Gender Bender': 'Gender Bender', // 111 novels
  'Mecha': 'Mecha', // 110 novels
  'Mythology & Legends': 'Mythology & Legends', // 49 novels
  'Video Games': 'Gaming', // 44 novels - map to Gaming
  'LGBT+': 'LGBT+', // 42 novels - keep as-is
  'Official Circles': 'Workplace', // 41 novels - map to Workplace
  'Shounen-Ai': 'Boys Love', // 37 novels - map to Boys Love
  'Fantasy Magic': 'Fantasy', // 37 novels - map to Fantasy
  'Science Fiction': 'Science Fiction', // 36 novels - keep as-is
  'Magical Realism': 'Magical Realism', // 35 novels - keep as-is
  'Cultivation Martial Arts': 'Martial Arts', // 35 novels - map to Martial Arts
  'Wuxia Cultivation': 'Wuxia', // 35 novels - map to Wuxia
  'Shoujo Ai': 'Girls Love', // 34 novels - map to Girls Love
  'Horror & Supernatural': 'Horror', // 28 novels - map to Horror
  'Traditional Wuxia': 'Wuxia', // 26 novels - map to Wuxia
  'Sci-fi Space': 'Science Fiction', // 24 novels - map to Science Fiction
  'Classical Xianxia': 'Xianxia', // 24 novels - map to Xianxia
  'Otherworldly Continent': 'Fantasy', // 24 novels - map to Fantasy
  'Erciyuan': 'Anime', // 21 novels - map to Anime
  'Traveling Through': 'Time Travel', // 19 novels - map to Time Travel
  'VirtualReality': 'Virtual Reality', // 18 novels - map to Virtual Reality
  'Reincarnation': 'Reincarnation', // 16 novels - keep as-is
  'faloo': 'Fantasy', // 14 novels - map to Fantasy
  'Wuxia Xianxia': 'Wuxia', // 14 novels - map to Wuxia
  'Game Competition': 'Gaming', // 13 novels - map to Gaming
  'RealisticFiction': 'Realistic Fiction', // 13 novels - map to Realistic Fiction
  'Contemporary Romance': 'Romance', // 11 novels - map to Romance
  'Suspense thriller': 'Suspense', // 11 novels - map to Suspense
  'Two-dimensional': 'Anime', // 10 novels - map to Anime
  'Rebirth': 'Reincarnation', // 10 novels - map to Reincarnation
  'Travel': 'Adventure', // 10 novels - map to Adventure
  'Light Novel': 'Light Novel', // 9 novels - keep as-is
  'Billionaire': 'Billionaire', // 9 novels - keep as-is
  'Horror&': 'Horror', // 8 novels - map to Horror
  'City': 'Urban', // 8 novels - map to Urban
  'Historical Military': 'Military', // 8 novels - map to Military
  'Modern Life': 'Slice of Life', // 7 novels - map to Slice of Life
  '轻小说': 'Light Novel', // 6 novels - map to Light Novel
  'Interstellar Cultivation': 'Science Fiction', // 6 novels - map to Science Fiction
  'Two Dimension': 'Anime', // 6 novels - map to Anime
  'Science fiction': 'Science Fiction', // 6 novels - map to Science Fiction
  'Beauty': 'Slice of Life', // 6 novels - map to Slice of Life
  'Transmigration': 'Fantasy', // 5 novels - map to Fantasy
  'Villain': 'Action', // 5 novels - map to Action
  'Modern Romance': 'Romance', // 5 novels - map to Romance
  'War&': 'War', // 4 novels - map to War
  'Traveling through time': 'Time Travel', // 4 novels - map to Time Travel
  'CEO': 'Slice of Life', // 4 novels - map to Slice of Life
  'History': 'Historical', // 4 novels - map to Historical
  'Reborn': 'Reincarnation', // 4 novels - map to Reincarnation
  'Serial': 'General Fiction', // 4 novels - map to General Fiction
  'Dynasty Wars': 'War', // 3 novels - map to War
  'Urban Brain': 'Urban', // 3 novels - map to Urban
  'Doujin': 'Fan-Fiction', // 3 novels - map to Fan-Fiction
  'School Beauty': 'School Life', // 3 novels - map to School Life
  'Science Fiction Online Game': 'Gaming', // 3 novels - map to Gaming
  'Survival': 'Adventure', // 3 novels - map to Adventure
  'Completed': 'Completed', // 3 novels - keep as-is
  'Military History': 'Military', // 3 novels - map to Military
  'LGBT': 'LGBT+', // 3 novels - map to LGBT+
  'Doctor': 'Slice of Life', // 3 novels - map to Slice of Life
  'Secret': 'Mystery', // 2 novels - map to Mystery
  'Throungh': 'Time Travel', // 2 novels - map to Time Travel
  'Modern': 'Slice of Life', // 2 novels - map to Slice of Life
  'Competitive Sports': 'Sports', // 2 novels - map to Sports
  'Teen': 'Young Adult', // 2 novels - map to Young Adult
  'Magic': 'Fantasy', // 2 novels - map to Fantasy
  'Online Games': 'Gaming', // 2 novels - map to Gaming
  'Pirates': 'Adventure', // 2 novels - map to Adventure
  'Shoujo-Ai': 'Romance', // 2 novels - map to Romance
  'Entertainment': 'Slice of Life', // 2 novels - map to Slice of Life
  'Dimension': 'Fantasy', // 2 novels - map to Fantasy
  'Modern&': 'Slice of Life', // 2 novels - map to Slice of Life
  'GayRomance': 'LGBT+', // 1 novel - map to LGBT+
  'Empress': 'Historical', // 1 novel - map to Historical
  'Live': 'Slice of Life', // 1 novel - map to Slice of Life
  'Single Female': 'Romance', // 1 novel - map to Romance
  'Fanfcition': 'Fan-Fiction', // 1 novel - map to Fan-Fiction
  'War&Military': 'War', // 1 novel - map to War
  'Terror': 'Horror', // 1 novel - map to Horror
  'SliceOfLife': 'Slice of Life', // 1 novel - map to Slice of Life
  'Ancient Romance': 'Romance', // 1 novel - map to Romance
  'Star': 'Slice of Life', // 1 novel - map to Slice of Life
  'Oriental Fantasy': 'Fantasy', // 1 novel - map to Fantasy
  'Magical realism': 'Magical Realism', // 1 novel - map to Magical Realism
  'Funny': 'Comedy', // 1 novel - map to Comedy
  'Youth & Campus': 'School Life', // 1 novel - map to School Life
  'Realism': 'Realistic Fiction', // 1 novel - map to Realistic Fiction
  'Realistic': 'Realistic Fiction', // 1 novel - map to Realistic Fiction
  'Fiction': 'General Fiction', // 1 novel - map to General Fiction
  'Youth Campus': 'School Life', // 1 novel - map to School Life
  'Science Fiction Online': 'Gaming', // 1 novel - map to Gaming
  'Science': 'Science Fiction', // 1 novel - map to Science Fiction
  'Military Histo': 'Military', // 1 novel - map to Military
  'Billionaires': 'Billionaire', // 1 novel - map to Billionaire
  'Crossing': 'Time Travel', // 1 novel - map to Time Travel
  'Suspense Thriller': 'Suspense', // 1 novel - map to Suspense
  'Special Force': 'Military', // 1 novel - map to Military
  '短篇其他': 'Short Story', // 1 novel - map to Short Story
}

/**
 * Get unique genres after mapping (should be 50 or fewer)
 */
export function getUniqueGenres(): string[] {
  const uniqueGenres = new Set(Object.values(GENRE_MAPPER))
  return Array.from(uniqueGenres).sort()
}

/**
 * Get unique genres after mapping with their counts
 */
export function getUniqueGenresWithCounts(): Record<string, number> {
  const genreCounts: Record<string, number> = {}
  
  // Count how many times each mapped genre appears
  Object.values(GENRE_MAPPER).forEach(mappedGenre => {
    genreCounts[mappedGenre] = (genreCounts[mappedGenre] || 0) + 1
  })
  
  return genreCounts
}

/**
 * Get genre mapping statistics with detailed counts
 */
export function getGenreMappingStats() {
  const uniqueGenres = getUniqueGenres()
  const totalMappings = Object.keys(GENRE_MAPPER).length
  const genreCounts = getUniqueGenresWithCounts()
  
  // Sort genres by count (descending)
  const sortedGenres = Object.entries(genreCounts)
    .sort(([,a], [,b]) => b - a)
    .map(([genre, count]) => ({ genre, count }))
  
  return {
    totalOriginalGenres: totalMappings,
    totalUniqueGenres: uniqueGenres.length,
    uniqueGenres: uniqueGenres,
    mappingEfficiency: ((totalMappings - uniqueGenres.length) / totalMappings * 100).toFixed(1) + '%',
    genreCounts: genreCounts,
    sortedGenres: sortedGenres
  }
}

/**
 * Apply genre mapping to a list of genres
 */
export function mapGenres(genres: string[]): string[] {
  if (!Array.isArray(genres)) return []
  
  return genres
    .map(genre => GENRE_MAPPER[genre] || genre) // Use mapping or keep original
    .filter(genre => genre && genre.trim() !== '') // Remove empty genres
    .map(genre => genre.trim()) // Trim whitespace
    .filter((genre, index, arr) => arr.indexOf(genre) === index) // Remove duplicates
}

// Log the mapping statistics with counts
console.log('🎭 Genre Mapping Statistics:')
const stats = getGenreMappingStats()
console.log(stats)

console.log('\n📊 Genre Counts (sorted by frequency):')
stats.sortedGenres.forEach(({ genre, count }) => {
  console.log(`  ${genre}: ${count} original genres mapped to this`)
})

console.log('\n💡 Optimization Suggestions:')
console.log('  - Genres with count 1: Consider merging with similar genres')
console.log('  - Genres with count 2-3: Consider if they can be consolidated')
console.log('  - Genres with count 4+: Probably worth keeping separate') 