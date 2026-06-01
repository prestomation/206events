// Category color system for the redesigned UI.
//
// The app's data model has no single "category" per calendar — calendars carry
// multiple freeform tags, and the tag taxonomy in lib/config/tags.ts already
// classifies each tag (Neighborhoods / Activities / Markets / Community / …).
// So a calendar is multi-membership: it browses under EVERY activity/market/
// community tag it has. The only place a single value is needed is the avatar /
// dot COLOR and the category-tinted event hero — that's what this module
// resolves, deterministically, from a calendar's tags.

import { TAG_CATEGORIES, categoryFor } from '../../../lib/config/tags.ts'

// Canonical category hues (light values; dark-mode variants live in index.css
// as --c-* CSS vars, which these mirror).
export const CATEGORY_COLORS = {
  music: '#7c3aed',
  art: '#c2410c',
  film: '#0e7490',
  market: '#15803d',
  talk: '#b45309',
  comedy: '#be185d',
  community: '#4d7c0f',
  food: '#b45309',
  sports: '#0e7490',
  nightlife: '#be185d',
  default: '#5b6470',
}

// Map specific activity/market/community tags onto a canonical color bucket.
// Tags not listed fall back to a stable hashed hue (colorForTag below).
const TAG_TO_CATEGORY = {
  Music: 'music', OpenMic: 'music',
  Art: 'art', Arts: 'art', Artwalk: 'art', Museums: 'art', Dance: 'art', Theatre: 'art',
  Movies: 'film',
  FarmersMarket: 'market', MakersMarket: 'market',
  Books: 'talk', Education: 'talk', Tech: 'talk', Trivia: 'talk', 'Pub Trivia': 'talk',
  Comedy: 'comedy',
  Community: 'community', Activism: 'community', Parks: 'community', Volunteer: 'community',
  Food: 'food', Beer: 'food',
  Sports: 'sports', Running: 'sports', Cycling: 'sports', Dogs: 'sports',
  Nightlife: 'nightlife',
}

// Priority order used to pick a single "primary" tag for the avatar swatch when
// a calendar has several category tags. Earlier = wins.
const CATEGORY_PRIORITY = [
  'Music', 'Movies', 'Art', 'Arts', 'Theatre', 'Dance', 'Museums', 'Comedy',
  'FarmersMarket', 'MakersMarket', 'Books', 'Tech', 'Education',
  'Community', 'Activism', 'Volunteer', 'Parks', 'Food', 'Beer', 'Sports',
  'Nightlife',
]

// Display order for the content-category dropdown groups.
export const CATEGORY_GROUP_ORDER = ['Activities', 'Markets', 'Community', 'Other']

// A "content category" tag is anything browsable on the category axis: every
// tag EXCEPT neighborhoods and the Special ("All") bucket. Uncategorized tags
// fall into "Other" via categoryFor() and are surfaced too — nothing hidden.
export function isCategoryTag(tag) {
  const c = categoryFor(tag)
  return c !== 'Neighborhoods' && c !== 'Special'
}

export function isNeighborhoodTag(tag) {
  return categoryFor(tag) === 'Neighborhoods'
}

// Taxonomy group a content-category tag belongs to (for dropdown grouping):
// Activities / Markets / Community / Other.
export function tagGroup(tag) {
  const c = categoryFor(tag)
  return CATEGORY_GROUP_ORDER.includes(c) ? c : 'Other'
}

// Stable hashed fallback hue for an uncategorized tag, so its dot/avatar color
// is at least consistent build-to-build.
function hashHue(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360
  return h
}

export function colorForTag(tag) {
  if (!tag) return CATEGORY_COLORS.default
  const cat = TAG_TO_CATEGORY[tag]
  if (cat) return CATEGORY_COLORS[cat]
  // Any other content tag (including uncategorized "Other") gets a stable
  // hashed hue so its dot/avatar color is consistent build-to-build.
  if (isCategoryTag(tag)) return `hsl(${hashHue(tag)} 45% 38%)`
  return CATEGORY_COLORS.default
}

// The single representative category tag for a calendar (for avatar/dot color
// and event-detail hero tint). Returns null when the calendar has no category
// tag at all.
export function primaryCategoryTag(tags = []) {
  for (const t of CATEGORY_PRIORITY) {
    if (tags.includes(t)) return t
  }
  // No priority match — take the first tag that is any category tag.
  return tags.find((t) => isCategoryTag(t)) || null
}

// Color for a calendar/channel from its tags.
export function channelColor(tags = []) {
  const primary = primaryCategoryTag(tags)
  return primary ? colorForTag(primary) : CATEGORY_COLORS.default
}
