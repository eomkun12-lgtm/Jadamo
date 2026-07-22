CREATE TABLE `travelers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`flight_status` text DEFAULT 'confirmed' NOT NULL,
	`flight_note` text DEFAULT '' NOT NULL,
	`hotel_status` text DEFAULT 'vessel' NOT NULL,
	`hotel_note` text DEFAULT '' NOT NULL,
	`dive_days` text DEFAULT '[]' NOT NULL,
	`certification` text DEFAULT '미정' NOT NULL,
	`gear_rental` text DEFAULT 'none' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`edit_pin_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
