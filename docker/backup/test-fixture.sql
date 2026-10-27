-- Made-up data for docker/backup/test-backup.sh (spec 13 NFR-OPS-002). Nobody here is a real person, and the
-- "receipt" is a few made-up bytes and a made-up line of text that must never appear in a backup.
BEGIN;
INSERT INTO households (id, name, updated_at) VALUES
  ('0199f0a0-0000-7000-8000-000000000001', 'Testhusholdning', now());
INSERT INTO users (id, email, password_hash, display_name, updated_at, active_household_id) VALUES
  ('0199f0a0-0000-7000-8000-000000000011', 'kari@example.test', '$argon2id$v=19$m=19456,t=2,p=1$fiktiv$fiktiv',
   'Kari Testesen', now(), '0199f0a0-0000-7000-8000-000000000001');
INSERT INTO household_members (household_id, user_id, role) VALUES
  ('0199f0a0-0000-7000-8000-000000000001', '0199f0a0-0000-7000-8000-000000000011', 'owner');
INSERT INTO sessions (id, token_hash, user_id, csrf_token, expires_at, browser, os) VALUES
  ('0199f0a0-0000-7000-8000-000000000021', repeat('a', 64), '0199f0a0-0000-7000-8000-000000000011', 'csrf',
   now() + interval '14 days', 'firefox', 'linux');
INSERT INTO storage_locations (id, household_id, kind) VALUES
  ('0199f0a0-0000-7000-8000-000000000031', '0199f0a0-0000-7000-8000-000000000001', 'fridge');
INSERT INTO inventory_items (id, household_id, name, category_key, unit, updated_at)
SELECT ('0199f0a0-0000-7000-8000-' || lpad(to_hex(4096 + i), 12, '0'))::uuid,
       '0199f0a0-0000-7000-8000-000000000001', 'Testvare ' || i || ' æøå', 'dairy', 'ml', now()
  FROM generate_series(1, 300) AS i;
INSERT INTO inventory_batches (id, household_id, item_id, location_id, quantity_base, initial_quantity_base,
                               expiry_kind, expiry_date, price_ore, updated_at)
SELECT ('0199f0a0-0000-7000-8000-' || lpad(to_hex(65536 + i), 12, '0'))::uuid,
       '0199f0a0-0000-7000-8000-000000000001',
       ('0199f0a0-0000-7000-8000-' || lpad(to_hex(4096 + i), 12, '0'))::uuid,
       '0199f0a0-0000-7000-8000-000000000031', 500, 1000, 'best_before', date '2026-11-01' + i, 2490, now()
  FROM generate_series(1, 300) AS i;
INSERT INTO inventory_events (id, household_id, item_id, batch_id, type, delta_base, actor_id)
SELECT gen_random_uuid(), '0199f0a0-0000-7000-8000-000000000001',
       ('0199f0a0-0000-7000-8000-' || lpad(to_hex(4096 + (i % 300) + 1), 12, '0'))::uuid,
       ('0199f0a0-0000-7000-8000-' || lpad(to_hex(65536 + (i % 300) + 1), 12, '0'))::uuid,
       'consume', -1, '0199f0a0-0000-7000-8000-000000000011'
  FROM generate_series(1, 3000) AS i;
INSERT INTO purchases (id, household_id, store_name, purchased_on, total_ore, created_by, updated_at)
SELECT gen_random_uuid(), '0199f0a0-0000-7000-8000-000000000001', 'Testbutikk', date '2026-01-01' + (i % 300),
       i * 100, '0199f0a0-0000-7000-8000-000000000011', now()
  FROM generate_series(1, 500) AS i;
INSERT INTO receipts (id, household_id, status, delete_after, uploaded_by, image_sha256, updated_at) VALUES
  ('0199f0a0-0000-7000-8000-000000000041', '0199f0a0-0000-7000-8000-000000000001', 'review',
   now() + interval '7 days', '0199f0a0-0000-7000-8000-000000000011', repeat('b', 64), now());
INSERT INTO receipt_images (receipt_id, household_id, bytes, width, height) VALUES
  ('0199f0a0-0000-7000-8000-000000000041', '0199f0a0-0000-7000-8000-000000000001',
   convert_to('KVITTERINGSBILDE-SOM-ALDRI-SKAL-I-BACKUP', 'UTF8'), 10, 10);
INSERT INTO receipt_extractions (receipt_id, household_id, engine, raw_text, parsed, mean_confidence, duration_ms)
VALUES ('0199f0a0-0000-7000-8000-000000000041', '0199f0a0-0000-7000-8000-000000000001', 'fake',
        'OCR-TEKST-SOM-ALDRI-SKAL-I-BACKUP', '{}', 90, 1);
COMMIT;
