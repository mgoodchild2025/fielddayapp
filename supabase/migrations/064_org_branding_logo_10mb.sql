-- Increase org-branding bucket file size limit from 2 MB to 10 MB
-- Allows orgs to upload higher-resolution logos (images are converted to WebP server-side,
-- so the stored file will still be compact regardless of the original upload size)
UPDATE storage.buckets
SET file_size_limit = 10485760  -- 10 MB
WHERE id = 'org-branding';
