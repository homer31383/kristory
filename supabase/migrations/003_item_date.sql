-- Add optional date for standalone items
ALTER TABLE tagged_items ADD COLUMN IF NOT EXISTS item_date DATE;

-- Participants: many-to-many between items and users
CREATE TABLE IF NOT EXISTS tagged_item_participants (
  tagged_item_id UUID REFERENCES tagged_items(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (tagged_item_id, user_id)
);
ALTER TABLE tagged_item_participants DISABLE ROW LEVEL SECURITY;

-- Backfill item_date from linked journal entries where possible
UPDATE tagged_items
SET item_date = je.entry_date
FROM journal_entries je
WHERE tagged_items.entry_id = je.id
AND tagged_items.item_date IS NULL;

-- Backfill participants from the item's user_id (the person who added it)
INSERT INTO tagged_item_participants (tagged_item_id, user_id)
SELECT id, user_id FROM tagged_items WHERE user_id IS NOT NULL
ON CONFLICT DO NOTHING;
