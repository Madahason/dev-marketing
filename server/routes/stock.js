// Required env vars: PIXABAY_API_KEY, PEXELS_API_KEY
const router      = require('express').Router();
const https       = require('https');
const http        = require('http');
const fs          = require('fs');
const path        = require('path');
const crypto      = require('crypto');
const { exec }    = require('child_process');
const { promisify } = require('util');
const execAsync   = promisify(exec);
const clipStore   = require('../services/clipStore');

const CLIPS_DIR      = path.resolve(__dirname, '../../library/clips');
const REMOTION_CLIPS = path.resolve(__dirname, '../../remotion/public/clips');
const MAX_SECONDS    = 8;

function q(s) { return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` }

function syncClipToRemotion(filename) {
  try {
    if (!fs.existsSync(REMOTION_CLIPS)) fs.mkdirSync(REMOTION_CLIPS, { recursive: true });
    const src  = path.join(CLIPS_DIR, filename);
    const dest = path.join(REMOTION_CLIPS, filename);
    if (fs.existsSync(src) && !fs.existsSync(dest)) fs.copyFileSync(src, dest);
  } catch {}
}

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

function downloadUrl(url, destPath, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'DevMarketingFlow/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(downloadUrl(res.headers.location, destPath, redirectsLeft - 1));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} downloading video`));
        return;
      }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', (err) => { try { fs.unlinkSync(destPath); } catch {} reject(err); });
    });
    req.on('error', reject);
  });
}

async function searchPixabay(query, perPage) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) throw new Error('PIXABAY_API_KEY not set');
  const encoded = encodeURIComponent(query);
  const url = `https://pixabay.com/api/videos/?key=${key}&q=${encoded}&per_page=${perPage}&video_type=film&safesearch=true`;
  const data = await httpsGet(url);
  return (data.hits || []).map(v => ({
    id:        `pixabay-${v.id}`,
    source:    'pixabay',
    title:     v.tags || '',
    url:       v.videos?.medium?.url || v.videos?.large?.url || v.videos?.small?.url || '',
    thumbnail: v.picture_id ? `https://i.vimeocdn.com/video/${v.picture_id}_295x166.jpg` : '',
    duration:  v.duration,
    width:     v.videos?.medium?.width  || v.width  || 0,
    height:    v.videos?.medium?.height || v.height || 0,
    license:   'Pixabay License',
    pageUrl:   v.pageURL || `https://pixabay.com/videos/id-${v.id}/`,
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
      id:        `pexels-${v.id}`,
      source:    'pexels',
      title:     v.url?.split('/').filter(Boolean).pop() || `pexels-${v.id}`,
      url:       file?.link || '',
      thumbnail: v.image || '',
      duration:  v.duration,
      width:     file?.width  || v.width  || 0,
      height:    file?.height || v.height || 0,
      license:   'Pexels License',
      pageUrl:   v.url || `https://www.pexels.com/video/${v.id}/`,
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

router.post('/download', async (req, res) => {
  const {
    url, source, tags = [], mood = 'neutral', category = 'general',
    title = '', projectId = null, startSec, endSec,
  } = req.body;
  if (!url || !source) return res.status(400).json({ error: 'url and source are required' });

  const start    = startSec != null ? Number(startSec) : 0;
  const maxEnd   = start + MAX_SECONDS;
  const end      = endSec != null ? Math.min(Number(endSec), maxEnd) : maxEnd;
  const duration = end - start;
  if (duration <= 0) return res.status(400).json({ error: 'Invalid time range' });

  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const id         = crypto.randomUUID();
  const filename   = `${source}_${id}.mp4`;
  const tempPath   = path.join(CLIPS_DIR, `${id}_temp.mp4`);
  const outputPath = path.join(CLIPS_DIR, filename);

  try {
    if (!fs.existsSync(CLIPS_DIR)) fs.mkdirSync(CLIPS_DIR, { recursive: true });
    send({ type: 'start', message: 'Downloading…' });

    await downloadUrl(url, tempPath);
    if (!fs.existsSync(tempPath)) throw new Error('Download produced no file');

    const seekFlag = start > 0 ? `-ss ${start} ` : '';
    const cmd = `ffmpeg ${seekFlag}-i ${q(tempPath)} -t ${duration} -c:v libx264 -c:a aac -movflags +faststart -y ${q(outputPath)}`;
    await execAsync(cmd, { timeout: 120000, maxBuffer: 10 * 1024 * 1024 });
    try { fs.unlinkSync(tempPath); } catch {}

    if (!fs.existsSync(outputPath)) throw new Error('ffmpeg trim produced no output');

    send({ type: 'saving', message: 'Saving to library…' });
    const saved = clipStore.addClip({
      clip_id:     id,
      file:        `/library/clips/${filename}`,
      title:       title || `${source} clip`,
      source,
      license:     'royalty_free',
      source_url:  url,
      tags:        tags.map(t => t.toLowerCase().trim()).filter(Boolean),
      mood,
      category,
      duration:    Math.round(duration),
      description: '',
      added_at:    new Date().toISOString(),
      project_id:  projectId || null,
    });
    syncClipToRemotion(filename);

    send({ type: 'done', clip: saved });
    res.end();
  } catch (err) {
    console.error('[stock/download]', err.message);
    try { if (fs.existsSync(tempPath))   fs.unlinkSync(tempPath);   } catch {}
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
    send({ type: 'error', message: err.message });
    res.end();
  }
});

module.exports = router;
