-- Align editorial seed tribes to real district keys so the formation job fills
-- them (instead of creating empty duplicates alongside them). Names/labels are
-- intentionally left untouched ("Boğaz Sporcuları" stays a nice display name).

UPDATE tribes SET area_key = 'besiktas' WHERE area_key = 'bogaz';
UPDATE tribes SET area_key = 'beyoglu'  WHERE area_key = 'taksim';
UPDATE tribes SET area_key = 'fatih'    WHERE area_key = 'sultanahmet';
