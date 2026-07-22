CREATE TABLE `destinations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`region` text DEFAULT '' NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`month` text DEFAULT 'TBD' NOT NULL,
	`year` text DEFAULT '2026' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
