-- Spec 13 (NFR-PERF-001): made-up, realistic amounts of data for EXPLAIN ANALYZE (apps/api/scripts/perf-explain.ts).
-- Only ever run against smartmat_perf. :'hh' is the measured household, :'uid' its user. Everything is fictional.
--
-- The measured household: a busy family over about a year and a half.
--   800 items (names from the ingredient list, so recipe ranking matches), 2000 batches (half used up),
--   12 000 inventory events (1 500 discards), 1 500 purchases with 6 000 lines, 18 monthly budgets,
--   a shopping list with 60 open and 200 ticked lines, 300 remembered barcodes, 3 prices per barcode.
-- Noise: 500 other households with 40 items, 60 batches, 200 events and 40 purchases each, so every query has to
-- find its own household's rows among others (household_id filters and indexes are what is measured).

\set ON_ERROR_STOP on
BEGIN;

-- Measured household ---------------------------------------------------------------------------------------------
INSERT INTO inventory_items (id, household_id, name, category_key, unit, updated_at)
SELECT gen_random_uuid(), :'hh',
       (SELECT name FROM ingredients ORDER BY id OFFSET (i % (SELECT count(*) FROM ingredients)) LIMIT 1)
         || CASE WHEN i > (SELECT count(*) FROM ingredients) THEN ' ' || i ELSE '' END,
       (ARRAY['dairy','meat','fish','fruitVeg','bread','dryGoods'])[1 + i % 6], 'g', now()
  FROM generate_series(1, 800) AS i;

CREATE TEMP TABLE perf_items AS
  SELECT id, row_number() OVER (ORDER BY id) AS n FROM inventory_items WHERE household_id = :'hh';

INSERT INTO inventory_batches (id, household_id, item_id, location_id, quantity_base, initial_quantity_base,
                               expiry_kind, expiry_date, price_ore, purchased_on, updated_at)
SELECT gen_random_uuid(), :'hh', it.id,
       (SELECT id FROM storage_locations WHERE household_id = :'hh' ORDER BY id OFFSET (b % 3) LIMIT 1),
       CASE WHEN b % 2 = 0 THEN 0 ELSE 250 END, 500,
       CASE WHEN b % 5 = 0 THEN NULL WHEN b % 3 = 0 THEN 'use_by'::expiry_kind ELSE 'best_before'::expiry_kind END,
       CASE WHEN b % 5 = 0 THEN NULL ELSE current_date + ((b % 60) - 20) END,
       CASE WHEN b % 4 = 0 THEN NULL ELSE 1000 + b % 5000 END,
       current_date - (b % 500), now()
  FROM generate_series(1, 2000) AS b
  JOIN perf_items it ON it.n = 1 + (b % 800);

CREATE TEMP TABLE perf_batches AS
  SELECT id, item_id, row_number() OVER (ORDER BY id) AS n FROM inventory_batches WHERE household_id = :'hh';

INSERT INTO inventory_events (id, household_id, item_id, batch_id, type, delta_base, actor_id, waste_reason,
                              waste_value_ore, waste_value_basis, created_at)
SELECT gen_random_uuid(), :'hh', pb.item_id, pb.id,
       CASE WHEN e % 8 = 0 THEN 'discard'::inventory_event_type
            WHEN e % 8 IN (1, 2) THEN 'add'::inventory_event_type ELSE 'consume'::inventory_event_type END,
       CASE WHEN e % 8 IN (1, 2) THEN 100 ELSE -25 END, :'uid',
       CASE WHEN e % 8 = 0 THEN (ARRAY['expired','spoiled','leftovers','too_much','other'])[1 + e % 5]::waste_reason END,
       CASE WHEN e % 8 = 0 AND e % 3 <> 0 THEN 500 + e % 3000 END,
       CASE WHEN e % 8 = 0 THEN (CASE WHEN e % 3 = 0 THEN 'unknown' WHEN e % 3 = 1 THEN 'actual' ELSE 'estimated' END)::waste_value_basis END,
       now() - make_interval(hours => e)
  FROM generate_series(1, 12000) AS e
  JOIN perf_batches pb ON pb.n = 1 + (e % 2000);

INSERT INTO purchases (id, household_id, store_name, purchased_on, total_ore, created_by, updated_at)
SELECT gen_random_uuid(), :'hh', (ARRAY['Kiwi','Rema 1000','Extra','Meny'])[1 + p % 4], current_date - (p % 540),
       4 * (2000 + p % 900), :'uid', now()
  FROM generate_series(1, 1500) AS p;

INSERT INTO purchase_lines (id, household_id, purchase_id, position, description, kind, category_key, amount_ore)
SELECT gen_random_uuid(), :'hh', pu.id, l, 'Vare ' || l, 'food', 'dairy', 2000 + (pu.n::int % 900)
  FROM (SELECT id, row_number() OVER (ORDER BY id) AS n FROM purchases WHERE household_id = :'hh') pu
  CROSS JOIN generate_series(0, 3) AS l;

INSERT INTO food_budgets (household_id, valid_from, amount_ore, updated_at)
SELECT :'hh', date_trunc('month', current_date)::date - make_interval(months => m), 800000, now()
  FROM generate_series(0, 17) AS m;

INSERT INTO shopping_list_items (id, household_id, list_id, text, ingredient_id, checked, checked_at, created_by,
                                 updated_at, created_at)
SELECT gen_random_uuid(), :'hh', (SELECT id FROM shopping_lists WHERE household_id = :'hh'),
       ing.name || CASE WHEN s > 60 THEN ' ' || s ELSE '' END,
       CASE WHEN s <= 60 THEN ing.id END, s > 60, CASE WHEN s > 60 THEN now() END, :'uid', now(),
       now() - make_interval(mins => s)
  FROM generate_series(1, 260) AS s
  JOIN LATERAL (SELECT id, name FROM ingredients ORDER BY id OFFSET (s % 60) LIMIT 1) ing ON true;

INSERT INTO household_barcodes (household_id, gtin, name, category_key, unit, item_id, updated_at)
SELECT :'hh', lpad((7038010000000 + g)::text, 13, '0'), 'Strekkodevare ' || g, 'dairy', 'g', it.id, now()
  FROM generate_series(1, 300) AS g
  JOIN perf_items it ON it.n = g;

INSERT INTO price_observations (id, source, gtin, chain_code, chain_name, price_ore, observed_at, fetched_at)
SELECT gen_random_uuid(), 'kassalapp', lpad((7038010000000 + g)::text, 13, '0'), c, initcap(lower(c)),
       1500 + g, now() - make_interval(days => g % 20), now()
  FROM generate_series(1, 300) AS g CROSS JOIN unnest(ARRAY['MENY_NO','SPAR_NO','JOKER_NO']) AS c;

-- Noise: 500 other households ------------------------------------------------------------------------------------
INSERT INTO households (id, name, updated_at)
SELECT gen_random_uuid(), 'Støy ' || h, now() FROM generate_series(1, 500) AS h;
CREATE TEMP TABLE perf_noise AS SELECT id FROM households WHERE name LIKE 'Støy %';

INSERT INTO storage_locations (id, household_id, kind) SELECT gen_random_uuid(), id, 'fridge' FROM perf_noise;
INSERT INTO inventory_items (id, household_id, name, category_key, unit, updated_at)
SELECT gen_random_uuid(), n.id, 'Støyvare ' || i, 'dairy', 'g', now()
  FROM perf_noise n CROSS JOIN generate_series(1, 40) AS i;
INSERT INTO inventory_batches (id, household_id, item_id, location_id, quantity_base, initial_quantity_base,
                               expiry_kind, expiry_date, updated_at)
SELECT gen_random_uuid(), i.household_id, i.id,
       (SELECT id FROM storage_locations s WHERE s.household_id = i.household_id LIMIT 1), 100, 100,
       'best_before', current_date + (abs(hashtext(i.id::text)) % 40) - 10, now()
  FROM inventory_items i JOIN perf_noise n ON n.id = i.household_id
  CROSS JOIN generate_series(1, 2) AS k
 WHERE k = 1 OR abs(hashtext(i.id::text)) % 2 = 0;
INSERT INTO inventory_events (id, household_id, item_id, batch_id, type, delta_base, waste_reason, waste_value_basis,
                              created_at)
SELECT gen_random_uuid(), b.household_id, b.item_id, b.id,
       CASE WHEN k = 1 THEN 'discard'::inventory_event_type ELSE 'consume'::inventory_event_type END, -10,
       CASE WHEN k = 1 THEN 'expired'::waste_reason END, CASE WHEN k = 1 THEN 'unknown'::waste_value_basis END,
       now() - make_interval(days => k * 7)
  FROM inventory_batches b JOIN perf_noise n ON n.id = b.household_id
  CROSS JOIN generate_series(1, 3) AS k;
INSERT INTO purchases (id, household_id, store_name, purchased_on, total_ore, updated_at)
SELECT gen_random_uuid(), n.id, 'Kiwi', current_date - (p * 9), 50000, now()
  FROM perf_noise n CROSS JOIN generate_series(1, 40) AS p;

COMMIT;
ANALYZE;
