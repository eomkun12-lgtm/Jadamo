INSERT OR IGNORE INTO `destinations` (
  `id`, `name`, `region`, `country`, `country_code`,
  `latitude`, `longitude`, `month`, `year`
) VALUES (
  'ishigaki-2026', 'Ishigaki', 'Okinawa, Japan', '일본', 'jp',
  24.34, 124.15, 'OCT', '2026'
);
--> statement-breakpoint
INSERT OR IGNORE INTO `trip_items` (
  `id`, `destination_id`, `category`, `date`, `time`, `title`, `location`, `note`
) VALUES (
  'ishigaki-euglena-20261005', 'ishigaki-2026', 'activity', '2026-10-05', '18:00',
  '유글레나몰 근처 투어', 'Euglena Mall, Ishigaki', ''
);
--> statement-breakpoint
INSERT OR IGNORE INTO `trip_items` (
  `id`, `destination_id`, `category`, `date`, `time`, `title`, `location`, `note`
) VALUES (
  'ishigaki-ushinoya-20261006', 'ishigaki-2026', 'food', '2026-10-06', '19:00',
  '牛の家', '2 Chome-3-10 Hamasakicho, Ishigaki', '저녁 식사 예약'
);
--> statement-breakpoint
INSERT OR IGNORE INTO `trip_items` (
  `id`, `destination_id`, `category`, `date`, `time`, `title`, `location`, `note`
) VALUES (
  'ishigaki-yaima-20261007', 'ishigaki-2026', 'activity', '2026-10-07', '15:00',
  '이시가키 야이마무라 투어', 'Ishigaki Yaima Village', ''
);
