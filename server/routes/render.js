const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// renderJobs: projectId -> { proc, sseClients: Set<res>, doneEvent: null | object }
const renderJobs = new Map();

// Resolve any URL/path form to an absolute Windows path.
// Handles: http://host/path, /root-relative, C:\absolute, relative
function toAbsPath(url) {
  if (!url) return null;
  const withoutHost = url.replace(/^https?:\/\/[^/]*/, '');
  if (/^[A-Z]:[\\\/]/i.test(withoutHost)) return withoutHost;
  return path.resolve(PROJECT_ROOT, withoutHost.replace(/^\//, '').replace(/\//g, path.sep));
}

// Download a remote file to dest, following redirects
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? require('https') : require('http');
    const file = fs.createWriteStream(dest);

    const request = proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlink(dest, () => {});
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => {});
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
    });

    request.on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
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
// Copies all assets into remotion/public/ so headless Chrome can reach them
// via the Remotion bundle server (no Express required during render).
router.post('/', async (req, res) => {
  const { projectId, scenes, selectedClips } = req.body;

  if (!projectId || !scenes?.length) {
    return res.status(400).json({ error: 'projectId and scenes required' });
  }

  const outputDir  = path.resolve(PROJECT_ROOT, 'projects', projectId, 'output');
  const propsPath  = path.resolve(PROJECT_ROOT, 'projects', projectId, 'scenes.json');
  const outputPath = path.join(outputDir, 'final.mp4');

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // ── 1. Prepare remotion/public asset directories ─────────────────────────────
  const remotionPublicDir = path.resolve(PROJECT_ROOT, 'remotion', 'public');
  const remotionAudioDir  = path.join(remotionPublicDir, 'audio', projectId);
  const remotionAssetsDir = path.join(remotionPublicDir, 'assets', projectId);
  const remotionClipsDir  = path.join(remotionPublicDir, 'clips');

  fs.mkdirSync(remotionAudioDir, { recursive: true });
  fs.mkdirSync(remotionAssetsDir, { recursive: true });
  fs.mkdirSync(remotionClipsDir, { recursive: true });

  // ── 2. Copy all audio files for this project ─────────────────────────────────
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
    console.log(`[render] audio copied: ${fs.readdirSync(remotionAudioDir).join(', ')}`);
  } else {
    console.log('[render] no project audio directory');
  }

  // ── 3. Build render scenes — copy images, use bundle-server paths ─────────────
  const renderScenes = scenes.map(s => {
    const absImage = toAbsPath(s.image_path);
    const absAudio = toAbsPath(s.audio_path);

    // Copy image into remotion/public/assets/{projectId}/
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

    // Audio path: bundle server serves /audio/{projectId}/{file}
    const renderAudioPath = absAudio
      ? `/audio/${projectId}/${path.basename(absAudio)}`
      : null;

    return {
      ...s,
      image_path: renderImagePath,
      audio_path: renderAudioPath,
      overlays:   [],
    };
  });

  // ── 4. Build audioSpecs with bundle-server paths ──────────────────────────────
  const audioSpecs = renderScenes.map(scene => ({
    scene_id:  scene.scene_id,
    narration: scene.audio_path ? { url: scene.audio_path, volume: 1.0 } : null,
  }));

  console.log('[render] scenes:', renderScenes.length);
  console.log('[render] with narration:', audioSpecs.filter(s => s.narration).length);

  // ── 5. Prepare stock clips — download proxy URLs, copy local files ────────────
  const renderClips = {};
  for (const [sceneId, clip] of Object.entries(selectedClips || {})) {
    if (!clip) { renderClips[sceneId] = null; continue; }

    const clipUrl = clip.url || '';

    if (clipUrl.includes('localhost') || clipUrl.includes('/api/stock/proxy')) {
      // Proxy URL — must download before render (Express not reachable from headless Chrome)
      const originalUrl = clipUrl.includes('url=')
        ? decodeURIComponent(clipUrl.split('url=')[1].split('&')[0])
        : clipUrl;
      const destPath = path.join(remotionClipsDir, `clip_${sceneId}.mp4`);

      try {
        if (!fs.existsSync(destPath)) {
          await downloadFile(originalUrl, destPath);
        }
        console.log(`[render] downloaded clip for scene ${sceneId}`);
        renderClips[sceneId] = { ...clip, url: `/clips/clip_${sceneId}.mp4`, file: undefined };
      } catch (err) {
        console.warn(`[render] clip download failed scene ${sceneId}:`, err.message);
        renderClips[sceneId] = null;
      }
    } else if (clip.file) {
      // Local library clip — copy into remotion/public/clips/
      const absFile   = toAbsPath(clip.file) || path.resolve(PROJECT_ROOT, 'library', 'clips', path.basename(clip.file));
      const destFile  = path.join(remotionClipsDir, path.basename(absFile));

      try {
        if (fs.existsSync(absFile)) {
          fs.copyFileSync(absFile, destFile);
          renderClips[sceneId] = { ...clip, url: `/clips/${path.basename(absFile)}`, file: undefined };
        } else {
          renderClips[sceneId] = clip;
        }
      } catch (err) {
        console.warn(`[render] local clip copy failed scene ${sceneId}:`, err.message);
        renderClips[sceneId] = clip;
      }
    } else {
      // CDN URL — public, accessible directly from headless Chrome
      renderClips[sceneId] = clip;
    }
  }

  console.log('[render] clips prepared:', Object.keys(renderClips).length);
  console.log('[render] audio in remotion/public:', fs.existsSync(remotionAudioDir) ? fs.readdirSync(remotionAudioDir) : 'NONE');
  console.log('[render] spawning Remotion CLI...');

  const renderProps = {
    scenes:        renderScenes,
    imagePaths:    {},
    selectedClips: renderClips,
    audioSpecs,
  };
  fs.writeFileSync(propsPath, JSON.stringify(renderProps, null, 2));

  const job = { proc: null, sseClients: new Set(), doneEvent: null };
  renderJobs.set(projectId, job);

  res.json({ started: true });

  const remotionPath = path.resolve(PROJECT_ROOT, 'remotion');
  const command = `npx remotion render src/index.jsx Documentary "${outputPath}" --props="${propsPath}"`;
  const proc = exec(command, { cwd: remotionPath });
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
