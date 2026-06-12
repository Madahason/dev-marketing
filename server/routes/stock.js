// Required env vars: PIXABAY_API_KEY, PEXELS_API_KEY
const router = require('express').Router();
const https  = require('https');

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'DevMarketingFlow/1.0', ...headers } }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

async function searchPixabay(query, perPage) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) throw new Error('PIXABAY_API_KEY not set');
  const encoded = encodeURIComponent(query);
  const url = `https://pixabay.com/api/videos/?key=${key}&q=${encoded}&per_page=${perPage}&video_type=film&safesearch=true`;
  const data = await httpsGet(url);
  return (data.hits || []).map(v => ({
    id:       `pixabay-${v.id}`,
    source:   'pixabay',
    title:    v.tags || '',
    url:      v.videos?.medium?.url || v.videos?.large?.url || v.videos?.small?.url || '',
    thumbnail: v.picture_id ? `https://i.vimeocdn.com/video/${v.picture_id}_295x166.jpg` : '',
    duration: v.duration,
    width:    v.videos?.medium?.width  || v.width  || 0,
    height:   v.videos?.medium?.height || v.height || 0,
    license:  'Pixabay License',
    pageUrl:  v.pageURL || `https://pixabay.com/videos/id-${v.id}/`,
  }));
}

async function searchPexels(query, perPage) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error('PEXELS_API_KEY not set');
  const encoded = encodeURIComponent(query);
  const url = `https://api.pexels.com/videos/search?query=${encoded}&per_page=${perPage}&size=medium`;
  const data = await httpsGet(url, { Authorization: key });
  return (data.videos || []).map(v => {
    const file = v.video_files?.find(f => f.quality === 'hd') || v.video_files?.[0];
    return {
      id:       `pexels-${v.id}`,
      source:   'pexels',
      title:    v.url?.split('/').filter(Boolean).pop() || `pexels-${v.id}`,
      url:      file?.link || '',
      thumbnail: v.image || '',
      duration: v.duration,
      width:    file?.width  || v.width  || 0,
      height:   file?.height || v.height || 0,
      license:  'Pexels License',
      pageUrl:  v.url || `https://www.pexels.com/video/${v.id}/`,
    };
  });
}

router.post('/search', async (req, res) => {
  const { query, perPage = 6, sources = ['pixabay', 'pexels'] } = req.body;
  if (!query?.trim()) return res.status(400).json({ error: 'query is required' });

  const results = [];
  const errors  = {};
  let total = 0;

  await Promise.all(sources.map(async source => {
    try {
      let hits = [];
      if (source === 'pixabay') hits = await searchPixabay(query, perPage);
      else if (source === 'pexels') hits = await searchPexels(query, perPage);
      results.push(...hits);
      total += hits.length;
    } catch (err) {
      errors[source] = err.message;
    }
  }));

  res.json({ results, total, errors });
});

module.exports = router;
