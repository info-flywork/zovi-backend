'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const dir = path.join(__dirname, '../../../assets/images/tribes');

const photos = {
  museum_explorers: '1554907981-e5bba007fa60',
  coffee_ritual: '1495474472287-4d71bcdd2085',
  street_flavors: '1504674900247-0877df9cc836',
  park_explorers: '1441974231531-c6227db76b6e',
  book_corner: '1512820790803-83ca734da794',
  sunset_hunters: '1475924156734-496f6cac6ec1',
  morning_walkers: '1474415859792-904a04963ef7',
  spot_hunters: '1469474968028-56623f02e42e',
  cinema_night: '1489599849927-2ee91cede3cf',
  concert_queue: '1470229722913-7c0e2dbbafd3',
  seaside_wanderers: '1507525428034-b723cf961d3e',
  bazaar_collectors: '1488459716781-31db52582fe9',
  gallery_tour: '1577720643272-261ed35452ed',
  vintage_hunters: '1469334031218-e382a71b716b',
  dog_walks: '1552053831-71594a27632d',
  night_owls: '1514565131-969b1882e6d0',
  gym_crew: '1534438327276-14e5300c3a48',
  bike_route: '1541625602330-2277a4c46182',
  yoga_hall: '1544367567-0f2fcb009e0b',
  photo_stops: '1492691527719-9d1e7e871d1a',
  brunch_club: '1504754524776-8f4f37790ca0',
  dessert_break: '1578985545062-69928b1d9587',
  live_music: '1511671782779-c97d3d27a1d4',
  dance_floor: '1566417714896-51b648a6db5d',
  nature_route: '1470071459604-3b5ec3a7fe05',
  campfire: '1475483768296-6163e08872a1',
  mountain_view: '1464822759023-fed622ff2c3b',
  lakeside: '1439066615861-d1af74d74000',
  late_night_bites: '1557872943-43a00c016339',
  chef_table: '1556910103-1c02745aae4d',
  vegan_discovery: '1512621776951-a57141f2eefd',
  cocktail_hour: '1514362545858-c4ba1823dba0',
  rooftop_nights: '1540959733332-e9694a54adab',
  after_hours: '1566737236500-c8ac43014a67',
  match_day: '1574629813369-24d85bebfb17',
  running_club: '1552674605-db8f49eaa18e',
  swim_hour: '1505118380757-91f400f26455',
  climbing_wall: '1522163182402-834f871fd851',
  skate_park: '1520046555551-f4c1432d95ed',
  arcade_night: '1511512578047-dfb367046420',
  board_game_table: '1606092195730-5d7b9af1efc1',
  vinyl_shelves: '1493225457124-a1eb110ffa27',
  indie_stage: '1510915361894-95aaa9fedb77',
  podcast_corner: '1478737270239-2f02b77cad13',
  startup_coffee: '1498050108023-c5249f4df085',
  coworking_break: '1497366216548-37526070297c',
  night_photographers: '1480714378408-67cf0d13bc1b',
  city_explorers: '1477959858617-67f85cf4f1df',
};

function download(id, dest) {
  const url = `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=800&h=800&q=80`;
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, { headers: { 'User-Agent': 'zovi-tribe-covers' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlink(dest, () => {});
          https
            .get(res.headers.location, { headers: { 'User-Agent': 'zovi-tribe-covers' } }, (res2) => {
              if (res2.statusCode !== 200) {
                reject(new Error(`${id} status ${res2.statusCode}`));
                return;
              }
              res2.pipe(file);
              file.on('finish', () => file.close(() => resolve(dest)));
            })
            .on('error', reject);
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(dest, () => {});
          reject(new Error(`${id} status ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
      })
      .on('error', reject);
  });
}

(async () => {
  fs.mkdirSync(dir, { recursive: true });
  const slugs = Object.keys(photos);
  for (const slug of slugs) {
    const dest = path.join(dir, `${slug}.jpg`);
    try {
      await download(photos[slug], dest);
      const size = fs.statSync(dest).size;
      console.log('ok', slug, size);
      if (size < 2000) throw new Error('too small');
    } catch (err) {
      console.error('fail', slug, err.message);
    }
  }
})();
