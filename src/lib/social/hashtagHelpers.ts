/**
 * Hashtag helpers — extract / normalize / append hashtags for social posts.
 *
 * Convention: stored & compared lowercase (case-insensitive parity with
 * how Instagram, X, TikTok all treat hashtags).
 */

const HASHTAG_REGEX = /#(\w+)/g

export function extractHashtags(text: string): string[] {
  if (!text) return []
  const results: string[] = []
  for (const match of text.matchAll(HASHTAG_REGEX)) {
    results.push(match[1].toLowerCase())
  }
  return results
}

export function normalizeHashtag(raw: string): string {
  return raw.replace(/^#/, '').trim().replace(/\s+/g, '').toLowerCase()
}

export function appendHashtagsToCaption(
  caption: string,
  hashtags: string[],
): string {
  if (!hashtags || hashtags.length === 0) return caption
  const normalized = hashtags.map((h) => `#${normalizeHashtag(h)}`)
  return `${caption}\n\n${normalized.join(' ')}`
}
