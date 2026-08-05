CREATE TABLE `calendar_access_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`destination_id` text NOT NULL,
	`email` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`google_acl_rule_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`destination_id`) REFERENCES `destinations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `calendar_connections` (
	`id` text PRIMARY KEY DEFAULT 'google' NOT NULL,
	`client_id` text NOT NULL,
	`client_secret_cipher` text NOT NULL,
	`access_token_cipher` text,
	`refresh_token_cipher` text,
	`access_token_expires_at` text,
	`oauth_state` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trip_calendars` (
	`destination_id` text PRIMARY KEY NOT NULL,
	`google_calendar_id` text NOT NULL,
	`google_calendar_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`destination_id`) REFERENCES `destinations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `trip_items` ADD `google_event_id` text;
