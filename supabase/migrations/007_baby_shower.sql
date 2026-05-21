-- Baby shower event details
CREATE TABLE baby_shower_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date DATE,
  event_time TEXT,
  location_name TEXT,
  location_address TEXT,
  description TEXT,
  registry_links JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE baby_shower_event DISABLE ROW LEVEL SECURITY;

-- Seed with empty event
INSERT INTO baby_shower_event (event_date) VALUES (NULL);

-- Guest list
CREATE TABLE baby_shower_guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  invitation_sent BOOLEAN DEFAULT false,
  invitation_sent_date DATE,
  rsvp_status TEXT DEFAULT 'pending' CHECK (rsvp_status IN ('pending', 'yes', 'no', 'maybe')),
  rsvp_date DATE,
  plus_one BOOLEAN DEFAULT false,
  plus_one_name TEXT,
  gift_description TEXT,
  thank_you_sent BOOLEAN DEFAULT false,
  notes TEXT,
  added_by TEXT DEFAULT 'host',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE baby_shower_guests DISABLE ROW LEVEL SECURITY;
