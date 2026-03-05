export interface User {
  id: string
  name: string
}

export interface JournalEntry {
  id: string
  entry_date: string
  created_at: string
  updated_at: string
  sections?: EntrySection[]
  photos?: EntryPhoto[]
  tagged_items?: TaggedItem[]
  trip_entries?: TripEntry[]
}

export interface EntrySection {
  id: string
  entry_id: string
  user_id: string
  content: string | null
  created_at: string
  updated_at: string
}

export interface EntryPhoto {
  id: string
  entry_id: string
  user_id: string
  storage_path: string
  display_order: number
  created_at: string
}

export interface Category {
  id: string
  name: string
  emoji: string | null
  is_default: boolean
  created_at: string
}

export interface TaggedItem {
  id: string
  entry_id: string | null
  category_id: string
  user_id: string
  name: string
  rating: number | null
  location_name: string | null
  location_lat: number | null
  location_lng: number | null
  location_place_id: string | null
  ingredients: string | null
  instructions: string | null
  item_date: string | null
  created_at: string
  category?: Category
  entry?: { entry_date: string }
  user?: { id: string; name: string }
  recipe_tags?: { tag: RecipeTag }[]
  participants?: { user: User }[]
}

export interface RecipeTag {
  id: string
  name: string
  emoji: string | null
  created_at: string
}

export interface Trip {
  id: string
  title: string
  summary: string | null
  cover_photo_path: string | null
  start_date: string
  end_date: string
  created_at: string
  entries?: JournalEntry[]
}

export interface TripEntry {
  trip_id: string
  entry_id: string
  trip?: Trip
}

export interface BabyProfile {
  id: string
  name: string | null
  due_date: string | null
  birth_date: string | null
  birth_weight: string | null
  birth_length: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface BabyMilestone {
  id: string
  entry_id: string | null
  title: string
  milestone_type: string
  milestone_date: string
  notes: string | null
  photo_path: string | null
  created_at: string
  entry?: {
    entry_date: string
    sections?: EntrySection[]
  }
}

export type ThemeMode = 'light' | 'dark' | 'system'
