ALTER TABLE baby_shower_tasks ADD COLUMN helper_id UUID REFERENCES baby_shower_helpers(id) ON DELETE SET NULL;
ALTER TABLE baby_shower_helpers ADD COLUMN color TEXT DEFAULT '#6B5CA5';
