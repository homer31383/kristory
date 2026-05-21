ALTER TABLE baby_shower_guests ADD COLUMN side TEXT CHECK (side IN ('L', 'B'));
