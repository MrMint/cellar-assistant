-- Rollback: Convert Hasura enum tables back to original structure
-- Reverts friend_request_status, item_type, and permission_type back to original format

-- 1. Revert permission_type
-- Create the original table structure
CREATE TABLE permission_type_temp (
    text TEXT PRIMARY KEY,
    comment TEXT
);

-- Copy data from enum table to original structure
INSERT INTO permission_type_temp (text, comment)
SELECT value, comment FROM permission_type;

-- Drop the enum table (this will cascade foreign key constraints)
DROP TABLE permission_type CASCADE;

-- Rename temp table to original name
ALTER TABLE permission_type_temp RENAME TO permission_type;

-- Recreate foreign key constraint with original structure
ALTER TABLE cellars 
ADD CONSTRAINT cellars_privacy_fkey 
FOREIGN KEY (privacy) REFERENCES permission_type(text);

-- 2. Revert item_type
-- Create the original table structure
CREATE TABLE item_type_temp (
    text TEXT PRIMARY KEY,
    comment TEXT
);

-- Copy data from enum table to original structure
INSERT INTO item_type_temp (text, comment)
SELECT value, comment FROM item_type;

-- Drop the enum table (this will cascade foreign key constraints)
DROP TABLE item_type CASCADE;

-- Rename temp table to original name
ALTER TABLE item_type_temp RENAME TO item_type;

-- Recreate foreign key constraints with original structure
ALTER TABLE cellar_items 
ADD CONSTRAINT cellar_items_type_fkey 
FOREIGN KEY (type) REFERENCES item_type(text);

ALTER TABLE item_favorites 
ADD CONSTRAINT item_favorites_type_fkey 
FOREIGN KEY (type) REFERENCES item_type(text);

-- 3. Revert friend_request_status
-- Create the original table structure
CREATE TABLE friend_request_status_temp (
    text TEXT PRIMARY KEY,
    comment TEXT
);

-- Copy data from enum table to original structure
INSERT INTO friend_request_status_temp (text, comment)
SELECT value, comment FROM friend_request_status;

-- Drop the enum table (this will cascade foreign key constraints)
DROP TABLE friend_request_status CASCADE;

-- Rename temp table to original name
ALTER TABLE friend_request_status_temp RENAME TO friend_request_status;

-- Recreate foreign key constraint with original structure
ALTER TABLE friend_requests 
ADD CONSTRAINT friend_requests_status_fkey 
FOREIGN KEY (status) REFERENCES friend_request_status(text);

-- Remove comments
COMMENT ON TABLE friend_request_status IS NULL;
COMMENT ON TABLE item_type IS NULL;
COMMENT ON TABLE permission_type IS NULL;