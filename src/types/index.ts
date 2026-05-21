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
  family_pin: string | null
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

export interface FamilyPost {
  id: string
  entry_id: string
  caption: string | null
  published_at: string
  user_id: string
  created_at: string
  updated_at: string
  photos?: FamilyPostPhoto[]
  entry?: { entry_date: string }
}

export interface FamilyPostPhoto {
  id: string
  family_post_id: string
  entry_photo_id: string
  display_order: number
  entry_photo?: { storage_path: string }
}

export interface BabyNameSuggestion {
  id: string
  name: string
  suggested_by: string | null
  created_at: string
}

export interface BabyShowerEvent {
  id: string
  event_date: string | null
  event_time: string | null
  location_name: string | null
  location_address: string | null
  description: string | null
  registry_links: { name: string; url: string }[]
  hero_image_path: string | null
  hero_focal_point: string | null
  background_image_path: string | null
  background_opacity: number
  background_zoom: number
  bg_fill_color: string
  bg_tile_path: string | null
  bg_tile_count: number
  bg_feather_edges: boolean
  created_at: string
  updated_at: string
}

export interface GuestAddress {
  street?: string
  apt?: string
  city?: string
  state?: string
  zip?: string
}

export interface BabyShowerGuest {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: GuestAddress | null
  invitation_sent: boolean
  invitation_sent_date: string | null
  rsvp_status: 'pending' | 'yes' | 'no' | 'maybe'
  rsvp_date: string | null
  plus_one: boolean
  plus_one_name: string | null
  gift_description: string | null
  gift_photo_path: string | null
  thank_you_sent: boolean
  dietary_needs: string | null
  notes: string | null
  side: 'L' | 'B' | null
  added_by: string
  created_at: string
  updated_at: string
}

export interface BabyShowerTask {
  id: string
  title: string
  completed: boolean
  display_order: number
  helper_id: string | null
  due_date: string | null
  created_at: string
}

export interface BabyShowerScheduleItem {
  id: string
  time_slot: string
  description: string
  display_order: number
  created_at: string
}

export interface BabyShowerPhoto {
  id: string
  storage_path: string
  uploaded_by: string | null
  created_at: string
}

export interface BabyShowerHelper {
  id: string
  name: string
  role: string
  color: string
  created_at: string
}

export interface BabyShowerMenuItem {
  id: string
  item_name: string
  quantity: number
  unit_label: string
  notes: string | null
  prepared: boolean
  display_order: number
  created_at: string
}

export type ThemeMode = 'light' | 'dark' | 'system'
