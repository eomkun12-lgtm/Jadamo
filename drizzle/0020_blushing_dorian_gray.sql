CREATE TABLE `dive_shop_stamps` (
	`id` text PRIMARY KEY NOT NULL,
	`destination_id` text NOT NULL,
	`shop_name` text NOT NULL,
	`visited_at` text NOT NULL,
	`original_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`r2_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`destination_id`) REFERENCES `destinations`(`id`) ON UPDATE no action ON DELETE cascade
);
