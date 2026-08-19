'use strict';

/** Fixed default tribes. Same catalogue for every user. `nameKey` is localized on the client. */
const TRIBE_CATALOG = [
  { slug: 'museum_explorers', name: 'Müze gezginleri', emoji: '🏛️', threshold: 1 },
  { slug: 'coffee_ritual', name: 'Kahve ritüeli', emoji: '☕', threshold: 1 },
  { slug: 'street_flavors', name: 'Sokak lezzetleri', emoji: '🌮', threshold: 1 },
  { slug: 'park_explorers', name: 'Park kaşifleri', emoji: '🌳', threshold: 1 },
  { slug: 'book_corner', name: 'Kitap köşesi', emoji: '📚', threshold: 1 },
  { slug: 'sunset_hunters', name: 'Gün batımı avcıları', emoji: '🌅', threshold: 5 },
  { slug: 'morning_walkers', name: 'Sabah yürüyüşçüleri', emoji: '🚶', threshold: 5 },
  { slug: 'spot_hunters', name: 'Plaka avcıları', emoji: '📸', threshold: 5 },
  { slug: 'cinema_night', name: 'Sinema gecesi', emoji: '🎬', threshold: 5 },
  { slug: 'concert_queue', name: 'Konser kuyruğu', emoji: '🎵', threshold: 5 },
  { slug: 'seaside_wanderers', name: 'Sahil gezginleri', emoji: '🌊', threshold: 7 },
  { slug: 'bazaar_collectors', name: 'Çarşı toplayıcıları', emoji: '🛍️', threshold: 7 },
  { slug: 'gallery_tour', name: 'Galeri turu', emoji: '🖼️', threshold: 7 },
  { slug: 'vintage_hunters', name: 'Vintage avcıları', emoji: '👗', threshold: 7 },
  { slug: 'dog_walks', name: 'Köpekli geziler', emoji: '🐕', threshold: 7 },
  { slug: 'night_owls', name: 'Gece kuşları', emoji: '🌙', threshold: 10 },
  { slug: 'gym_crew', name: 'Spor salonları', emoji: '🏋️', threshold: 10 },
  { slug: 'bike_route', name: 'Bisiklet rotası', emoji: '🚴', threshold: 10 },
  { slug: 'yoga_hall', name: 'Yoga holü', emoji: '🧘', threshold: 10 },
  { slug: 'photo_stops', name: 'Fotoğraf durakları', emoji: '📷', threshold: 10 },
  { slug: 'brunch_club', name: 'Brunch kulübü', emoji: '🥞', threshold: 12 },
  { slug: 'dessert_break', name: 'Tatlı molası', emoji: '🍰', threshold: 12 },
  { slug: 'live_music', name: 'Canlı müzik', emoji: '🎤', threshold: 12 },
  { slug: 'dance_floor', name: 'Dans tabanı', emoji: '💃', threshold: 12 },
  { slug: 'nature_route', name: 'Doğa rotası', emoji: '🌲', threshold: 15 },
  { slug: 'campfire', name: 'Kamp ateşi', emoji: '🔥', threshold: 15 },
  { slug: 'mountain_view', name: 'Dağ manzarası', emoji: '⛰️', threshold: 15 },
  { slug: 'lakeside', name: 'Göl kenarı', emoji: '🏞️', threshold: 15 },
  { slug: 'late_night_bites', name: 'Gece lezzetleri', emoji: '🍜', threshold: 18 },
  { slug: 'chef_table', name: 'Şef masası', emoji: '🍽️', threshold: 18 },
  { slug: 'vegan_discovery', name: 'Vegan keşif', emoji: '🥗', threshold: 18 },
  { slug: 'cocktail_hour', name: 'Kokteyl saati', emoji: '🍸', threshold: 21 },
  { slug: 'rooftop_nights', name: 'Rooftop geceleri', emoji: '🌃', threshold: 21 },
  { slug: 'after_hours', name: 'After hours', emoji: '🪩', threshold: 21 },
  { slug: 'match_day', name: 'Maç günü', emoji: '⚽', threshold: 21 },
  { slug: 'running_club', name: 'Koşu kulübü', emoji: '🏃', threshold: 25 },
  { slug: 'swim_hour', name: 'Yüzme saati', emoji: '🏊', threshold: 25 },
  { slug: 'climbing_wall', name: 'Tırmanış duvarı', emoji: '🧗', threshold: 25 },
  { slug: 'skate_park', name: 'Skate park', emoji: '🛹', threshold: 30 },
  { slug: 'arcade_night', name: 'Arcade gecesi', emoji: '🕹️', threshold: 30 },
  { slug: 'board_game_table', name: 'Board game masası', emoji: '🎲', threshold: 30 },
  { slug: 'vinyl_shelves', name: 'Vinyl rafları', emoji: '💿', threshold: 35 },
  { slug: 'indie_stage', name: 'Indie sahne', emoji: '🎸', threshold: 35 },
  { slug: 'podcast_corner', name: 'Podcast köşesi', emoji: '🎧', threshold: 35 },
  { slug: 'startup_coffee', name: 'Startup kahvesi', emoji: '💻', threshold: 40 },
  { slug: 'coworking_break', name: 'Coworking molası', emoji: '☕', threshold: 40 },
  { slug: 'night_photographers', name: 'Gece fotoğrafçıları', emoji: '📸', threshold: 45 },
  { slug: 'city_explorers', name: 'Şehir kaşifleri', emoji: '🗺️', threshold: 50 },
];

function catalogId(index) {
  return `a1000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
}

function catalogTribes() {
  return TRIBE_CATALOG.map((row, index) => ({
    ...row,
    id: catalogId(index),
    sortOrder: index + 1,
    nameKey: `tribe_name_${row.slug}`,
    areaKey: `catalog-${row.slug}`,
  }));
}

module.exports = { TRIBE_CATALOG, catalogTribes, catalogId };
