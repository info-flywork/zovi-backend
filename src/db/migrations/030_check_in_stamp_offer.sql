-- Persist a random stamp offer on each check-in; accept spends that check-in's coins.
ALTER TABLE check_ins
  ADD COLUMN offered_stamp_id CHAR(36) NULL AFTER is_first_ever,
  ADD COLUMN stamp_accepted_at DATETIME(3) NULL AFTER offered_stamp_id,
  ADD CONSTRAINT fk_check_ins_offered_stamp
    FOREIGN KEY (offered_stamp_id) REFERENCES stamps(id) ON DELETE SET NULL;
