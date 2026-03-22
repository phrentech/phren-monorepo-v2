CREATE TABLE `appointment_history` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`status` text NOT NULL,
	`changed_at` text NOT NULL,
	`changed_by` text NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`service_id` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`scheduled_at` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`notes` text,
	`session_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`service_id`) REFERENCES `provider_services`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_role` text NOT NULL,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`detail` text,
	`ip_address` text NOT NULL,
	`outcome` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_accounts` (
	`provider_id` text NOT NULL,
	`provider_user_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`provider_id`, `provider_user_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`avatar_url` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `provider_availability` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`day_of_week` integer NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `provider_licenses` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`state` text NOT NULL,
	`license_number` text NOT NULL,
	`expiry_date` text,
	`verified` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `provider_services` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`service_name` text NOT NULL,
	`description` text,
	`duration_minutes` integer NOT NULL,
	`price` real NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `providers` (
	`user_id` text PRIMARY KEY NOT NULL,
	`bio` text,
	`specialization` text,
	`years_experience` integer,
	`hourly_rate` real,
	`timezone` text,
	`status` text DEFAULT 'pending_review' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `patient_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`category` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `patients` (
	`user_id` text PRIMARY KEY NOT NULL,
	`date_of_birth` text,
	`emergency_contact` text,
	`intake_completed` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `session_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `telehealth_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `telehealth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`livekit_room_name` text,
	`started_at` text,
	`ended_at` text,
	`recording_url` text,
	`vr_enabled` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `matching_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`recommended_provider_ids` text,
	`completed` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `matching_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `matching_conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`created_at` text NOT NULL,
	`last_message_at` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`content` text NOT NULL,
	`read_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
