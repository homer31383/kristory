ALTER TABLE baby_shower_guests
  ALTER COLUMN address TYPE JSONB
  USING CASE WHEN address IS NOT NULL THEN jsonb_build_object('street', address) ELSE NULL END;
