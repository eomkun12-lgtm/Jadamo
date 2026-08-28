-- Seed the tentative October 2027 Palau tour plan into the existing Palau trip.
-- Flight times and Taiwan hotels are intentionally left unspecified until booking details are confirmed.

INSERT INTO `trip_items` (`id`, `destination_id`, `category`, `date`, `time`, `title`, `location`, `note`, `sort_order`, `created_at`)
SELECT 'palau-20271001-icn-tpe', d.`id`, 'flight', '2027-10-01', '', '인천 → 타이페이', '인천국제공항 → 타이페이', '팔라우 이동을 위한 대만 경유 일정. 항공편/시간은 추후 확정.', COALESCE((SELECT MAX(t.`sort_order`) FROM `trip_items` t WHERE t.`destination_id` = d.`id`), -1) + 1, CURRENT_TIMESTAMP
FROM `destinations` d
WHERE d.`year` = '2027' AND UPPER(d.`month`) = 'OCT' AND (LOWER(d.`name`) = 'palau' OR d.`name` = '팔라우')
AND NOT EXISTS (SELECT 1 FROM `trip_items` t WHERE t.`id` = 'palau-20271001-icn-tpe');
--> statement-breakpoint
INSERT INTO `trip_items` (`id`, `destination_id`, `category`, `date`, `time`, `title`, `location`, `note`, `sort_order`, `created_at`)
SELECT 'palau-20271001-taiwan-stay', d.`id`, 'stay', '2027-10-01', '', '대만 1박', '타이페이', '10/2 팔라우행 연결을 위한 대만 1박. 숙소는 추후 확정.', COALESCE((SELECT MAX(t.`sort_order`) FROM `trip_items` t WHERE t.`destination_id` = d.`id`), -1) + 1, CURRENT_TIMESTAMP
FROM `destinations` d
WHERE d.`year` = '2027' AND UPPER(d.`month`) = 'OCT' AND (LOWER(d.`name`) = 'palau' OR d.`name` = '팔라우')
AND NOT EXISTS (SELECT 1 FROM `trip_items` t WHERE t.`id` = 'palau-20271001-taiwan-stay');
--> statement-breakpoint
INSERT INTO `trip_items` (`id`, `destination_id`, `category`, `date`, `time`, `title`, `location`, `note`, `sort_order`, `created_at`)
SELECT 'palau-20271002-tpe-ror', d.`id`, 'flight', '2027-10-02', '', '타이페이 → 팔라우', '타이페이 → 팔라우', '타이페이↔팔라우 노선이 월·수·목·토 운항을 유지한다고 가정한 일정. 항공편/시간은 추후 확정.', COALESCE((SELECT MAX(t.`sort_order`) FROM `trip_items` t WHERE t.`destination_id` = d.`id`), -1) + 1, CURRENT_TIMESTAMP
FROM `destinations` d
WHERE d.`year` = '2027' AND UPPER(d.`month`) = 'OCT' AND (LOWER(d.`name`) = 'palau' OR d.`name` = '팔라우')
AND NOT EXISTS (SELECT 1 FROM `trip_items` t WHERE t.`id` = 'palau-20271002-tpe-ror');
--> statement-breakpoint
INSERT INTO `trip_items` (`id`, `destination_id`, `category`, `date`, `time`, `title`, `location`, `note`, `sort_order`, `created_at`)
SELECT 'palau-20271003-dive-day1', d.`id`, 'activity', '2027-10-03', '', '팔라우 다이빙 Day 1', 'Palau', '총 4일 다이빙 중 1일차.', COALESCE((SELECT MAX(t.`sort_order`) FROM `trip_items` t WHERE t.`destination_id` = d.`id`), -1) + 1, CURRENT_TIMESTAMP
FROM `destinations` d
WHERE d.`year` = '2027' AND UPPER(d.`month`) = 'OCT' AND (LOWER(d.`name`) = 'palau' OR d.`name` = '팔라우')
AND NOT EXISTS (SELECT 1 FROM `trip_items` t WHERE t.`id` = 'palau-20271003-dive-day1');
--> statement-breakpoint
INSERT INTO `trip_items` (`id`, `destination_id`, `category`, `date`, `time`, `title`, `location`, `note`, `sort_order`, `created_at`)
SELECT 'palau-20271004-dive-day2', d.`id`, 'activity', '2027-10-04', '', '팔라우 다이빙 Day 2', 'Palau', '총 4일 다이빙 중 2일차.', COALESCE((SELECT MAX(t.`sort_order`) FROM `trip_items` t WHERE t.`destination_id` = d.`id`), -1) + 1, CURRENT_TIMESTAMP
FROM `destinations` d
WHERE d.`year` = '2027' AND UPPER(d.`month`) = 'OCT' AND (LOWER(d.`name`) = 'palau' OR d.`name` = '팔라우')
AND NOT EXISTS (SELECT 1 FROM `trip_items` t WHERE t.`id` = 'palau-20271004-dive-day2');
--> statement-breakpoint
INSERT INTO `trip_items` (`id`, `destination_id`, `category`, `date`, `time`, `title`, `location`, `note`, `sort_order`, `created_at`)
SELECT 'palau-20271005-dive-day3', d.`id`, 'activity', '2027-10-05', '', '팔라우 다이빙 Day 3', 'Palau', '총 4일 다이빙 중 3일차.', COALESCE((SELECT MAX(t.`sort_order`) FROM `trip_items` t WHERE t.`destination_id` = d.`id`), -1) + 1, CURRENT_TIMESTAMP
FROM `destinations` d
WHERE d.`year` = '2027' AND UPPER(d.`month`) = 'OCT' AND (LOWER(d.`name`) = 'palau' OR d.`name` = '팔라우')
AND NOT EXISTS (SELECT 1 FROM `trip_items` t WHERE t.`id` = 'palau-20271005-dive-day3');
--> statement-breakpoint
INSERT INTO `trip_items` (`id`, `destination_id`, `category`, `date`, `time`, `title`, `location`, `note`, `sort_order`, `created_at`)
SELECT 'palau-20271006-dive-day4', d.`id`, 'activity', '2027-10-06', '', '팔라우 다이빙 Day 4', 'Palau', '총 4일 다이빙 중 4일차.', COALESCE((SELECT MAX(t.`sort_order`) FROM `trip_items` t WHERE t.`destination_id` = d.`id`), -1) + 1, CURRENT_TIMESTAMP
FROM `destinations` d
WHERE d.`year` = '2027' AND UPPER(d.`month`) = 'OCT' AND (LOWER(d.`name`) = 'palau' OR d.`name` = '팔라우')
AND NOT EXISTS (SELECT 1 FROM `trip_items` t WHERE t.`id` = 'palau-20271006-dive-day4');
--> statement-breakpoint
INSERT INTO `trip_items` (`id`, `destination_id`, `category`, `date`, `time`, `title`, `location`, `note`, `sort_order`, `created_at`)
SELECT 'palau-20271007-ror-tpe', d.`id`, 'flight', '2027-10-07', '', '팔라우 → 타이페이', '팔라우 → 타이페이', '타이페이↔팔라우 노선이 월·수·목·토 운항을 유지한다고 가정한 귀국 경유 일정. 항공편/시간은 추후 확정.', COALESCE((SELECT MAX(t.`sort_order`) FROM `trip_items` t WHERE t.`destination_id` = d.`id`), -1) + 1, CURRENT_TIMESTAMP
FROM `destinations` d
WHERE d.`year` = '2027' AND UPPER(d.`month`) = 'OCT' AND (LOWER(d.`name`) = 'palau' OR d.`name` = '팔라우')
AND NOT EXISTS (SELECT 1 FROM `trip_items` t WHERE t.`id` = 'palau-20271007-ror-tpe');
--> statement-breakpoint
INSERT INTO `trip_items` (`id`, `destination_id`, `category`, `date`, `time`, `title`, `location`, `note`, `sort_order`, `created_at`)
SELECT 'palau-20271007-taiwan-stay', d.`id`, 'stay', '2027-10-07', '', '대만 1박', '타이페이', '10/8 인천 귀국 전 대만 1박. 숙소는 추후 확정.', COALESCE((SELECT MAX(t.`sort_order`) FROM `trip_items` t WHERE t.`destination_id` = d.`id`), -1) + 1, CURRENT_TIMESTAMP
FROM `destinations` d
WHERE d.`year` = '2027' AND UPPER(d.`month`) = 'OCT' AND (LOWER(d.`name`) = 'palau' OR d.`name` = '팔라우')
AND NOT EXISTS (SELECT 1 FROM `trip_items` t WHERE t.`id` = 'palau-20271007-taiwan-stay');
--> statement-breakpoint
INSERT INTO `trip_items` (`id`, `destination_id`, `category`, `date`, `time`, `title`, `location`, `note`, `sort_order`, `created_at`)
SELECT 'palau-20271008-tpe-icn', d.`id`, 'flight', '2027-10-08', '', '타이페이 → 인천', '타이페이 → 인천국제공항', '팔라우 투어 귀국 일정. 항공편/시간은 추후 확정.', COALESCE((SELECT MAX(t.`sort_order`) FROM `trip_items` t WHERE t.`destination_id` = d.`id`), -1) + 1, CURRENT_TIMESTAMP
FROM `destinations` d
WHERE d.`year` = '2027' AND UPPER(d.`month`) = 'OCT' AND (LOWER(d.`name`) = 'palau' OR d.`name` = '팔라우')
AND NOT EXISTS (SELECT 1 FROM `trip_items` t WHERE t.`id` = 'palau-20271008-tpe-icn');