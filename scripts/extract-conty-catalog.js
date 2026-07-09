/**
 * Extrait le catalogue d'histoires depuis les sources Conty (format lunii).
 * Usage: node scripts/extract-conty-catalog.js
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const SOURCES = [
  {
    id: 'lunii',
    name: 'Raconte moi une histoire',
    attribution: 'Communauté Raconte moi une histoire',
    url: 'https://gist.githubusercontent.com/UnofficialStories/32702fb104aebfe650d4ef8d440092c1/raw/luniicreations.json',
  },
];

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  const allStories = [];
  let firstLegacyItem = null;

  for (const source of SOURCES) {
    const raw = await fetchJson(source.url);
    const items = Array.isArray(raw) ? raw : raw.data || [];
    if (!firstLegacyItem && items[0]) firstLegacyItem = items[0];
    items.forEach((item, index) => {
      allStories.push({
        id: `${source.id}_${index}`,
        title: item.title,
        age: item.age || 5,
        source: source.id,
        thumbnail: item.smallThumbUrl || item.thumbs?.small || item.thumbs?.medium || '',
        downloadUrl: item.downloadUrl || item.download || '',
        description: item.description || '',
      });
    });
  }

  const catalog = {
    version: 1,
    updatedAt: new Date().toISOString(),
    sources: SOURCES.map(({ id, name, attribution, url }) => ({ id, name, attribution, url })),
    stories: allStories,
  };

  console.log('\n=== Ancien JSON (source Conty) — 1er élément ===');
  console.log(JSON.stringify(firstLegacyItem, null, 2));
  console.log('\n=== Nouveau JSON (catalog.json) — 1er élément ===');
  console.log(JSON.stringify(allStories[0], null, 2));
  console.log('\nChamps mappés: title, age, smallThumbUrl→thumbnail, downloadUrl→downloadUrl\n');

  const outPath = path.join(__dirname, '../assets/stories/catalog.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2));
  console.log(`Catalogue écrit: ${allStories.length} histoires → ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
