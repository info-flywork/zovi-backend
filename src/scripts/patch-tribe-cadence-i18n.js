'use strict';

const fs = require('fs');
const path = require('path');
const { catalogTribes } = require('../services/tribeCatalog');

const tr = {
  museum_explorers: 'Hafta sonu aktif',
  coffee_ritual: 'Her sabah aktif',
  street_flavors: 'Akşamları aktif',
  park_explorers: 'Gündüz aktif',
  book_corner: 'Sakin saatler',
  sunset_hunters: 'Gün batımında',
  morning_walkers: 'Sabah rutini',
  spot_hunters: 'Hafta içi aktif',
  cinema_night: 'Akşam seansı',
  concert_queue: 'Sahne geceleri',
  seaside_wanderers: 'Sahil saati',
  bazaar_collectors: 'Çarşı günü',
  gallery_tour: 'Sergi saatleri',
  vintage_hunters: 'Hafta sonu avı',
  dog_walks: 'Her gün aktif',
  night_owls: 'Gece aktif',
  gym_crew: 'Antrenman saati',
  bike_route: 'Sabah rotası',
  yoga_hall: 'Sabah seansı',
  photo_stops: 'Işık varken',
  brunch_club: 'Hafta sonu brunch',
  dessert_break: 'Tatlı molası',
  live_music: 'Canlı gece',
  dance_floor: 'Gece ritmi',
  nature_route: 'Hafta sonu rota',
  campfire: 'Kamp gecesi',
  mountain_view: 'Açık hava',
  lakeside: 'Göl kenarı',
  late_night_bites: 'Gece lezzeti',
  chef_table: 'Akşam masası',
  vegan_discovery: 'Öğle keşfi',
  cocktail_hour: 'Kokteyl saati',
  rooftop_nights: 'Çatı gecesi',
  after_hours: 'Gece uzar',
  match_day: 'Maç günü',
  running_club: 'Sabah koşusu',
  swim_hour: 'Yüzme saati',
  climbing_wall: 'Duvar saati',
  skate_park: 'Park saati',
  arcade_night: 'Oyun gecesi',
  board_game_table: 'Masa gecesi',
  vinyl_shelves: 'Plak saati',
  indie_stage: 'Sahne gecesi',
  podcast_corner: 'Sohbet saati',
  startup_coffee: 'Kahve molası',
  coworking_break: 'Ofis molası',
  night_photographers: 'Gece çekimi',
  city_explorers: 'Şehir turu',
};

const en = {
  museum_explorers: 'Active on weekends',
  coffee_ritual: 'Active every morning',
  street_flavors: 'Active in the evenings',
  park_explorers: 'Active by day',
  book_corner: 'Quiet hours',
  sunset_hunters: 'Around sunset',
  morning_walkers: 'Morning routine',
  spot_hunters: 'Active weekdays',
  cinema_night: 'Evening screening',
  concert_queue: 'Stage nights',
  seaside_wanderers: 'Shore hours',
  bazaar_collectors: 'Market days',
  gallery_tour: 'Exhibit hours',
  vintage_hunters: 'Weekend hunt',
  dog_walks: 'Active every day',
  night_owls: 'Active at night',
  gym_crew: 'Workout hours',
  bike_route: 'Morning route',
  yoga_hall: 'Morning session',
  photo_stops: 'While the light lasts',
  brunch_club: 'Weekend brunch',
  dessert_break: 'Dessert break',
  live_music: 'Live nights',
  dance_floor: 'Night rhythm',
  nature_route: 'Weekend route',
  campfire: 'Camp night',
  mountain_view: 'Open air',
  lakeside: 'By the lake',
  late_night_bites: 'Late bites',
  chef_table: 'Evening table',
  vegan_discovery: 'Lunch finds',
  cocktail_hour: 'Cocktail hour',
  rooftop_nights: 'Rooftop night',
  after_hours: 'After hours',
  match_day: 'Match day',
  running_club: 'Morning run',
  swim_hour: 'Swim hour',
  climbing_wall: 'Wall time',
  skate_park: 'Park hours',
  arcade_night: 'Arcade night',
  board_game_table: 'Game night',
  vinyl_shelves: 'Vinyl hour',
  indie_stage: 'Stage night',
  podcast_corner: 'Talk hour',
  startup_coffee: 'Coffee break',
  coworking_break: 'Office break',
  night_photographers: 'Night shoot',
  city_explorers: 'City walk',
};

const byLocale = {
  tr,
  en,
  de: { ...en, coffee_ritual: 'Jeden Morgen aktiv', night_owls: 'Nachts aktiv', gym_crew: 'Trainingszeit' },
  es: { ...en, coffee_ritual: 'Activo cada mañana', night_owls: 'Activo de noche', gym_crew: 'Hora de entreno' },
  fr: { ...en, coffee_ritual: 'Actif chaque matin', night_owls: 'Actif la nuit', gym_crew: 'Heure de sport' },
  it: { ...en, coffee_ritual: 'Attivo ogni mattina', night_owls: 'Attivo di notte', gym_crew: 'Orario workout' },
  pt: { ...en, coffee_ritual: 'Ativo toda manhã', night_owls: 'Ativo à noite', gym_crew: 'Hora de treino' },
  ru: { ...en, coffee_ritual: 'Активны каждое утро', night_owls: 'Активны ночью', gym_crew: 'Час тренировки' },
  ja: { ...en, coffee_ritual: '毎朝アクティブ', night_owls: '夜にアクティブ', gym_crew: 'トレーニング時間' },
  ko: { ...en, coffee_ritual: '매일 아침 활발', night_owls: '밤에 활발', gym_crew: '운동 시간' },
  zh: { ...en, coffee_ritual: '每天早晨活跃', night_owls: '夜间活跃', gym_crew: '训练时段' },
  hi: { ...en, coffee_ritual: 'हर सुबह सक्रिय', night_owls: 'रात में सक्रिय', gym_crew: 'वर्कआउट समय' },
};

const dir = path.join(__dirname, '../../../assets/translations');
const tribes = catalogTribes();

for (const locale of Object.keys(byLocale)) {
  const file = path.join(dir, `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const map = byLocale[locale];
  for (const tribe of tribes) {
    const value = map[tribe.slug];
    if (!value) throw new Error(`missing ${locale} ${tribe.slug}`);
    json[`tribe_cadence_${tribe.slug}`] = value;
  }
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  console.log('updated', locale);
}
