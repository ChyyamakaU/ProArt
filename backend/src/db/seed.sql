-- ============================================================================
-- SkillVerify Abuja Artisan & User Account Seed Data (Idempotent)
-- ============================================================================
-- Seeded Test Credentials (Local/Staging Development ONLY — DO NOT use in prod):
--   Password for all seeded accounts: SkillVerify2026!
--   Bcrypt cost-12 hash: $2b$12$ZqUNUax7hNpQU/1BE2fuH.M9.E0CQl8tUGzQ02OxpUiwlQfyuGBWi
--
--   Admin Account:
--     Phone: 08000000001  (normalized: 2348000000001) | Role: admin
--
--   Worker Accounts:
--     1. Chinedu Okafor (Electrician, Wuse II)    -> 08034128891 (2348034128891)
--     2. Musa Ibrahim (Plumber, Gwarinpa)         -> 08097723410 (2348097723410)
--     3. Aisha Danladi (Tailor, Garki II)         -> 08125549082 (2348125549082)
--     4. Emeka Nwosu (AC Technician, Maitama)     -> 07063319204 (2347063319204)
--     5. Yusuf Abdullahi (Solar, Jabi)            -> 08058821147 (2348058821147)
--     6. Grace Ojo (Painter, Asokoro)             -> 08169043321 (2348169043321)
--     7. Suleiman Bello (Carpenter, Kubwa)        -> 08026194503 (2348026194503)
--     8. Tunde Adeyemi (Auto Mechanic, Utako)     -> 09034417785 (2349034417785)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Seed Users (Idempotent via UNIQUE phone)
-- ----------------------------------------------------------------------------
INSERT INTO users (phone, password_hash, role)
VALUES
  ('2348000000001', '$2b$12$ZqUNUax7hNpQU/1BE2fuH.M9.E0CQl8tUGzQ02OxpUiwlQfyuGBWi', 'admin'),
  ('2348034128891', '$2b$12$ZqUNUax7hNpQU/1BE2fuH.M9.E0CQl8tUGzQ02OxpUiwlQfyuGBWi', 'worker'),
  ('2348097723410', '$2b$12$ZqUNUax7hNpQU/1BE2fuH.M9.E0CQl8tUGzQ02OxpUiwlQfyuGBWi', 'worker'),
  ('2348125549082', '$2b$12$ZqUNUax7hNpQU/1BE2fuH.M9.E0CQl8tUGzQ02OxpUiwlQfyuGBWi', 'worker'),
  ('2347063319204', '$2b$12$ZqUNUax7hNpQU/1BE2fuH.M9.E0CQl8tUGzQ02OxpUiwlQfyuGBWi', 'worker'),
  ('2348058821147', '$2b$12$ZqUNUax7hNpQU/1BE2fuH.M9.E0CQl8tUGzQ02OxpUiwlQfyuGBWi', 'worker'),
  ('2348169043321', '$2b$12$ZqUNUax7hNpQU/1BE2fuH.M9.E0CQl8tUGzQ02OxpUiwlQfyuGBWi', 'worker'),
  ('2348026194503', '$2b$12$ZqUNUax7hNpQU/1BE2fuH.M9.E0CQl8tUGzQ02OxpUiwlQfyuGBWi', 'worker'),
  ('2349034417785', '$2b$12$ZqUNUax7hNpQU/1BE2fuH.M9.E0CQl8tUGzQ02OxpUiwlQfyuGBWi', 'worker')
ON CONFLICT (phone) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Seed Abuja Artisan Profiles Linked to Seeded Users (Idempotent)
-- ----------------------------------------------------------------------------
INSERT INTO workers (
  user_id,
  slug,
  full_name,
  trade,
  location,
  phone,
  bio,
  years_experience,
  guild_endorsement,
  instagram_handle,
  avatar_url,
  is_verified
)
SELECT
  u.id,
  v.slug,
  v.full_name,
  v.trade,
  v.location,
  v.phone,
  v.bio,
  v.years_experience,
  v.guild_endorsement,
  v.instagram_handle,
  v.avatar_url,
  v.is_verified
FROM (
  VALUES
    (
      'chinedu-okafor-electrician-abj01',
      'Chinedu Okafor',
      'Electrician',
      'Wuse II, Abuja',
      '2348034128891',
      'Certified residential and commercial electrician specializing in 3-phase distribution boards, inverter changeover wiring, and earthing diagnostics across Abuja.',
      9,
      'Licensed Electrical Contractors Association of Nigeria (LECAN - FCT)',
      '@chinedu_electricals_abj',
      '/uploads/seed-avatar-chinedu.jpg',
      TRUE
    ),
    (
      'musa-ibrahim-plumber-abj02',
      'Musa Ibrahim',
      'Plumber',
      'Gwarinpa, Abuja',
      '2348097723410',
      'Experienced plumbing technician handling borehole overhead tank reticulation, concealed bathroom fittings, pressure pump installations, and urgent leak repairs.',
      7,
      'Abuja Master Plumbers & Pipefitters Guild (Gwarinpa Chapter)',
      '@musa_plumbing_fct',
      '/uploads/seed-avatar-musa.jpg',
      TRUE
    ),
    (
      'aisha-danladi-tailor-abj03',
      'Aisha Danladi',
      'Tailor & Fashion Designer',
      'Garki II, Abuja',
      '2348125549082',
      'Bespoke native and corporate attire specialist crafting fitted kaftans, Senator wear, and bridal aso-ebi with reliable turnaround times.',
      8,
      'Fashion Designers Association of Nigeria (FADAN - Abuja)',
      '@aisha_bespoke_abuja',
      '/uploads/seed-avatar-aisha.jpg',
      TRUE
    ),
    (
      'emeka-nwosu-ac-technician-abj04',
      'Emeka Nwosu',
      'AC & Refrigeration Technician',
      'Maitama, Abuja',
      '2347063319204',
      'HVAC technician experienced in split-unit and standing AC installations, inverter compressor troubleshooting, copper pipe brazing, and preventative servicing.',
      6,
      'Nigeria Association of Refrigeration & Air-Conditioning Practitioners (NARAP)',
      '@emeka_coolair_abj',
      '/uploads/seed-avatar-emeka.jpg',
      TRUE
    ),
    (
      'yusuf-abdullahi-solar-installer-abj05',
      'Yusuf Abdullahi',
      'Solar & Inverter Technician',
      'Jabi, Abuja',
      '2348058821147',
      'Designs and installs hybrid solar power systems, lithium battery banks, and surge-protected rooftop arrays for homes and small offices in FCT.',
      5,
      'Renewable Energy Association of Nigeria (REAN Certified Installer)',
      '@yusuf_solar_abuja',
      '/uploads/seed-avatar-yusuf.jpg',
      TRUE
    ),
    (
      'grace-ojo-painter-abj06',
      'Grace Ojo',
      'Interior & Exterior Painter',
      'Asokoro, Abuja',
      '2348169043321',
      'Detail-oriented finishing specialist delivering smooth screeding, Venetian plaster accents, damp-seal exterior coatings, and neat post-job cleanup.',
      6,
      'FCT Building Finishers & Decorative Painters Guild',
      '@grace_finishes_abj',
      '/uploads/seed-avatar-grace.jpg',
      TRUE
    ),
    (
      'suleiman-bello-carpenter-abj07',
      'Suleiman Bello',
      'Carpenter & Furniture Maker',
      'Kubwa, Abuja',
      '2348026194503',
      'Custom kitchen cabinetry, HDF wardrobes, solid-wood security doors, and precision office furniture built to exact room measurements.',
      11,
      'Abuja Woodworkers & Cabinet Makers Association (Kubwa Zone)',
      '@suleiman_woodcraft_abj',
      '/uploads/seed-avatar-suleiman.jpg',
      TRUE
    ),
    (
      'tunde-adeyemi-auto-mechanic-abj08',
      'Tunde Adeyemi',
      'Auto Mechanic',
      'Utako, Abuja',
      '2349034417785',
      'OBD-II diagnostic and mechanical repair specialist for Toyota, Honda, Lexus, and Mercedes vehicles with transparent parts sourcing.',
      10,
      'Nigerian Automobile Technicians Association (NATA - Utako Mechanic Village)',
      '@tunde_autodiag_abj',
      '/uploads/seed-avatar-tunde.jpg',
      TRUE
    )
) AS v(
  slug,
  full_name,
  trade,
  location,
  phone,
  bio,
  years_experience,
  guild_endorsement,
  instagram_handle,
  avatar_url,
  is_verified
)
JOIN users u ON u.phone = v.phone
ON CONFLICT (slug) DO UPDATE
SET
  user_id = COALESCE(workers.user_id, EXCLUDED.user_id),
  guild_endorsement = COALESCE(workers.guild_endorsement, EXCLUDED.guild_endorsement),
  instagram_handle = COALESCE(workers.instagram_handle, EXCLUDED.instagram_handle),
  avatar_url = COALESCE(workers.avatar_url, EXCLUDED.avatar_url);

-- ----------------------------------------------------------------------------
-- 3. Seed Verified Work Samples (Idempotent via unique (worker_id, image_url))
-- ----------------------------------------------------------------------------
INSERT INTO work_samples (worker_id, image_url, caption)
SELECT w.id, s.image_url, s.caption
FROM (
  VALUES
    (
      'chinedu-okafor-electrician-abj01',
      '/uploads/seed-wuse-db-panel.jpg',
      'Clean 12-way ABB distribution board rewire and surge protector setup in Wuse II.'
    ),
    (
      'chinedu-okafor-electrician-abj01',
      '/uploads/seed-wuse-chandelier.jpg',
      'Living room concealed LED cove lighting and smart dimmer installation.'
    ),
    (
      'musa-ibrahim-plumber-abj02',
      '/uploads/seed-gwarinpa-bathroom.jpg',
      'Master bathroom concealed mixer shower and wall-hung WC installation in Gwarinpa.'
    ),
    (
      'aisha-danladi-tailor-abj03',
      '/uploads/seed-garki-kaftan.jpg',
      'Hand-embroidered ceremonial kaftan finished for a weekend wedding in Maitama.'
    ),
    (
      'emeka-nwosu-ac-technician-abj04',
      '/uploads/seed-maitama-hvac.jpg',
      'Dual 2HP inverter split-unit AC installation with insulated copper trunking.'
    ),
    (
      'yusuf-abdullahi-solar-installer-abj05',
      '/uploads/seed-jabi-solar-array.jpg',
      '5kVA hybrid inverter with 10kWh LiFePO4 battery rack and 8x 550W panels in Jabi.'
    ),
    (
      'grace-ojo-painter-abj06',
      '/uploads/seed-asokoro-venetian.jpg',
      'Satin pearl Venetian plaster accent wall and damp-proof exterior coat in Asokoro.'
    ),
    (
      'suleiman-bello-carpenter-abj07',
      '/uploads/seed-kubwa-kitchen.jpg',
      'Matte grey waterproof HDF modular kitchen cabinets with soft-close hinges.'
    ),
    (
      'tunde-adeyemi-auto-mechanic-abj08',
      '/uploads/seed-utako-diagnostics.jpg',
      'Complete timing belt replacement and computer ECU scan on a 2019 Toyota Camry.'
    )
) AS s(worker_slug, image_url, caption)
JOIN workers w ON w.slug = s.worker_slug
ON CONFLICT (worker_id, image_url) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. Seed Client Reviews with job_description (Idempotent)
-- ----------------------------------------------------------------------------
INSERT INTO reviews (worker_id, client_name, client_phone, job_description, rating, comment)
SELECT w.id, r.client_name, r.client_phone, r.job_description, r.rating, r.comment
FROM (
  VALUES
    (
      'chinedu-okafor-electrician-abj01',
      'Babatunde Fashola-Ade',
      '2348031100201',
      'Earth-leakage fault diagnosis & DB labelling',
      5,
      'Traced an intermittent earth-leakage trip in 30 minutes and labelled every breaker neatly.'
    ),
    (
      'chinedu-okafor-electrician-abj01',
      'Zainab Mohammed',
      '2348091100202',
      'Inverter automatic changeover switch installation',
      5,
      'Punctual, transparent with cable pricing, and left zero mess behind.'
    ),
    (
      'musa-ibrahim-plumber-abj02',
      'Dr. Kelvin Uche',
      '2348121100203',
      'Upstairs booster pump & non-return valve upgrade',
      5,
      'Fixed our low upstairs water pressure by properly sizing the booster pump and non-return valve.'
    ),
    (
      'musa-ibrahim-plumber-abj02',
      'Hauwa Garba',
      '2347061100204',
      'Guest bathroom concealed WC & mixer fit-out',
      4,
      'Very solid pipework and neat silicone finishing. Arrived slightly after agreed time due to traffic.'
    ),
    (
      'aisha-danladi-tailor-abj03',
      'Ngozi Eze',
      '2348051100205',
      'Three bespoke wedding aso-ebi & kaftan outfits',
      5,
      'Delivered three outfits two days ahead of schedule and the fit needed zero alterations.'
    ),
    (
      'emeka-nwosu-ac-technician-abj04',
      'Sadiq Umar',
      '2348161100206',
      'Deep pressure-wash servicing of 4 inverter ACs',
      5,
      'Serviced four ACs thoroughly with proper pressure-wash bags so the walls stayed spotless.'
    ),
    (
      'yusuf-abdullahi-solar-installer-abj05',
      'Engr. Femi Ogunleye',
      '2348021100207',
      '5kVA hybrid solar & lithium battery installation',
      5,
      'Neat DC/AC breaker protection and our Jabi office has run 24/7 off-grid without a hitch.'
    ),
    (
      'grace-ojo-painter-abj06',
      'Barr. Chika Nwankwo',
      '2348071100210',
      '4-bedroom duplex interior screeding & repainting',
      5,
      'Spotless masking around doors and tiles. The Venetian feature wall looks magazine-ready.'
    ),
    (
      'suleiman-bello-carpenter-abj07',
      'Maryam Aliyu',
      '2349031100208',
      'Custom modular HDF kitchen cabinetry',
      5,
      'Built our entire Kubwa kitchen cabinet set exactly to the 3D sketch and budget.'
    ),
    (
      'tunde-adeyemi-auto-mechanic-abj08',
      'Chukwudi Anya',
      '2348031100209',
      'Toyota Camry OBD-II scan & timing belt service',
      4,
      'Ran proper OBD diagnostics instead of guessing parts. Honest pricing and clear explanation.'
    )
) AS r(worker_slug, client_name, client_phone, job_description, rating, comment)
JOIN workers w ON w.slug = r.worker_slug
ON CONFLICT (worker_id, client_phone) DO UPDATE
SET job_description = COALESCE(reviews.job_description, EXCLUDED.job_description);
