-- ============================================================================
-- SkillVerify Abuja Artisan Seed Data (Idempotent)
-- ============================================================================

INSERT INTO workers (
  slug,
  full_name,
  trade,
  location,
  phone,
  bio,
  years_experience,
  is_verified
)
VALUES
  (
    'chinedu-okafor-electrician-abj01',
    'Chinedu Okafor',
    'Electrician',
    'Wuse II, Abuja',
    '2348034128891',
    'Certified residential and commercial electrician specializing in 3-phase distribution boards, inverter changeover wiring, and earthing diagnostics across Abuja.',
    9,
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
    FALSE
  ),
  (
    'suleiman-bello-carpenter-abj07',
    'Suleiman Bello',
    'Carpenter & Furniture Maker',
    'Kubwa, Abuja',
    '2348026194503',
    'Custom kitchen cabinetry, HDF wardrobes, solid-wood security doors, and precision office furniture built to exact room measurements.',
    11,
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
    TRUE
  )
ON CONFLICT (slug) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Seed Verified Work Samples (Idempotent via unique (worker_id, image_url))
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
-- Seed Client Reviews (Idempotent via unique (worker_id, client_phone))
-- ----------------------------------------------------------------------------
INSERT INTO reviews (worker_id, client_name, client_phone, rating, comment)
SELECT w.id, r.client_name, r.client_phone, r.rating, r.comment
FROM (
  VALUES
    (
      'chinedu-okafor-electrician-abj01',
      'Babatunde Fashola-Ade',
      '2348031100201',
      5,
      'Traced an intermittent earth-leakage trip in 30 minutes and labelled every breaker neatly.'
    ),
    (
      'chinedu-okafor-electrician-abj01',
      'Zainab Mohammed',
      '2348091100202',
      5,
      'Punctual, transparent with cable pricing, and left zero mess behind.'
    ),
    (
      'musa-ibrahim-plumber-abj02',
      'Dr. Kelvin Uche',
      '2348121100203',
      5,
      'Fixed our low upstairs water pressure by properly sizing the booster pump and non-return valve.'
    ),
    (
      'musa-ibrahim-plumber-abj02',
      'Hauwa Garba',
      '2347061100204',
      4,
      'Very solid pipework and neat silicone finishing. Arrived slightly after agreed time due to traffic.'
    ),
    (
      'aisha-danladi-tailor-abj03',
      'Ngozi Eze',
      '2348051100205',
      5,
      'Delivered three outfits two days ahead of schedule and the fit needed zero alterations.'
    ),
    (
      'emeka-nwosu-ac-technician-abj04',
      'Sadiq Umar',
      '2348161100206',
      5,
      'Serviced four ACs thoroughly with proper pressure-wash bags so the walls stayed spotless.'
    ),
    (
      'yusuf-abdullahi-solar-installer-abj05',
      'Engr. Femi Ogunleye',
      '2348021100207',
      5,
      'Neat DC/AC breaker protection and our Jabi office has run 24/7 off-grid without a hitch.'
    ),
    (
      'suleiman-bello-carpenter-abj07',
      'Maryam Aliyu',
      '2349031100208',
      5,
      'Built our entire Kubwa kitchen cabinet set exactly to the 3D sketch and budget.'
    ),
    (
      'tunde-adeyemi-auto-mechanic-abj08',
      'Chukwudi Anya',
      '2348031100209',
      4,
      'Ran proper OBD diagnostics instead of guessing parts. Honest pricing and clear explanation.'
    )
) AS r(worker_slug, client_name, client_phone, rating, comment)
JOIN workers w ON w.slug = r.worker_slug
ON CONFLICT (worker_id, client_phone) DO NOTHING;
