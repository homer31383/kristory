-- Add recipe fields to tagged_items
ALTER TABLE tagged_items ADD COLUMN IF NOT EXISTS ingredients TEXT;
ALTER TABLE tagged_items ADD COLUMN IF NOT EXISTS instructions TEXT;

-- Make entry_id nullable for standalone recipes
ALTER TABLE tagged_items ALTER COLUMN entry_id DROP NOT NULL;

-- Recipe tags (pasta, salad, soup, etc.) — many-to-many
CREATE TABLE IF NOT EXISTS recipe_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  emoji TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE recipe_tags DISABLE ROW LEVEL SECURITY;

-- Junction table: tagged_items <-> recipe_tags
CREATE TABLE IF NOT EXISTS tagged_item_recipe_tags (
  tagged_item_id UUID REFERENCES tagged_items(id) ON DELETE CASCADE,
  recipe_tag_id UUID REFERENCES recipe_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (tagged_item_id, recipe_tag_id)
);

ALTER TABLE tagged_item_recipe_tags DISABLE ROW LEVEL SECURITY;

-- Seed default recipe tags
INSERT INTO recipe_tags (name, emoji) VALUES
  ('Pasta', '🍝'),
  ('Salad', '🥗'),
  ('Soup', '🍲'),
  ('Sauce', '🫙'),
  ('Sandwich', '🥪'),
  ('Protein', '🍗'),
  ('Baking', '🍞'),
  ('Sweets', '🍪'),
  ('Pancakes', '🥞'),
  ('Cookies', '🍪'),
  ('Sides', '🥦'),
  ('Breakfast', '🍳')
ON CONFLICT (name) DO NOTHING;
