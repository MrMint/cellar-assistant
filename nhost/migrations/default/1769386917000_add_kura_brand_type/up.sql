-- Add kura (Japanese sake brewery) as a brand type
INSERT INTO brand_types (id, comment) VALUES
('kura', 'Japanese sake brewery (酒蔵)')
ON CONFLICT (id) DO NOTHING;
