-- Increase org-photos bucket file size limit to 10 MB
UPDATE storage.buckets
SET file_size_limit = 10485760  -- 10 MB
WHERE id = 'org-photos';
