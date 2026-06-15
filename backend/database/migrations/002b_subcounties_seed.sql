-- ============================================================
-- ZARODA SMS — Kenya Complete Sub-Counties Seed
-- All 47 counties with their sub-counties
-- Run this AFTER 002_location_migration.sql
-- Usage: psql -U zaroda_app -d zaroda_sms -f 002b_subcounties_seed.sql
-- ============================================================

-- Mombasa (001)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Changamwe'),('Jomvu'),('Kisauni'),('Likoni'),('Mvita'),('Nyali')
) s(name) WHERE c.name='Mombasa' ON CONFLICT DO NOTHING;

-- Kwale (002)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Kinango'),('Lungalunga'),('Matuga'),('Msambweni')
) s(name) WHERE c.name='Kwale' ON CONFLICT DO NOTHING;

-- Kilifi (003)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Ganze'),('Kaloleni'),('Kilifi North'),('Kilifi South'),('Magarini'),('Malindi'),('Rabai')
) s(name) WHERE c.name='Kilifi' ON CONFLICT DO NOTHING;

-- Tana River (004)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Bura'),('Galole'),('Garsen')
) s(name) WHERE c.name='Tana River' ON CONFLICT DO NOTHING;

-- Lamu (005)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Lamu East'),('Lamu West')
) s(name) WHERE c.name='Lamu' ON CONFLICT DO NOTHING;

-- Taita-Taveta (006)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Mwatate'),('Tavita'),('Voi'),('Wundanyi')
) s(name) WHERE c.name='Taita-Taveta' ON CONFLICT DO NOTHING;

-- Garissa (007)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Balambala'),('Dadaab'),('Fafi'),('Garissa Township'),('Hulugho'),('Ijara'),('Lagdera')
) s(name) WHERE c.name='Garissa' ON CONFLICT DO NOTHING;

-- Wajir (008)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Eldas'),('Tarbaj'),('Wajir East'),('Wajir North'),('Wajir South'),('Wajir West')
) s(name) WHERE c.name='Wajir' ON CONFLICT DO NOTHING;

-- Mandera (009)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Banissa'),('Lafey'),('Mandera East'),('Mandera North'),('Mandera South'),('Mandera West')
) s(name) WHERE c.name='Mandera' ON CONFLICT DO NOTHING;

-- Marsabit (010)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Laisamis'),('Marsabit North'),('Marsabit South'),('Moyale'),('North Horr'),('Saku'),('Turkana North')
) s(name) WHERE c.name='Marsabit' ON CONFLICT DO NOTHING;

-- Isiolo (011)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Garbatulla'),('Isiolo'),('Merti')
) s(name) WHERE c.name='Isiolo' ON CONFLICT DO NOTHING;

-- Meru (012)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Buuri'),('Igembe Central'),('Igembe North'),('Igembe South'),
  ('Imenti Central'),('Imenti North'),('Imenti South'),('Tigania East'),('Tigania West')
) s(name) WHERE c.name='Meru' ON CONFLICT DO NOTHING;

-- Tharaka-Nithi (013)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Chuka/Igambang''ombe'),('Maara'),('Tharaka North'),('Tharaka South')
) s(name) WHERE c.name='Tharaka-Nithi' ON CONFLICT DO NOTHING;

-- Embu (014)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Manyatta'),('Mbeere North'),('Mbeere South'),('Runyenjes')
) s(name) WHERE c.name='Embu' ON CONFLICT DO NOTHING;

-- Kitui (015)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Kitui Central'),('Kitui East'),('Kitui Rural'),('Kitui South'),('Kitui West'),
  ('Mwingi Central'),('Mwingi North'),('Mwingi West')
) s(name) WHERE c.name='Kitui' ON CONFLICT DO NOTHING;

-- Machakos (016)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Kathiani'),('Machakos Town'),('Masinga'),('Matungulu'),
  ('Mavoko'),('Mwala'),('Yatta')
) s(name) WHERE c.name='Machakos' ON CONFLICT DO NOTHING;

-- Makueni (017)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Kaiti'),('Kibwezi East'),('Kibwezi West'),('Kilome'),('Makueni'),('Mbooni')
) s(name) WHERE c.name='Makueni' ON CONFLICT DO NOTHING;

-- Nyandarua (018)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Kinangop'),('Kipipiri'),('Ndaragwa'),('Ol Kalou'),('Ol Joro Orok')
) s(name) WHERE c.name='Nyandarua' ON CONFLICT DO NOTHING;

-- Nyeri (019)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Kieni East'),('Kieni West'),('Mathira East'),('Mathira West'),
  ('Mukurweini'),('Nyeri Town'),('Othaya'),('Tetu')
) s(name) WHERE c.name='Nyeri' ON CONFLICT DO NOTHING;

-- Kirinyaga (020)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Gichugu'),('Kirinyaga Central'),('Mwea East'),('Mwea West'),('Ndia')
) s(name) WHERE c.name='Kirinyaga' ON CONFLICT DO NOTHING;

-- Murang'a (021)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Gatanga'),('Kahuro'),('Kandara'),('Kangema'),('Kigumo'),('Kiharu'),('Mathioya'),('Murang''a South')
) s(name) WHERE c.name='Murang''a' ON CONFLICT DO NOTHING;

-- Kiambu (022)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Gatundu North'),('Gatundu South'),('Githunguri'),('Juja'),('Kabete'),
  ('Kiambaa'),('Kiambu'),('Kikuyu'),('Lari'),('Limuru'),('Ruiru'),('Thika Town')
) s(name) WHERE c.name='Kiambu' ON CONFLICT DO NOTHING;

-- Turkana (023)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Kibish'),('Loima'),('Turkana Central'),('Turkana East'),('Turkana North'),('Turkana South'),('Turkana West')
) s(name) WHERE c.name='Turkana' ON CONFLICT DO NOTHING;

-- West Pokot (024)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Kacheliba'),('Kapenguria'),('Pokot South'),('West Pokot')
) s(name) WHERE c.name='West Pokot' ON CONFLICT DO NOTHING;

-- Samburu (025)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Samburu East'),('Samburu North'),('Samburu West')
) s(name) WHERE c.name='Samburu' ON CONFLICT DO NOTHING;

-- Trans-Nzoia (026)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Cherangany'),('Endebess'),('Kiminini'),('Kwanza'),('Trans-Nzoia East'),('Trans-Nzoia West')
) s(name) WHERE c.name='Trans-Nzoia' ON CONFLICT DO NOTHING;

-- Uasin Gishu (027)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Ainabkoi'),('Kapseret'),('Kesses'),('Moiben'),('Soy'),('Turbo')
) s(name) WHERE c.name='Uasin Gishu' ON CONFLICT DO NOTHING;

-- Elgeyo-Marakwet (028)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Keiyo North'),('Keiyo South'),('Marakwet East'),('Marakwet West')
) s(name) WHERE c.name='Elgeyo-Marakwet' ON CONFLICT DO NOTHING;

-- Nandi (029)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Aldai'),('Chesumei'),('Emgwen'),('Mosop'),('Nandi Hills'),('Tindiret')
) s(name) WHERE c.name='Nandi' ON CONFLICT DO NOTHING;

-- Baringo (030)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Baringo Central'),('Baringo North'),('Baringo South'),('Eldama Ravine'),('Mogotio'),('Tiaty')
) s(name) WHERE c.name='Baringo' ON CONFLICT DO NOTHING;

-- Laikipia (031)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Laikipia Central'),('Laikipia East'),('Laikipia North'),('Laikipia West'),('Nyahururu')
) s(name) WHERE c.name='Laikipia' ON CONFLICT DO NOTHING;

-- Nakuru (032)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Bahati'),('Gilgil'),('Kuresoi North'),('Kuresoi South'),('Molo'),
  ('Naivasha'),('Nakuru Town East'),('Nakuru Town West'),('Njoro'),('Rongai'),('Subukia')
) s(name) WHERE c.name='Nakuru' ON CONFLICT DO NOTHING;

-- Narok (033)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Narok East'),('Narok North'),('Narok South'),('Narok West'),('Trans Mara East'),('Trans Mara West')
) s(name) WHERE c.name='Narok' ON CONFLICT DO NOTHING;

-- Kajiado (034)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Isinya'),('Kajiado Central'),('Kajiado East'),('Kajiado North'),('Kajiado West'),('Loitokitok'),('Mashuuru')
) s(name) WHERE c.name='Kajiado' ON CONFLICT DO NOTHING;

-- Kericho (035)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Ainamoi'),('Belgut'),('Bureti'),('Kipkelion East'),('Kipkelion West'),('Soin/Sigowet')
) s(name) WHERE c.name='Kericho' ON CONFLICT DO NOTHING;

-- Bomet (036)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Bomet Central'),('Bomet East'),('Chepalungu'),('Konoin'),('Sotik')
) s(name) WHERE c.name='Bomet' ON CONFLICT DO NOTHING;

-- Kakamega (037)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Butere'),('Ikolomani'),('Khwisero'),('Likuyani'),('Lugari'),('Lurambi'),
  ('Malava'),('Matungu'),('Mumias East'),('Mumias West'),('Navakholo'),('Shinyalu')
) s(name) WHERE c.name='Kakamega' ON CONFLICT DO NOTHING;

-- Vihiga (038)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Emuhaya'),('Hamisi'),('Luanda'),('Sabatia'),('Vihiga')
) s(name) WHERE c.name='Vihiga' ON CONFLICT DO NOTHING;

-- Bungoma (039)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Bumula'),('Kabuchai'),('Kanduyi'),('Kimilili'),('Mt Elgon'),
  ('Sirisia'),('Tongaren'),('Webuye East'),('Webuye West')
) s(name) WHERE c.name='Bungoma' ON CONFLICT DO NOTHING;

-- Busia (040)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Budalangi'),('Butula'),('Funyula'),('Nambale'),('Teso North'),('Teso South')
) s(name) WHERE c.name='Busia' ON CONFLICT DO NOTHING;

-- Siaya (041)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Alego Usonga'),('Bondo'),('Gem'),('Rarieda'),('Ugenya'),('Ugunja')
) s(name) WHERE c.name='Siaya' ON CONFLICT DO NOTHING;

-- Kisumu (042)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Kisumu Central'),('Kisumu East'),('Kisumu West'),('Muhoroni'),('Nyakach'),('Nyando'),('Seme')
) s(name) WHERE c.name='Kisumu' ON CONFLICT DO NOTHING;

-- Homa Bay (043)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Homabay Town'),('Kabondo Kasipul'),('Karachuonyo'),('Kasipul'),
  ('Mbita'),('Ndhiwa'),('Rangwe'),('Suba North'),('Suba South')
) s(name) WHERE c.name='Homa Bay' ON CONFLICT DO NOTHING;

-- Migori (044)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Awendo'),('Kuria East'),('Kuria West'),('Mabera'),('Nyatike'),
  ('Rongo'),('Suna East'),('Suna West'),('Uriri')
) s(name) WHERE c.name='Migori' ON CONFLICT DO NOTHING;

-- Kisii (045)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Bomachoge Borabu'),('Bomachoge Chache'),('Bobasi'),('Bonchari'),
  ('Kitutu Chache North'),('Kitutu Chache South'),('Nyaribari Chache'),
  ('Nyaribari Masaba'),('South Mugirango')
) s(name) WHERE c.name='Kisii' ON CONFLICT DO NOTHING;

-- Nyamira (046)
INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, s.name FROM ke_counties c, (VALUES
  ('Borabu'),('Manga'),('Masaba North'),('Nyamira North'),('Nyamira South')
) s(name) WHERE c.name='Nyamira' ON CONFLICT DO NOTHING;

-- Nairobi (047) — already seeded, skip
-- (Westlands, Dagoretti, Langata etc already in 002_location_migration.sql)

-- ── Verify ────────────────────────────────────────────────
SELECT c.name AS county, COUNT(sc.id) AS sub_counties
FROM ke_counties c
LEFT JOIN ke_sub_counties sc ON sc.county_id = c.id
GROUP BY c.name
ORDER BY c.name;
