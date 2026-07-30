ALTER TABLE `underwater_photos` ADD `enhancement_status` text DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
ALTER TABLE `underwater_photos` ADD `is_representative` integer DEFAULT 0 NOT NULL;
