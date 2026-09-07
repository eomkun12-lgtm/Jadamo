ALTER TABLE `trip_items` ADD `booking_status` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `trip_items` ADD `booking_owner` text DEFAULT '' NOT NULL;