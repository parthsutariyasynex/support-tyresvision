-- Vehicle.id: VARCHAR(191) cuid -> BIGINT UNSIGNED AUTO_INCREMENT.
-- Nothing references Vehicle.id (no foreign key points at it), so existing rows are simply renumbered 1, 2, 3...
-- Run once on a database whose Vehicle table still has the text id. Back up the table first.
ALTER TABLE `Vehicle`
  DROP PRIMARY KEY,
  DROP COLUMN `id`,
  ADD COLUMN `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT FIRST,
  ADD PRIMARY KEY (`id`);
