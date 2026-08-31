ALTER TABLE `trip_items` ADD `map_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `trip_items` ADD `latitude` real;--> statement-breakpoint
ALTER TABLE `trip_items` ADD `longitude` real;