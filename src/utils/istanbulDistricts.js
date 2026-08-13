'use strict';

/**
 * Dependency-free lat/lng -> Istanbul district resolver.
 *
 * We match to the nearest district centroid. This is deliberately coarse (no
 * external geocoding API, no polygons) -- good enough to cluster check-ins for
 * tribe formation. Swap for real reverse-geocoding later without touching the
 * callers, which only use districtForCoords() / districtLabel().
 */

// key -> { label, lat, lng }. Labels are user-facing (tribe names, area chips).
const DISTRICTS = [
  { key: 'kadikoy', label: 'Kadıköy', lat: 40.9903, lng: 29.0275 },
  { key: 'besiktas', label: 'Beşiktaş', lat: 41.0430, lng: 29.0075 },
  { key: 'beyoglu', label: 'Beyoğlu', lat: 41.0362, lng: 28.9773 },
  { key: 'sisli', label: 'Şişli', lat: 41.0602, lng: 28.9870 },
  { key: 'uskudar', label: 'Üsküdar', lat: 41.0264, lng: 29.0156 },
  { key: 'fatih', label: 'Fatih', lat: 41.0186, lng: 28.9497 },
  { key: 'bakirkoy', label: 'Bakırköy', lat: 40.9790, lng: 28.8772 },
  { key: 'kartal', label: 'Kartal', lat: 40.8890, lng: 29.1900 },
  { key: 'maltepe', label: 'Maltepe', lat: 40.9350, lng: 29.1310 },
  { key: 'atasehir', label: 'Ataşehir', lat: 40.9847, lng: 29.1073 },
  { key: 'sariyer', label: 'Sarıyer', lat: 41.1670, lng: 29.0570 },
  { key: 'bagcilar', label: 'Bağcılar', lat: 41.0390, lng: 28.8560 },
  { key: 'umraniye', label: 'Ümraniye', lat: 41.0160, lng: 29.1210 },
  { key: 'esenyurt', label: 'Esenyurt', lat: 41.0280, lng: 28.6800 },
  { key: 'zeytinburnu', label: 'Zeytinburnu', lat: 40.9940, lng: 28.9020 },
];

const DISTRICT_BY_KEY = new Map(DISTRICTS.map((d) => [d.key, d]));

// Beyond this radius from every centroid we treat the point as out of coverage.
const MAX_MATCH_KM = 25;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * @returns {{ key: string, label: string, distanceKm: number } | null}
 */
function districtForCoords(lat, lng) {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;

  let best = null;
  for (const d of DISTRICTS) {
    const distanceKm = haversineKm(latNum, lngNum, d.lat, d.lng);
    if (!best || distanceKm < best.distanceKm) {
      best = { key: d.key, label: d.label, distanceKm };
    }
  }
  if (!best || best.distanceKm > MAX_MATCH_KM) return null;
  return best;
}

function districtLabel(key) {
  return DISTRICT_BY_KEY.get(String(key || '').trim())?.label || '';
}

module.exports = {
  DISTRICTS,
  districtForCoords,
  districtLabel,
  haversineKm,
};
