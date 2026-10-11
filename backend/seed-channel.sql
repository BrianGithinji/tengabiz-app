INSERT INTO channels (id, user_id, type, identifier, label, active)
SELECT
  'seed-daraja-sandbox-174379',
  '<REPLACE_WITH_USER_ID>',
  'paybill',
  '174379',
  'Daraja sandbox shortcode',
  TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM channels
  WHERE type = 'paybill'
    AND identifier = '174379'
);
