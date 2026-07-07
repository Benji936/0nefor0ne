-- 1. Create the bucket (if it doesn't exist)
INSERT INTO storage.buckets (id, name, public)
VALUES ('announce-images', 'announce-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow public read access to the bucket
CREATE POLICY "Public Read Access"
  ON storage.objects FOR SELECT
  USING ( bucket_id = 'announce-images' );

-- 3. Allow authenticated users to upload their own images
CREATE POLICY "Authenticated users can upload images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'announce-images' 
    AND auth.role() = 'authenticated'
  );

-- 4. Allow users to update their own images
CREATE POLICY "Users can update their own images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'announce-images' 
    AND auth.uid() = owner
  );

-- 5. Allow users to delete their own images
CREATE POLICY "Users can delete their own images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'announce-images' 
    AND auth.uid() = owner
  );
