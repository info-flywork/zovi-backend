'use strict';

/**
 * Seed spreadsheet mock characters onto the live map in cities that match
 * their listed ethnicity / name, using Bunny CDN portraits from /mock-chars.
 *
 *   node src/scripts/seed-mock-chars.js
 *
 * Idempotent. Presence TTL is 7 days (map_presence.expires_at).
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { query, closePool } = require('../config/database');
const { logger } = require('../utils/logger');

const CDN_BASE = 'https://zovi.b-cdn.net/mock-chars/';
const DATA_PATH = path.join(__dirname, 'data', 'mock-chars.json');

const CITIES = {
  turkey: [
    { city: 'İstanbul', country: 'Türkiye', lat: 41.0082, lng: 28.9784, place: 'Galata Köprüsü' },
    { city: 'İstanbul', country: 'Türkiye', lat: 40.9903, lng: 29.0275, place: 'Moda Sahili' },
    { city: 'İstanbul', country: 'Türkiye', lat: 41.043, lng: 29.0075, place: 'Beşiktaş İskele' },
    { city: 'Ankara', country: 'Türkiye', lat: 39.9334, lng: 32.8597, place: 'Kızılay Meydanı' },
    { city: 'İzmir', country: 'Türkiye', lat: 38.4237, lng: 27.1428, place: 'Kordon' },
    { city: 'Antalya', country: 'Türkiye', lat: 36.8969, lng: 30.7133, place: 'Kaleiçi' },
  ],
  usa: [
    { city: 'New York', country: 'ABD', lat: 40.758, lng: -73.9855, place: 'Times Square' },
    { city: 'Los Angeles', country: 'ABD', lat: 34.0522, lng: -118.2437, place: 'Griffith Observatory' },
    { city: 'Chicago', country: 'ABD', lat: 41.8781, lng: -87.6298, place: 'Millennium Park' },
    { city: 'Atlanta', country: 'ABD', lat: 33.749, lng: -84.388, place: 'Piedmont Park' },
    { city: 'Miami', country: 'ABD', lat: 25.7617, lng: -80.1918, place: 'South Beach' },
    { city: 'Austin', country: 'ABD', lat: 30.2672, lng: -97.7431, place: 'Rainey Street' },
    { city: 'Seattle', country: 'ABD', lat: 47.6062, lng: -122.3321, place: 'Pike Place' },
    { city: 'Denver', country: 'ABD', lat: 39.7392, lng: -104.9903, place: 'LoDo' },
  ],
  latam: [
    { city: 'Mexico City', country: 'Meksika', lat: 19.4326, lng: -99.1332, place: 'Zócalo' },
    { city: 'São Paulo', country: 'Brezilya', lat: -23.5505, lng: -46.6333, place: 'Paulista Avenue' },
    { city: 'Buenos Aires', country: 'Arjantin', lat: -34.6037, lng: -58.3816, place: 'Palermo' },
    { city: 'Bogotá', country: 'Kolombiya', lat: 4.711, lng: -74.0721, place: 'Zona Rosa' },
    { city: 'Lima', country: 'Peru', lat: -12.0464, lng: -77.0428, place: 'Miraflores' },
    { city: 'Santiago', country: 'Şili', lat: -33.4489, lng: -70.6693, place: 'Bellavista' },
  ],
  seasia: [
    { city: 'Bangkok', country: 'Tayland', lat: 13.7563, lng: 100.5018, place: 'Chatuchak' },
    { city: 'Jakarta', country: 'Endonezya', lat: -6.2088, lng: 106.8456, place: 'Menteng' },
    { city: 'Manila', country: 'Filipinler', lat: 14.5995, lng: 120.9842, place: 'Intramuros' },
    { city: 'Ho Chi Minh City', country: 'Vietnam', lat: 10.8231, lng: 106.6297, place: 'District 1' },
    { city: 'Kuala Lumpur', country: 'Malezya', lat: 3.139, lng: 101.6869, place: 'Bukit Bintang' },
    { city: 'Singapore', country: 'Singapur', lat: 1.3521, lng: 103.8198, place: 'Marina Bay' },
  ],
  easia: [
    { city: 'Tokyo', country: 'Japonya', lat: 35.6762, lng: 139.6503, place: 'Shibuya Crossing' },
    { city: 'Osaka', country: 'Japonya', lat: 34.6937, lng: 135.5023, place: 'Dotonbori' },
    { city: 'Seoul', country: 'Güney Kore', lat: 37.5665, lng: 126.978, place: 'Hongdae' },
    { city: 'Shanghai', country: 'Çin', lat: 31.2304, lng: 121.4737, place: 'The Bund' },
    { city: 'Taipei', country: 'Tayvan', lat: 25.033, lng: 121.5654, place: 'Ximending' },
    { city: 'Hong Kong', country: 'Hong Kong', lat: 22.3193, lng: 114.1694, place: 'Tsim Sha Tsui' },
  ],
  sasian: [
    { city: 'Mumbai', country: 'Hindistan', lat: 19.076, lng: 72.8777, place: 'Bandra' },
    { city: 'Delhi', country: 'Hindistan', lat: 28.6139, lng: 77.209, place: 'Connaught Place' },
    { city: 'Bengaluru', country: 'Hindistan', lat: 12.9716, lng: 77.5946, place: 'Indiranagar' },
    { city: 'Lahore', country: 'Pakistan', lat: 31.5204, lng: 74.3587, place: 'Mall Road' },
    { city: 'Dhaka', country: 'Bangladeş', lat: 23.8103, lng: 90.4125, place: 'Gulshan' },
    { city: 'Kathmandu', country: 'Nepal', lat: 27.7172, lng: 85.324, place: 'Thamel' },
  ],
  africa: [
    { city: 'Lagos', country: 'Nijerya', lat: 6.5244, lng: 3.3792, place: 'Victoria Island' },
    { city: 'Nairobi', country: 'Kenya', lat: -1.2921, lng: 36.8219, place: 'Westlands' },
    { city: 'Accra', country: 'Gana', lat: 5.6037, lng: -0.187, place: 'Osu' },
    { city: 'Johannesburg', country: 'Güney Afrika', lat: -26.2041, lng: 28.0473, place: 'Maboneng' },
    { city: 'Addis Ababa', country: 'Etiyopya', lat: 9.032, lng: 38.7469, place: 'Bole' },
    { city: 'Cape Town', country: 'Güney Afrika', lat: -33.9249, lng: 18.4241, place: 'Camps Bay' },
  ],
  mena: [
    { city: 'Cairo', country: 'Mısır', lat: 30.0444, lng: 31.2357, place: 'Zamalek' },
    { city: 'Dubai', country: 'BAE', lat: 25.2048, lng: 55.2708, place: 'Marina Walk' },
    { city: 'Beirut', country: 'Lübnan', lat: 33.8938, lng: 35.5018, place: 'Gemmayzeh' },
    { city: 'Amman', country: 'Ürdün', lat: 31.9454, lng: 35.9284, place: 'Rainbow Street' },
    { city: 'Casablanca', country: 'Fas', lat: 33.5731, lng: -7.5898, place: 'Corniche' },
    { city: 'Tunis', country: 'Tunus', lat: 36.8065, lng: 10.1815, place: 'Avenue Habib Bourguiba' },
  ],
  nordic: [
    { city: 'Stockholm', country: 'İsveç', lat: 59.3293, lng: 18.0686, place: 'Södermalm' },
    { city: 'Oslo', country: 'Norveç', lat: 59.9139, lng: 10.7522, place: 'Aker Brygge' },
    { city: 'Copenhagen', country: 'Danimarka', lat: 55.6761, lng: 12.5683, place: 'Nyhavn' },
    { city: 'Helsinki', country: 'Finlandiya', lat: 60.1699, lng: 24.9384, place: 'Design District' },
  ],
  west_eu: [
    { city: 'London', country: 'İngiltere', lat: 51.5074, lng: -0.1278, place: 'Shoreditch' },
    { city: 'Berlin', country: 'Almanya', lat: 52.52, lng: 13.405, place: 'Kreuzberg' },
    { city: 'Paris', country: 'Fransa', lat: 48.8566, lng: 2.3522, place: 'Le Marais' },
    { city: 'Amsterdam', country: 'Hollanda', lat: 52.3676, lng: 4.9041, place: 'De Pijp' },
    { city: 'Dublin', country: 'İrlanda', lat: 53.3498, lng: -6.2603, place: 'Temple Bar' },
    { city: 'Munich', country: 'Almanya', lat: 48.1351, lng: 11.582, place: 'Gärtnerplatz' },
  ],
  south_eu: [
    { city: 'Rome', country: 'İtalya', lat: 41.9028, lng: 12.4964, place: 'Trastevere' },
    { city: 'Barcelona', country: 'İspanya', lat: 41.3874, lng: 2.1686, place: 'El Born' },
    { city: 'Athens', country: 'Yunanistan', lat: 37.9838, lng: 23.7275, place: 'Plaka' },
    { city: 'Lisbon', country: 'Portekiz', lat: 38.7223, lng: -9.1393, place: 'Bairro Alto' },
    { city: 'Milan', country: 'İtalya', lat: 45.4642, lng: 9.19, place: 'Navigli' },
  ],
  east_eu: [
    { city: 'Warsaw', country: 'Polonya', lat: 52.2297, lng: 21.0122, place: 'Nowy Świat' },
    { city: 'Prague', country: 'Çekya', lat: 50.0755, lng: 14.4378, place: 'Vinohrady' },
    { city: 'Kyiv', country: 'Ukrayna', lat: 50.4501, lng: 30.5234, place: 'Khreshchatyk' },
    { city: 'Moscow', country: 'Rusya', lat: 55.7558, lng: 37.6173, place: 'Patriarshiye Prudy' },
    { city: 'Bucharest', country: 'Romanya', lat: 44.4268, lng: 26.1025, place: 'Old Town' },
  ],
  central_asia: [
    { city: 'Almaty', country: 'Kazakistan', lat: 43.238, lng: 76.8829, place: 'Panfilov Park' },
    { city: 'Tashkent', country: 'Özbekistan', lat: 41.2995, lng: 69.2401, place: 'Chorsu' },
    { city: 'Bishkek', country: 'Kırgızistan', lat: 42.8746, lng: 74.5698, place: 'Ala-Too Square' },
    { city: 'Ulaanbaatar', country: 'Moğolistan', lat: 47.8864, lng: 106.9057, place: 'Sukhbaatar Square' },
  ],
  pacific: [
    { city: 'Honolulu', country: 'ABD', lat: 21.3069, lng: -157.8583, place: 'Waikiki' },
    { city: 'Auckland', country: 'Yeni Zelanda', lat: -36.8509, lng: 174.7645, place: 'Ponsonby' },
    { city: 'Suva', country: 'Fiji', lat: -18.1416, lng: 178.4419, place: 'Suva Waterfront' },
    { city: 'Sydney', country: 'Avustralya', lat: -33.8688, lng: 151.2093, place: 'Bondi Beach' },
  ],
  native_us: [
    { city: 'Santa Fe', country: 'ABD', lat: 35.687, lng: -105.9378, place: 'Canyon Road' },
    { city: 'Phoenix', country: 'ABD', lat: 33.4484, lng: -112.074, place: 'Roosevelt Row' },
    { city: 'Albuquerque', country: 'ABD', lat: 35.0844, lng: -106.6504, place: 'Old Town' },
    { city: 'Denver', country: 'ABD', lat: 39.7392, lng: -104.9903, place: 'RiNo' },
  ],
};

function poolFor(race, name) {
  const hay = `${race} ${name}`.toLowerCase();
  if (hay.includes('türk') || hay.includes('anadolu')) return CITIES.turkey;
  if (hay.includes('iskandinav') || hay.includes('kuzey avrupa')) return CITIES.nordic;
  if (hay.includes('afro-amerikan')) return CITIES.usa;
  if (hay.includes('beyaz amerikalı') || hay.includes('orta batı')) return CITIES.usa;
  if (hay.includes('yerli amerikan') || hay.includes('native')) return CITIES.native_us;
  if (hay.includes('latin')) return CITIES.latam;
  if (hay.includes('güneydoğu')) return CITIES.seasia;
  if (hay.includes('filipin')) return CITIES.seasia;
  if (hay.includes('doğu asyalı') || hay.includes('japon') || hay.includes('kore') || hay.includes('çin')) {
    return CITIES.easia;
  }
  if (hay.includes('güney asyalı') || hay.includes('hint') || hay.includes('nepal') || hay.includes('bengal')) {
    return CITIES.sasian;
  }
  if (hay.includes('sahra') || hay.includes('etiyopy') || hay.includes('afrikalı')) return CITIES.africa;
  if (hay.includes('arap') || hay.includes('mena') || hay.includes('orta doğu')) return CITIES.mena;
  if (hay.includes('orta asya') || hay.includes('türki') || hay.includes('moğol')) return CITIES.central_asia;
  if (hay.includes('pasifik')) return CITIES.pacific;
  if (hay.includes('alman') || hay.includes('anglo') || hay.includes('cermen') || hay.includes('ingiliz') || hay.includes('irland')) {
    return CITIES.west_eu;
  }
  if (hay.includes('akdeniz') || hay.includes('italyan') || hay.includes('yunan') || hay.includes('portekiz') || hay.includes('brezilyalı')) {
    if (hay.includes('brezily')) return CITIES.latam;
    return CITIES.south_eu;
  }
  if (hay.includes('slav') || hay.includes('doğu avrupa') || hay.includes('ukray') || hay.includes('rus')) {
    return CITIES.east_eu;
  }
  if (hay.includes('fransız') || hay.includes('beyaz avrupa')) return CITIES.west_eu;
  if (hay.includes('karışık') || hay.includes('multiracial')) {
    return [
      ...CITIES.usa,
      ...CITIES.west_eu,
      ...CITIES.easia,
      ...CITIES.latam,
      ...CITIES.turkey,
    ];
  }
  return [...CITIES.west_eu, ...CITIES.usa, ...CITIES.easia];
}

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function placeCharacter(char, index) {
  const pool = poolFor(char.race, char.name);
  const h = hash32(`${char.name}:${char.race}:${index}`);
  const spot = pool[h % pool.length];
  const dLat = ((h % 800) - 400) / 50000; // ~±0.8km
  const dLng = ((((h / 800) | 0) % 800) - 400) / 50000;
  const lat = spot.lat + dLat;
  const lng = spot.lng + dLng;
  return {
    city: spot.city,
    country: spot.country,
    place: spot.place,
    lat,
    lng,
    label: `${spot.city}, ${spot.country}`,
  };
}

function hex12(n) {
  return n.toString(16).padStart(12, '0');
}

function userIdFor(index) {
  return `f0c4a000-0000-4000-8000-${hex12(index + 1)}`;
}

function checkInIdFor(index) {
  return `f0c4a100-0000-4000-8000-${hex12(index + 1)}`;
}

function avatarUrl(name) {
  return `${CDN_BASE}${encodeURIComponent(name)}.png`;
}

function usernameFromName(name, index) {
  const ascii = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const base = (ascii || `zovi_m`).slice(0, 16);
  return `${base}_${index + 1}`.slice(0, 25);
}

function mapGender(raw) {
  const g = String(raw || '').toLowerCase();
  if (g.startsWith('kadın')) return 'female';
  if (g.startsWith('erkek')) return 'male';
  if (g.includes('androjen') || g.includes('non-binary') || g.includes('genderfluid') || g.includes('belirtilmemiş')) {
    return 'nonbinary';
  }
  return 'other';
}

function birthDateFromAge(age) {
  const years = Number.isFinite(Number(age)) ? Number(age) : 28;
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCMonth(5, 15);
  return d.toISOString().slice(0, 10);
}

async function upsertUser(char, index) {
  const id = userIdFor(index);
  const username = usernameFromName(char.name, index);
  const loc = placeCharacter(char, index);
  const avatar = avatarUrl(char.name);
  const bio = String(char.traits || '').slice(0, 150);
  const firebaseUid = `zovi_mock_char_${index + 1}`;

  await query(
    `INSERT INTO users (id, firebase_uid, primary_auth, status)
     VALUES (?, ?, 'phone', 'active')
     ON DUPLICATE KEY UPDATE status = 'active', deleted_at = NULL`,
    [id, firebaseUid],
  );

  await query(
    `INSERT INTO user_profiles (
       user_id, full_name, username, avatar_url, bio, location_text,
       birth_date, gender, account_privacy, coins, streak_count
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'public', 120, ?)
     ON DUPLICATE KEY UPDATE
       full_name = VALUES(full_name),
       username = VALUES(username),
       avatar_url = VALUES(avatar_url),
       bio = VALUES(bio),
       location_text = VALUES(location_text),
       birth_date = VALUES(birth_date),
       gender = VALUES(gender),
       account_privacy = 'public'`,
    [
      id,
      char.name.slice(0, 50),
      username,
      avatar,
      bio || null,
      loc.label,
      birthDateFromAge(char.age),
      mapGender(char.gender),
      3 + (index % 12),
    ],
  );

  await query(
    `INSERT INTO usernames (username, user_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
    [username, id],
  );

  await query(
    `INSERT IGNORE INTO user_settings (user_id, map_share_location, show_online_status)
     VALUES (?, 1, 1)`,
    [id],
  );

  await query(
    `INSERT INTO user_onboarding_flags (user_id, intro_done, onboarding_done, location_permission)
     VALUES (?, 1, 1, 'granted')
     ON DUPLICATE KEY UPDATE onboarding_done = 1, location_permission = 'granted'`,
    [id],
  );

  await query(
    `INSERT INTO map_presence (
       user_id, lat, lng, accuracy_m, location_label, is_anonymous, expires_at
     ) VALUES (?, ?, ?, 18, ?, 0, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 14 DAY))
     ON DUPLICATE KEY UPDATE
       lat = VALUES(lat),
       lng = VALUES(lng),
       location_label = VALUES(location_label),
       is_anonymous = 0,
       updated_at = UTC_TIMESTAMP(3),
       expires_at = VALUES(expires_at)`,
    [id, loc.lat, loc.lng, loc.label],
  );

  const cid = checkInIdFor(index);
  await query(
    `UPDATE check_ins SET is_active_on_map = 0
     WHERE user_id = ? AND id <> ? AND deleted_at IS NULL`,
    [id, cid],
  );

  const photos = JSON.stringify([avatar]);
  await query(
    `INSERT INTO check_ins (
       id, user_id, venue_id, place_name, caption, lat, lng, photo_privacy,
       photo_urls_json, is_active_on_map, checked_at
     ) VALUES (?, ?, NULL, ?, ?, ?, ?, 'public', ?, 1, UTC_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       place_name = VALUES(place_name),
       caption = VALUES(caption),
       lat = VALUES(lat),
       lng = VALUES(lng),
       photo_urls_json = VALUES(photo_urls_json),
       is_active_on_map = 1,
       deleted_at = NULL,
       checked_at = UTC_TIMESTAMP(3)`,
    [cid, id, loc.place, loc.city, loc.lat, loc.lng, photos],
  );

  await query(
    `UPDATE user_profiles SET check_ins_count = GREATEST(check_ins_count, 1) WHERE user_id = ?`,
    [id],
  );

  return { id, username, loc };
}

async function run() {
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  const chars = JSON.parse(raw);
  logger.info('seed_mock_chars_start', { count: chars.length });

  const byCountry = {};
  for (let i = 0; i < chars.length; i += 1) {
    const row = await upsertUser(chars[i], i);
    byCountry[row.loc.country] = (byCountry[row.loc.country] || 0) + 1;
    if ((i + 1) % 50 === 0) {
      logger.info('seed_mock_chars_progress', { done: i + 1 });
    }
  }

  logger.info('seed_mock_chars_done', { count: chars.length, byCountry });
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ count: chars.length, byCountry }, null, 2));
}

run()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error('seed_mock_chars_failed', err);
    // eslint-disable-next-line no-console
    console.error(err);
    await closePool();
    process.exit(1);
  });
