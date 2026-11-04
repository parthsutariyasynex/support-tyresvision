-- Vehicle table (customer vehicles: chat header car button / contact profile "Add Vehicle").
-- Full definition, taken from the local database (SHOW CREATE TABLE Vehicle) on 2026-11-02.
-- Use this on a database that does NOT have the Vehicle table yet.
-- If the table already exists, run 2026-11-02_vehicle_remarks.sql and 2026-11-02_vehicle_plate_optional.sql instead.

CREATE TABLE IF NOT EXISTS `Vehicle` (
  `id`               VARCHAR(191) NOT NULL,
  `workspaceId`      VARCHAR(191) NOT NULL,
  `contactId`        VARCHAR(191) NOT NULL,
  `plateNumber`      VARCHAR(20)  NULL,
  `make`             VARCHAR(60)  NOT NULL,
  `model`            VARCHAR(60)  NOT NULL,
  `year`             INT          NOT NULL,
  `registrationDate` DATE         NULL,
  `lastServiceDate`  DATE         NULL,
  `tireSize1`        VARCHAR(30)  NOT NULL,
  `tireSize2`        VARCHAR(30)  NULL,
  `remarks`          TEXT         NULL,
  `createdAt`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdBy`        VARCHAR(191) NULL,
  `updatedAt`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedBy`        VARCHAR(191) NULL,
  `deletedAt`        DATETIME(3)  NULL,
  `deletedBy`        VARCHAR(191) NULL,
  PRIMARY KEY (`id`),
  INDEX `Vehicle_contactId_createdAt_idx` (`contactId`, `createdAt`),
  INDEX `Vehicle_workspaceId_idx` (`workspaceId`),
  CONSTRAINT `Vehicle_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `Contact` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Vehicle_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
