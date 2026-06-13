const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// renderJobs: projectId -> { proc, sseClients: Set<res>, doneEvent: null | object }
const renderJobs = new Map();

// Resolve any URL/path form to an absolute local path.
// Handles: http://host/path  →  strip host, resolve from PROJECT_ROOT
//          /root-relative    →  resolve from PROJECT_ROOT
//          C:\absolute       →  return as-is
function toAbsPath(url) {
  if (!url) return null;
  const withoutHost = url.replace(/^https?:\/\/[^/]*/, '');
  if (/^[A-Z]:[\\\/]/i.test(withoutHost)) return withoutHost;
  return path.resolve(PROJECT_ROOT, withoutHost.replace(/^\//, '').replace(/\//g, path.sep));
}

// Download a remote file to dest, following up to 5 redirects.
// Adds browser-like headers to avoid CDN blocking.
// Throws if the download fails or produces an empty file.
function downloadFile(url, dest, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));

    const proto = url.startsWith('https') ? require('https') : require('http');
    const file = fs.createWriteStream(dest);
    let settled = false;

    const done = (err) => {
      if (settled) return;
      settled = true;
      if (err) {
        file.close(() => fs.unlink(dest, () => {}));
        reject(err);
      } else {
        file.close(() => resolve());
      }
    };

    const request = proto.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept':     'video/mp4,video/*,*/*;q=0.9',
        'Referer':    'https://www.pexels.com/',
      },
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close(() => fs.unlink(dest, () => {}));
        settled = true;
        downloadFile(response.headers.location, dest, redirectsLeft - 1)
          .then(resolve)
          .catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        done(new Error(`HTTP ${response.statusCode} for ${url}`));
        response.resume();
        return;
      }
      response.pipe(file);
      file.on('finish', () => done(null));
      file.on('error', (err) => done(err));
    });

    request.on('error', (err) => done(err));

    // 90-second per-clip timeout
    const timer = setTimeout(() => done(new Error('Download timed out after 90s')), 90000);
    file.on('close', () => clearTimeout(timer));
  });
}

function sendSSE(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcast(job, data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of job.sseClients) {
    try { res.write(payload); } catch { /* client disconnected */ }
  }
}

// POST /api/render
// Full sequence (all synchronous/async ops complete before res.json):
//   1. Create remotion/public subdirs
//   2. Copy audio files
//   3. Copy image assets per scene
//   4. Download stock clips (proxy URLs) or copy local library clips
//   5. Write scenes.json with bundle-server-relative paths
//   6. res.json({ started: true })
//   7. Spawn Remotion CLI
router.post('/', async (req, res) => {
  const { projectId, scenes, selectedClips } = req.body;

  if (!projectId || !scenes?.length) {
    return res.status(400).json({ error: 'projectId and scenes required' });
  }

  const outputDir  = path.resolve(PROJECT_ROOT, 'projects', projectId, 'output');
  const propsPath  = path.resolve(PROJECT_ROOT, 'projects', projectId, 'scenes.json');
  const outputPath = path.join(outputDir, 'final.mp4');

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // ── 1. Prepare remotion/public asset directories ──────────────────────────────
  const remotionPublicDir = path.resolve(PROJECT_ROOT, 'remotion', 'public');
  const remotionAudioDir  = path.join(remotionPublicDir, 'audio', projectId);
  const remotionAssetsDir = path.join(remotionPublicDir, 'assets', projectId);
  const remotionClipsDir  = path.join(remotionPublicDir, 'clips');

  fs.mkdirSync(remotionAudioDir,  { recursive: true });
  fs.mkdirSync(remotionAssetsDir, { recursive: true });
  fs.mkdirSync(remotionClipsDir,  { recursive: true });

  // ── 2. Copy all audio for this project ────────────────────────────────────────
  const projectAudioDir = path.resolve(PROJECT_ROOT, 'projects', projectId, 'audio');
  if (fs.existsSync(projectAudioDir)) {
    for (const file of fs.readdirSync(projectAudioDir)) {
      try {
        fs.copyFileSync(
          path.join(projectAudioDir, file),
          path.join(remotionAudioDir, file)
        );
      } catch (err) {
        console.warn(`[render] audio copy failed: ${file}:`, err.message);
      }
    }
    console.log('[render] audio copied:', fs.readdirSync(remotionAudioDir));
  } else {
    console.log('[render] no project audio directory found');
  }

  // ── 3. Build render scenes — copy images, emit bundle-server paths ─────────────
  const renderScenes = scenes.map(s => {
    const absImage = toAbsPath(s.image_path);
    const absAudio = toAbsPath(s.audio_path);

    let renderImagePath = null;
    if (absImage && fs.existsSync(absImage)) {
      const basename = path.basename(absImage);
      try {
        fs.copyFileSync(absImage, path.join(remotionAssetsDir, basename));
        renderImagePath = `/assets/${projectId}/${basename}`;
      } catch (err) {
        console.warn(`[render] image copy failed scene ${s.scene_id}:`, err.message);
      }
    }

    return {
      ...s,
      image_path: renderImagePath,
      audio_path: absAudio ? `/audio/${projectId}/${path.basename(absAudio)}` : null,
      overlays:   [],
    };
  });

  // ── 4. Build audioSpecs with bundle-server paths ───────────────────────────────
  const audioSpecs = renderScenes.map(scene => ({
    scene_id:  scene.scene_id,
    narration: scene.audio_path ? { url: scene.audio_path, volume: 1.0 } : null,
  }));

  console.log('[render] scenes:', renderScenes.length);
  console.log('[render] with narration:', audioSpecs.filter(s => s.narration).length);

  // ── 5. Prepare stock clips ─────────────────────────────────────────────────────
  // Proxy URLs are downloaded so headless Chrome can reach them without Express.
  // Local library clips are copied (the library route already syncs them, but copy
  // again to be safe). CDN URLs pass through unchanged.
  const renderClips = {};

  for (const [sceneId, clip] of Object.entries(selectedClips || {})) {
    if (!clip) { renderClips[sceneId] = null; continue; }

    const clipUrl = clip.url || '';

    if (clipUrl.includes('localhost') || clipUrl.includes('/api/stock/proxy')) {
      // ── Proxy URL: extract original CDN URL and download ──
      const originalUrl = clipUrl.includes('url=')
        ? decodeURIComponent(clipUrl.split('url=')[1].split('&')[0])
        : clipUrl;

      const destFilename = `clip_${sceneId}.mp4`;
      const destPath     = path.join(remotionClipsDir, destFilename);

      // Re-download if missing or empty (empty = previous partial download)
      const existingSize = fs.existsSync(destPath) ? fs.statSync(destPath).size : 0;
      if (existingSize > 0) {
        console.log(`[render] clip already cached: ${destFilename} (${existingSize} bytes)`);
      } else {
        if (existingSize === 0 && fs.existsSync(destPath)) {
          fs.unlinkSync(destPath); // remove empty file from prior failed attempt
        }
        try {
          console.log(`[render] downloading clip for scene ${sceneId} from ${originalUrl.slice(0, 80)}...`);
          await downloadFile(originalUrl, destPath);
          const dlSize = fs.existsSync(destPath) ? fs.statSync(destPath).size : 0;
          if (dlSize === 0) throw new Error('Download produced empty file');
          console.log(`[render] clip downloaded: ${destFilename} (${dlSize} bytes)`);
        } catch (err) {
          console.error(`[render] clip download FAILED for scene ${sceneId}:`, err.message);
          renderClips[sceneId] = null;
          continue;
        }
      }

      renderClips[sceneId] = { ...clip, url: `/clips/${destFilename}`, file: undefined };

    } else if (clip.file) {
      // ── Local library clip: copy to remotion/public/clips ──
      const absFile  = toAbsPath(clip.file);
      const basename = path.basename(absFile);
      const destPath = path.join(remotionClipsDir, basename);

      try {
        if (fs.existsSync(absFile)) {
          fs.copyFileSync(absFile, destPath);
          renderClips[sceneId] = { ...clip, url: `/clips/${basename}`, file: undefined };
        } else {
          console.warn(`[render] local clip not found on disk for scene ${sceneId}: ${absFile}`);
          renderClips[sceneId] = null;
        }
      } catch (err) {
        console.warn(`[render] local clip copy failed scene ${sceneId}:`, err.message);
        renderClips[sceneId] = null;
      }

    } else {
      // ── CDN URL: pass through — headless Chrome can reach it directly ──
      renderClips[sceneId] = clip;
    }
  }

  // ── Diagnostic log ────────────────────────────────────────────────────────────
  console.log('[render] remotion/public/audio:', fs.existsSync(remotionAudioDir)  ? fs.readdirSync(remotionAudioDir)  : 'MISSING');
  console.log('[render] remotion/public/assets:', fs.existsSync(remotionAssetsDir) ? fs.readdirSync(remotionAssetsDir).length + ' files' : 'MISSING');
  console.log('[render] remotion/public/clips:', fs.existsSync(remotionClipsDir)   ? fs.readdirSync(remotionClipsDir)   : 'MISSING');

  // ── 6. Write scenes.json ──────────────────────────────────────────────────────
  const renderProps = {
    scenes:        renderScenes,
    imagePaths:    {},
    selectedClips: renderClips,
    audioSpecs,
  };
  fs.writeFileSync(propsPath, JSON.stringify(renderProps, null, 2));

  const job = { proc: null, sseClients: new Set(), doneEvent: null };
  renderJobs.set(projectId, job);

  // ── 7. Respond, then spawn ─────────────────────────────────────────────────────
  // res.json() before spawn so the client can open the SSE connection without
  // waiting for the (potentially long-running) CLI process.
  res.json({ started: true });
  console.log('[render] spawning Remotion CLI...');

  const remotionPath = path.resolve(PROJECT_ROOT, 'remotion');
  // --concurrency=1  prevents Chrome race conditions on Windows
  // --overwrite      avoids "output file already exists" errors on retry
  const args = [
    'remotion', 'render',
    'src/index.jsx',
    'Documentary',
    outputPath,
    `--props=${propsPath}`,
    '--concurrency=1',
    '--overwrite',
  ];

  const proc = spawn('npx', args, {
    cwd:   remotionPath,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  job.proc = proc;

  const handleOutput = (data) => {
    const text = data.toString();
    const pct = text.match(/(\d+(?:\.\d+)?)%/);
    if (pct) broadcast(job, { type: 'progress', percent: Math.round(parseFloat(pct[1])) });
  };

  proc.stdout.on('data', handleOutput);
  proc.stderr.on('data', handleOutput);

  proc.on('close', (code) => {
    const fileExists = fs.existsSync(outputPath);
    console.log(`[render] close | code=${code} | file=${fileExists} | clients=${job.sseClients.size}`);

    if (code === 0 && fileExists) {
      const fileSize = fs.statSync(outputPath).size;
      console.log(`[render] done | fileSize=${fileSize}`);
      job.doneEvent = {
        type:       'done',
        outputPath: `/output/${projectId}/output/final.mp4`,
        fileSize,
      };
    } else {
      job.doneEvent = { type: 'error', message: `Render failed with exit code ${code}` };
    }

    broadcast(job, job.doneEvent);
    job.sseClients.forEach(r => { try { r.end(); } catch {} });
    job.sseClients.clear();
  });

  proc.on('error', (err) => {
    console.log(`[render] proc error: ${err.message}`);
    job.doneEvent = { type: 'error', message: err.message };
    broadcast(job, job.doneEvent);
    job.sseClients.forEach(r => { try { r.end(); } catch {} });
    job.sseClients.clear();
  });
});

// GET /api/render/progress/:projectId — SSE progress stream
router.get('/progress/:projectId', (req, res) => {
  const { projectId } = req.params;
  const job = renderJobs.get(projectId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (!job) {
    sendSSE(res, { type: 'error', message: 'No render job found for this project' });
    return res.end();
  }

  if (job.doneEvent) {
    sendSSE(res, job.doneEvent);
    return res.end();
  }

  job.sseClients.add(res);
  req.on('close', () => job.sseClients.delete(res));
});

// DELETE /api/render/:projectId — cancel
router.delete('/:projectId', (req, res) => {
  const { projectId } = req.params;
  const job = renderJobs.get(projectId);
  if (job) {
    try { job.proc?.kill(); } catch {}
    job.sseClients.forEach(r => { try { r.end(); } catch {} });
    job.sseClients.clear();
    renderJobs.delete(projectId);
  }
  res.json({ cancelled: true });
});

module.exports = router;
