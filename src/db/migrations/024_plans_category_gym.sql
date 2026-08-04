-- Allow gym as a plan / place category.
ALTER TABLE plans
  MODIFY COLUMN category ENUM(
    'music',
    'cafe',
    'park',
    'culture',
    'restaurant',
    'gym',
    'other'
  ) NULL;
