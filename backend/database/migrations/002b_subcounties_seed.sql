-- ============================================================
-- ZARODA SMS — Kenya Complete Sub-Counties Seed
-- All 47 counties with their sub-counties
-- Run this AFTER 002_location_migration.sql
-- Usage: psql -U zaroda_app -d zaroda_sms -f 002b_subcounties_seed.sql
-- ============================================================

-- Repair the id counters. These ids are SMALLSERIAL (largest value 32767), and an
-- "ON CONFLICT DO NOTHING" insert still uses up one counter value for every row it skips - so
-- every re-run of the seeds used the counters up, until inserts failed with "reached maximum
-- value of sequence". Set each counter back to the largest id really in use. Safe to repeat.
DO $$
DECLARE
  t text;
  m bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['ke_counties', 'ke_sub_counties', 'ke_zones'] LOOP
    EXECUTE format('SELECT COALESCE(MAX(id), 0) FROM %I', t) INTO m;
    PERFORM setval(pg_get_serial_sequence(t, 'id'), GREATEST(m, 1), m > 0);
  END LOOP;
END $$;

-- Mombasa (001)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Changamwe'),('Jomvu'),('Kisauni'),('Likoni'),('Mvita'),('Nyali')
) s(name) WHERE c.name='Mombasa'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Kwale (002)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Kinango'),('Lungalunga'),('Matuga'),('Msambweni')
) s(name) WHERE c.name='Kwale'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Kilifi (003)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Ganze'),('Kaloleni'),('Kilifi North'),('Kilifi South'),('Magarini'),('Malindi'),('Rabai')
) s(name) WHERE c.name='Kilifi'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Tana River (004)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Bura'),('Galole'),('Garsen')
) s(name) WHERE c.name='Tana River'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Lamu (005)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Lamu East'),('Lamu West')
) s(name) WHERE c.name='Lamu'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Taita-Taveta (006)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Mwatate'),('Tavita'),('Voi'),('Wundanyi')
) s(name) WHERE c.name='Taita-Taveta'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Garissa (007)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Balambala'),('Dadaab'),('Fafi'),('Garissa Township'),('Hulugho'),('Ijara'),('Lagdera')
) s(name) WHERE c.name='Garissa'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Wajir (008)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Eldas'),('Tarbaj'),('Wajir East'),('Wajir North'),('Wajir South'),('Wajir West')
) s(name) WHERE c.name='Wajir'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Mandera (009)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Banissa'),('Lafey'),('Mandera East'),('Mandera North'),('Mandera South'),('Mandera West')
) s(name) WHERE c.name='Mandera'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Marsabit (010)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Laisamis'),('Marsabit North'),('Marsabit South'),('Moyale'),('North Horr'),('Saku'),('Turkana North')
) s(name) WHERE c.name='Marsabit'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Isiolo (011)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Garbatulla'),('Isiolo'),('Merti')
) s(name) WHERE c.name='Isiolo'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Meru (012)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Buuri'),('Igembe Central'),('Igembe North'),('Igembe South'),
  ('Imenti Central'),('Imenti North'),('Imenti South'),('Tigania East'),('Tigania West')
) s(name) WHERE c.name='Meru'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Tharaka-Nithi (013)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Chuka/Igambang''ombe'),('Maara'),('Tharaka North'),('Tharaka South')
) s(name) WHERE c.name='Tharaka-Nithi'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Embu (014)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Manyatta'),('Mbeere North'),('Mbeere South'),('Runyenjes')
) s(name) WHERE c.name='Embu'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Kitui (015)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Kitui Central'),('Kitui East'),('Kitui Rural'),('Kitui South'),('Kitui West'),
  ('Mwingi Central'),('Mwingi North'),('Mwingi West')
) s(name) WHERE c.name='Kitui'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Machakos (016)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Kathiani'),('Machakos Town'),('Masinga'),('Matungulu'),
  ('Mavoko'),('Mwala'),('Yatta')
) s(name) WHERE c.name='Machakos'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Makueni (017)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Kaiti'),('Kibwezi East'),('Kibwezi West'),('Kilome'),('Makueni'),('Mbooni')
) s(name) WHERE c.name='Makueni'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Nyandarua (018)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Kinangop'),('Kipipiri'),('Ndaragwa'),('Ol Kalou'),('Ol Joro Orok')
) s(name) WHERE c.name='Nyandarua'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Nyeri (019)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Kieni East'),('Kieni West'),('Mathira East'),('Mathira West'),
  ('Mukurweini'),('Nyeri Town'),('Othaya'),('Tetu')
) s(name) WHERE c.name='Nyeri'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Kirinyaga (020)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Gichugu'),('Kirinyaga Central'),('Mwea East'),('Mwea West'),('Ndia')
) s(name) WHERE c.name='Kirinyaga'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Murang'a (021)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Gatanga'),('Kahuro'),('Kandara'),('Kangema'),('Kigumo'),('Kiharu'),('Mathioya'),('Murang''a South')
) s(name) WHERE c.name='Murang''a'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Kiambu (022)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Gatundu North'),('Gatundu South'),('Githunguri'),('Juja'),('Kabete'),
  ('Kiambaa'),('Kiambu'),('Kikuyu'),('Lari'),('Limuru'),('Ruiru'),('Thika Town')
) s(name) WHERE c.name='Kiambu'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Turkana (023)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Kibish'),('Loima'),('Turkana Central'),('Turkana East'),('Turkana North'),('Turkana South'),('Turkana West')
) s(name) WHERE c.name='Turkana'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- West Pokot (024)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Kacheliba'),('Kapenguria'),('Pokot South'),('West Pokot')
) s(name) WHERE c.name='West Pokot'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Samburu (025)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Samburu East'),('Samburu North'),('Samburu West')
) s(name) WHERE c.name='Samburu'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Trans-Nzoia (026)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Cherangany'),('Endebess'),('Kiminini'),('Kwanza'),('Trans-Nzoia East'),('Trans-Nzoia West')
) s(name) WHERE c.name='Trans-Nzoia'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Uasin Gishu (027)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Ainabkoi'),('Kapseret'),('Kesses'),('Moiben'),('Soy'),('Turbo')
) s(name) WHERE c.name='Uasin Gishu'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Elgeyo-Marakwet (028)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Keiyo North'),('Keiyo South'),('Marakwet East'),('Marakwet West')
) s(name) WHERE c.name='Elgeyo-Marakwet'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Nandi (029)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Aldai'),('Chesumei'),('Emgwen'),('Mosop'),('Nandi Hills'),('Tindiret')
) s(name) WHERE c.name='Nandi'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Baringo (030)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Baringo Central'),('Baringo North'),('Baringo South'),('Eldama Ravine'),('Mogotio'),('Tiaty')
) s(name) WHERE c.name='Baringo'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Laikipia (031)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Laikipia Central'),('Laikipia East'),('Laikipia North'),('Laikipia West'),('Nyahururu')
) s(name) WHERE c.name='Laikipia'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Nakuru (032)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Bahati'),('Gilgil'),('Kuresoi North'),('Kuresoi South'),('Molo'),
  ('Naivasha'),('Nakuru Town East'),('Nakuru Town West'),('Njoro'),('Rongai'),('Subukia')
) s(name) WHERE c.name='Nakuru'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Narok (033)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Narok East'),('Narok North'),('Narok South'),('Narok West'),('Trans Mara East'),('Trans Mara West')
) s(name) WHERE c.name='Narok'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Kajiado (034)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Isinya'),('Kajiado Central'),('Kajiado East'),('Kajiado North'),('Kajiado West'),('Loitokitok'),('Mashuuru')
) s(name) WHERE c.name='Kajiado'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Kericho (035)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Ainamoi'),('Belgut'),('Bureti'),('Kipkelion East'),('Kipkelion West'),('Soin/Sigowet')
) s(name) WHERE c.name='Kericho'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Bomet (036)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Bomet Central'),('Bomet East'),('Chepalungu'),('Konoin'),('Sotik')
) s(name) WHERE c.name='Bomet'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Kakamega (037)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Butere'),('Ikolomani'),('Khwisero'),('Likuyani'),('Lugari'),('Lurambi'),
  ('Malava'),('Matungu'),('Mumias East'),('Mumias West'),('Navakholo'),('Shinyalu')
) s(name) WHERE c.name='Kakamega'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Vihiga (038)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Emuhaya'),('Hamisi'),('Luanda'),('Sabatia'),('Vihiga')
) s(name) WHERE c.name='Vihiga'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Bungoma (039)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Bumula'),('Kabuchai'),('Kanduyi'),('Kimilili'),('Mt Elgon'),
  ('Sirisia'),('Tongaren'),('Webuye East'),('Webuye West')
) s(name) WHERE c.name='Bungoma'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Busia (040)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Budalangi'),('Butula'),('Funyula'),('Nambale'),('Teso North'),('Teso South')
) s(name) WHERE c.name='Busia'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Siaya (041)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Alego Usonga'),('Bondo'),('Gem'),('Rarieda'),('Ugenya'),('Ugunja')
) s(name) WHERE c.name='Siaya'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Kisumu (042)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Kisumu Central'),('Kisumu East'),('Kisumu West'),('Muhoroni'),('Nyakach'),('Nyando'),('Seme')
) s(name) WHERE c.name='Kisumu'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Homa Bay (043)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Homabay Town'),('Kabondo Kasipul'),('Karachuonyo'),('Kasipul'),
  ('Mbita'),('Ndhiwa'),('Rangwe'),('Suba North'),('Suba South')
) s(name) WHERE c.name='Homa Bay'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Migori (044)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Awendo'),('Kuria East'),('Kuria West'),('Mabera'),('Nyatike'),
  ('Rongo'),('Suna East'),('Suna West'),('Uriri')
) s(name) WHERE c.name='Migori'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Kisii (045)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Bomachoge Borabu'),('Bomachoge Chache'),('Bobasi'),('Bonchari'),
  ('Kitutu Chache North'),('Kitutu Chache South'),('Nyaribari Chache'),
  ('Nyaribari Masaba'),('South Mugirango')
) s(name) WHERE c.name='Kisii'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Nyamira (046)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Borabu'),('Manga'),('Masaba North'),('Nyamira North'),('Nyamira South')
) s(name) WHERE c.name='Nyamira'
  AND NOT EXISTS (SELECT 1 FROM ke_sub_counties x WHERE x.county_id = c.id AND x.name = s.name);

-- Nairobi (047) — already seeded, skip
-- (Westlands, Dagoretti, Langata etc already in 002_location_migration.sql)

-- ── Verify ────────────────────────────────────────────────
SELECT c.name AS county, COUNT(sc.id) AS sub_counties
FROM ke_counties c
LEFT JOIN ke_sub_counties sc ON sc.county_id = c.id
GROUP BY c.name
ORDER BY c.name;
