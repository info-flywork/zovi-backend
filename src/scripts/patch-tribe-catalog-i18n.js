'use strict';

const fs = require('fs');
const path = require('path');
const { catalogTribes } = require('../services/tribeCatalog');

const desc = {
  tr: {
    museum_explorers: 'Müzeleri ve sergileri birlikte gezenler.',
    coffee_ritual: 'Günün kahvesini ritüele çevirenler.',
    street_flavors: 'Sokak lezzetlerinin peşindeki damaklar.',
    park_explorers: 'Parklarda yürüyüp keşfedenler.',
    book_corner: 'Kitap okuyup paylaşan sakin köşe.',
    sunset_hunters: 'Gün batımını kaçırmayanlar.',
    morning_walkers: 'Sabah yürüyüşünü alışkanlık yapanlar.',
    spot_hunters: 'Şehrin gizli duraklarını toplayanlar.',
    cinema_night: 'Film gecesini birlikte kuranlar.',
    concert_queue: 'Sahne önünde sıraya girenler.',
    seaside_wanderers: 'Sahil boyunca dolaşanlar.',
    bazaar_collectors: 'Çarşıları karıştırıp keşfedenler.',
    gallery_tour: 'Galerileri turlayan sanatseverler.',
    vintage_hunters: 'Vintage parçaların izinde olanlar.',
    dog_walks: 'Köpeğiyle şehirde dolaşanlar.',
    night_owls: 'Gece hayatı sevenler.',
    gym_crew: 'Antrenmanı birlikte sürdürenler.',
    bike_route: 'Pedalla şehri turlayanlar.',
    yoga_hall: 'Nefes ve denge arayanlar.',
    photo_stops: 'Fotoğraf duraklarını toplayanlar.',
    brunch_club: 'Hafta sonu brunch’ını kaçırmayanlar.',
    dessert_break: 'Tatlı molasını ciddiye alanlar.',
    live_music: 'Canlı müziğin peşinde olanlar.',
    dance_floor: 'Dans tabanını boş bırakmayanlar.',
    nature_route: 'Doğada rota çizenler.',
    campfire: 'Kamp ateşi etrafında toplananlar.',
    mountain_view: 'Dağ manzarası avcıları.',
    lakeside: 'Göl kenarında duraklayanlar.',
    late_night_bites: 'Gece lezzetini arayanlar.',
    chef_table: 'İyi masanın peşindeki gurmelar.',
    vegan_discovery: 'Bitkisel mutfağı keşfedenler.',
    cocktail_hour: 'Kokteyl saatini sevenler.',
    rooftop_nights: 'Çatı katı gecelerini toplayanlar.',
    after_hours: 'Gece uzadıkça açılanlar.',
    match_day: 'Maç gününü birlikte yaşayanlar.',
    running_club: 'Koşuyu alışkanlık yapanlar.',
    swim_hour: 'Suya girenler.',
    climbing_wall: 'Tırmanış duvarında terleyenler.',
    skate_park: 'Kaykay parkının müdavimleri.',
    arcade_night: 'Oyun salonu gecesi sevenler.',
    board_game_table: 'Masa oyununda buluşanlar.',
    vinyl_shelves: 'Plak raflarını karıştıranlar.',
    indie_stage: 'Indie sahneleri takip edenler.',
    podcast_corner: 'Podcast sohbetine katılanlar.',
    startup_coffee: 'Fikirleri kahveyle büyütenler.',
    coworking_break: 'Çalışma molasını paylaşanlar.',
    night_photographers: 'Geceyi kareleyenler.',
    city_explorers: 'Şehri adım adım keşfedenler.',
  },
  en: {
    museum_explorers: 'People who wander museums and exhibitions together.',
    coffee_ritual: 'Those who turn daily coffee into a ritual.',
    street_flavors: 'Chasing the best street-food bites.',
    park_explorers: 'Walking and discovering city parks.',
    book_corner: 'A quiet corner for readers.',
    sunset_hunters: 'Never missing a sunset.',
    morning_walkers: 'Making the morning walk a habit.',
    spot_hunters: 'Collecting the city’s hidden spots.',
    cinema_night: 'Building movie nights together.',
    concert_queue: 'Lining up for the stage.',
    seaside_wanderers: 'Wandering along the shore.',
    bazaar_collectors: 'Browsing markets and bazaars.',
    gallery_tour: 'Art lovers touring galleries.',
    vintage_hunters: 'On the trail of vintage finds.',
    dog_walks: 'Exploring the city with a dog.',
    night_owls: 'For people who love the night.',
    gym_crew: 'Keeping the workout streak together.',
    bike_route: 'Touring the city on two wheels.',
    yoga_hall: 'Looking for breath and balance.',
    photo_stops: 'Collecting photo-worthy stops.',
    brunch_club: 'Never skipping weekend brunch.',
    dessert_break: 'Taking dessert breaks seriously.',
    live_music: 'Chasing live music.',
    dance_floor: 'Keeping the dance floor busy.',
    nature_route: 'Drawing routes through nature.',
    campfire: 'Gathering around the campfire.',
    mountain_view: 'Hunting mountain views.',
    lakeside: 'Pausing by the lake.',
    late_night_bites: 'Hunting late-night flavors.',
    chef_table: 'Gourmands chasing a great table.',
    vegan_discovery: 'Discovering plant-based kitchens.',
    cocktail_hour: 'For cocktail-hour people.',
    rooftop_nights: 'Collecting rooftop nights.',
    after_hours: 'Opening up as the night gets late.',
    match_day: 'Living match day together.',
    running_club: 'Making running a habit.',
    swim_hour: 'Getting in the water.',
    climbing_wall: 'Sweating on the climbing wall.',
    skate_park: 'Regulars of the skate park.',
    arcade_night: 'For arcade-night people.',
    board_game_table: 'Meeting at the board-game table.',
    vinyl_shelves: 'Digging through vinyl shelves.',
    indie_stage: 'Following indie stages.',
    podcast_corner: 'Joining the podcast conversation.',
    startup_coffee: 'Growing ideas over coffee.',
    coworking_break: 'Sharing the work break.',
    night_photographers: 'Framing the night.',
    city_explorers: 'Exploring the city step by step.',
  },
};

desc.de = { ...desc.en };
desc.es = { ...desc.en };
desc.fr = { ...desc.en };
desc.it = { ...desc.en };
desc.pt = { ...desc.en };
desc.ru = { ...desc.en };
desc.ja = { ...desc.en };
desc.ko = { ...desc.en };
desc.zh = { ...desc.en };
desc.hi = { ...desc.en };

Object.assign(desc.de, {
  museum_explorers: 'Menschen, die zusammen Museen und Ausstellungen erkunden.',
  coffee_ritual: 'Wer den Kaffee zum Ritual macht.',
});
Object.assign(desc.es, {
  museum_explorers: 'Quienes recorren museos y exposiciones juntos.',
  coffee_ritual: 'Quienes convierten el café en un ritual.',
});
Object.assign(desc.fr, {
  museum_explorers: 'Ceux qui visitent musées et expositions ensemble.',
  coffee_ritual: 'Ceux qui transforment le café en rituel.',
});
Object.assign(desc.it, {
  museum_explorers: 'Chi visita musei e mostre insieme.',
  coffee_ritual: 'Chi trasforma il caffè in un rituale.',
});
Object.assign(desc.pt, {
  museum_explorers: 'Quem visita museus e exposições juntos.',
  coffee_ritual: 'Quem transforma o café num ritual.',
});
Object.assign(desc.ru, {
  museum_explorers: 'Те, кто вместе ходит по музеям и выставкам.',
  coffee_ritual: 'Те, кто превращает кофе в ритуал.',
});
Object.assign(desc.ja, {
  museum_explorers: '一緒に美術館や展示を巡る人たち。',
  coffee_ritual: '毎日のコーヒーを儀式にする人たち。',
});
Object.assign(desc.ko, {
  museum_explorers: '함께 박물관과 전시를 다니는 사람들.',
  coffee_ritual: '커피를 리추얼로 만드는 사람들.',
});
Object.assign(desc.zh, {
  museum_explorers: '一起逛博物馆和展览的人。',
  coffee_ritual: '把日常咖啡变成仪式的人。',
});
Object.assign(desc.hi, {
  museum_explorers: 'जो साथ में संग्रहालय और प्रदर्शनियाँ घूमते हैं।',
  coffee_ritual: 'जो रोज़ की कॉफ़ी को रिवाज़ बनाते हैं।',
});

const beFirst = {
  tr: '0 üye · ilk üye sen ol',
  en: '0 members · be the first',
  de: '0 Mitglieder · sei der Erste',
  es: '0 miembros · sé el primero',
  fr: '0 membre · sois le premier',
  it: '0 membri · sii il primo',
  pt: '0 membros · sê o primeiro',
  ru: '0 участников · будь первым',
  ja: '0人 · 最初のメンバーになろう',
  ko: '0명 · 첫 멤버가 되어줘',
  zh: '0 位成员 · 成为第一个',
  hi: '0 सदस्य · पहले बनो',
};

const dir = path.join(__dirname, '../../../assets/translations');
const tribes = catalogTribes();

for (const locale of Object.keys(beFirst)) {
  const file = path.join(dir, `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  json.tribe_members_be_first = beFirst[locale];
  const map = desc[locale];
  for (const tribe of tribes) {
    const value = map[tribe.slug];
    if (!value) throw new Error(`missing ${locale} ${tribe.slug}`);
    json[`tribe_desc_${tribe.slug}`] = value;
  }
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  console.log('updated', locale);
}
