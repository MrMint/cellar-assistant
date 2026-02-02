-- Remove kura brand type
-- Note: This will fail if any brands are using this type
DELETE FROM brand_types WHERE id = 'kura';
