-- MySQL: เพิ่มคอลัมน์เก็บ JSON การตั้งค่า Dashboard สรุปผลการแข่งขัน
-- รันครั้งเดียวต่อ DB (ถ้ามีคอลัมน์แล้วจะ error — ให้ข้ามบรรทัด ALTER)
--
-- mysql -u ... -p your_database < api/scripts/add-activities-competition-dashboard-json.sql

ALTER TABLE `activities`
  ADD COLUMN `competition_dashboard_json` TEXT NULL
  COMMENT 'JSON: config สรุปผลแข่งขัน (แชมป์ + อันดับต่อคลาส)'
  AFTER `live_embeds_json`;
