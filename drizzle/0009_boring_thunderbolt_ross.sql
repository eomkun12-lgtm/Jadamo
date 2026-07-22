CREATE TABLE `notices` (
	`id` text PRIMARY KEY NOT NULL,
	`destination_id` text,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`start_at` text DEFAULT '' NOT NULL,
	`end_at` text DEFAULT '' NOT NULL,
	`is_popup` integer DEFAULT 1 NOT NULL,
	`is_important` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
