const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// SSE client registry: projectId -> Set of res objects
const sseClients = new Map();
// Active render processes: projectId -> child process
const renderProcs = new Map();

function toHttpUrl(filePath) {
  if (!filePath) return null;
  if (/^https?:\/\//.test(filePath)) return filePath;
  const rel = path.isAbsolute(filePath)
    ? path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/')
    : filePath.replace(/^\//, '');
  return `http://localhost:${process.env.PORT || 3001}/${rel}`;
}

function toAbsPath(url) {
  if (!url) return null;
  if (path.isAbsolute(url)) return url;
  if (url.match(/^[A-Z]:\\/i)) return url;
  return path.resolve(PROJECT_ROOT, url.replace(/^\//, '').replace(/\//g, path.sep));
}

function broadcast(projectId, data) {
  const clients = sseClients.get(projectId);
  if (!clients) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { /* client disconnected */ }
  }
}

function closeClients(projectId) {
  const clients = sseClients.get(projectId);
  if (clients) {
    for (const res of clients) { try { res.end(); } catch { /* already closed */ } }
    sseClients.delete(projectId);
  }
}

// POST /api/render — validate, write props, start render, return JSON immediately
router.post('/', async (req, res) => {
  const { projectId, scenes, selectedClips } = req.body;

  if (!projectId || !scenes?.length) {
    return res.status(400).json({ error: 'projectId and scenes required' });
  }

  const outputDir = path.resolve(PROJECT_ROOT, 'projects', projectId, 'output');
  const propsPath = path.resolve(PROJECT_ROOT, 'projects', projectId, 'scenes.json');
  const outputPath = path.join(outputDir, 'final.mp4');

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const absoluteScenes = scenes.map(s => ({
    ...s,
    image_path: toAbsPath(s.image_path),
    audio_path: toAbsPath(s.audio_path),
    overlays: [],
  }));

  const audioSpecs = scenes.map(scene => ({
    scene_id: scene.scene_id,
    narration: scene.audio_path ? { url: toHttpUrl(scene.audio_path), volume: 1.0 } : null,
  }));

  console.log('[render] scenes:', absoluteScenes.length);
  console.log('[render] with narration:', audioSpecs.filter(s => s.narration).length);
  console.log('[render] sample audio:', absoluteScenes[0]?.audio_path);

  const renderProps = { scenes: absoluteScenes, selectedClips: selectedClips || {}, audioSpecs };
  fs.writeFileSync(propsPath, JSON.stringify(renderProps, null, 2));

  // Initialise SSE client set before responding, so the EventSource that the
  // client opens immediately after this response can register without missing events.
  sseClients.set(projectId, new Set());

  res.json({ started: true });

  const remotionPath = path.resolve(PROJECT_ROOT, 'remotion');
  const command = `npx remotion render src/index.jsx Documentary "${outputPath}" --props="${propsPath}"`;
  const proc = exec(command, { cwd: remotionPath });
  renderProcs.set(projectId, proc);

  const handleOutput = (data) => {
    const text = data.toString();
    const pct = text.match(/(\d+(?:\.\d+)?)%/);
    if (pct) broadcast(projectId, { type: 'progress', percent: Math.round(parseFloat(pct[1])) });
  };

  proc.stdout.on('data', handleOutput);
  proc.stderr.on('data', handleOutput);

  proc.on('close', (code) => {
    renderProcs.delete(projectId);
    if (code === 0 && fs.existsSync(outputPath)) {
      const size = fs.statSync(outputPath).size;
      broadcast(projectId, {
        type: 'done',
        outputPath: `/output/${projectId}/output/final.mp4`,
        fileSize: size,
      });
    } else {
      broadcast(projectId, { type: 'error', message: `Render failed with exit code ${code}` });
    }
    closeClients(projectId);
  });

  proc.on('error', (err) => {
    renderProcs.delete(projectId);
    broadcast(projectId, { type: 'error', message: err.message });
    closeClients(projectId);
  });
});

// GET /api/render/progress/:projectId — SSE stream for render progress
router.get('/progress/:projectId', (req, res) => {
  const { projectId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (!sseClients.has(projectId)) {
    sseClients.set(projectId, new Set());
  }
  sseClients.get(projectId).add(res);

  req.on('close', () => {
    const clients = sseClients.get(projectId);
    if (clients) clients.delete(res);
  });
});

// DELETE /api/render/:projectId — cancel in-progress render
router.delete('/:projectId', (req, res) => {
  const { projectId } = req.params;
  const proc = renderProcs.get(projectId);
  if (proc) {
    proc.kill();
    renderProcs.delete(projectId);
  }
  closeClients(projectId);
  res.json({ cancelled: true });
});

module.exports = router;
