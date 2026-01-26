-- Migration: Convert Phase 1 tables to Hasura enum tables
-- Converts friend_request_status, item_type, and permission_type to proper enum tables

-- 1. Convert friend_request_status
-- Create the new enum table structure
CREATE TABLE friend_request_status_enum (
    value TEXT PRIMARY KEY,
    comment TEXT
);

-- Copy data from old table to new enum table
INSERT INTO friend_request_status_enum (value, comment)
SELECT text, comment FROM friend_request_status;

-- Drop the old table (this will cascade foreign key constraints)
DROP TABLE friend_request_status CASCADE;

-- Rename enum table to original name
ALTER TABLE friend_request_status_enum RENAME TO friend_request_status;

-- Recreate foreign key constraint with new structure
ALTER TABLE friend_requests 
ADD CONSTRAINT friend_requests_status_fkey 
FOREIGN KEY (status) REFERENCES friend_request_status(value);

-- 2. Convert item_type
-- Create the new enum table structure
CREATE TABLE item_type_enum (
    value TEXT PRIMARY KEY,
    comment TEXT
);

-- Copy data from old table to new enum table
INSERT INTO item_type_enum (value, comment)
SELECT text, comment FROM item_type;

-- Drop the old table (this will cascade foreign key constraints)
DROP TABLE item_type CASCADE;

-- Rename enum table to original name
ALTER TABLE item_type_enum RENAME TO item_type;

-- Recreate foreign key constraints with new structure
ALTER TABLE cellar_items 
ADD CONSTRAINT cellar_items_type_fkey 
FOREIGN KEY (type) REFERENCES item_type(value);

ALTER TABLE item_favorites 
ADD CONSTRAINT item_favorites_type_fkey 
FOREIGN KEY (type) REFERENCES item_type(value);

-- 3. Convert permission_type
-- Create the new enum table structure
CREATE TABLE permission_type_enum (
    value TEXT PRIMARY KEY,
    comment TEXT
);

-- Copy data from old table to new enum table
INSERT INTO permission_type_enum (value, comment)
SELECT text, comment FROM permission_type;

-- Drop the old table (this will cascade foreign key constraints)
DROP TABLE permission_type CASCADE;

-- Rename enum table to original name
ALTER TABLE permission_type_enum RENAME TO permission_type;

-- Recreate foreign key constraint with new structure
ALTER TABLE cellars 
ADD CONSTRAINT cellars_privacy_fkey 
FOREIGN KEY (privacy) REFERENCES permission_type(value);

-- Add comments to document these as Hasura enum tables
COMMENT ON TABLE friend_request_status IS 'Hasura enum table for friend request status values';
COMMENT ON TABLE item_type IS 'Hasura enum table for item type values';
COMMENT ON TABLE permission_type IS 'Hasura enum table for permission type values';