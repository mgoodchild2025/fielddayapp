-- Increase event-logos bucket file size limit from 2 MB to 5 MB
UPDATE storage.buckets
SET file_size_limit = 5242880  -- 5 MB
WHERE id = 'event-logos';
