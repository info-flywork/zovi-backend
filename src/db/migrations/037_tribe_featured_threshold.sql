-- First five catalog tribes must be joinable for the seed account (streak ~2).
UPDATE tribes
SET threshold = 1
WHERE area_key LIKE 'catalog-%' AND sort_order BETWEEN 1 AND 5;
