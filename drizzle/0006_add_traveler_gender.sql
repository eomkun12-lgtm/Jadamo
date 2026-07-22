ALTER TABLE `travelers` ADD `gender` text DEFAULT 'unspecified' NOT NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO `trip_items` (
  `id`, `destination_id`, `category`, `date`, `time`, `title`, `location`, `note`, `sort_order`
) VALUES (
  'ishigaki-overview-arrival-20261004', 'ishigaki-2026', 'flight', '2026-10-04', '12:00',
  '이시가키로', 'New Ishigaki Airport', '진에어로 출발해 섬에 도착합니다. 베셀 호텔 체크인 후 첫날은 여유롭게.', 0
);
--> statement-breakpoint
INSERT OR IGNORE INTO `trip_items` (
  `id`, `destination_id`, `category`, `date`, `time`, `title`, `location`, `note`, `sort_order`
) VALUES (
  'ishigaki-overview-diving-20261005', 'ishigaki-2026', 'activity', '2026-10-05', '08:00',
  '바다를 만나는 날', 'Marinchu, Ishigaki', '마린츄와 이시가키의 다이빙 포인트를 만납니다. 날짜별 참여 여부는 함께 정해요.', 0
);
--> statement-breakpoint
INSERT OR IGNORE INTO `trip_items` (
  `id`, `destination_id`, `category`, `date`, `time`, `title`, `location`, `note`, `sort_order`
) VALUES (
  'ishigaki-overview-return-20261008', 'ishigaki-2026', 'flight', '2026-10-08', '11:00',
  '천천히 돌아오기', 'New Ishigaki Airport', '베셀 호텔 체크아웃 후 진에어로 귀국합니다. 마지막 바다까지 눈에 담아두기.', 0
);
--> statement-breakpoint
WITH `ordered_items` AS (
  SELECT
    `id`,
    ROW_NUMBER() OVER (
      ORDER BY CASE WHEN `date` = '' THEN 1 ELSE 0 END, `date`, `time`, `created_at`
    ) - 1 AS `new_order`
  FROM `trip_items`
  WHERE `destination_id` = 'ishigaki-2026'
)
UPDATE `trip_items`
SET `sort_order` = (
  SELECT `new_order` FROM `ordered_items` WHERE `ordered_items`.`id` = `trip_items`.`id`
)
WHERE `destination_id` = 'ishigaki-2026';
