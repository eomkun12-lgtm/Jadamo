ALTER TABLE `dive_logs` ADD `average_depth` real;--> statement-breakpoint
ALTER TABLE `dive_logs` ADD `profile` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `dive_logs` ADD `tank_gas` text DEFAULT 'Air' NOT NULL;--> statement-breakpoint
ALTER TABLE `dive_logs` ADD `tank_pressure_start` real;--> statement-breakpoint
ALTER TABLE `dive_logs` ADD `tank_pressure_end` real;
