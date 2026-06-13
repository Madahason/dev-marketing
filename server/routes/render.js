const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// renderJobs: projectId -> { proc, sseClients: Set<res>, doneEvent: null | object }
const renderJobs = new Map();

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

function sendSSE(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcast(job, data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of job.sseClients) {
    try { res.write(payload); } catch { /* client disconnected */ }
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

  const job = { proc: null, sseClients: new Set(), doneEvent: null };
  renderJobs.set(projectId, job);

  // Respond with JSON before starting the process so the client can open the SSE
  // connection without risking a race against early progress events.
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
      console.log(`[render] done | fileSize=${fileSize} | broadcasting to ${job.sseClients.size} client(s)`);
      job.doneEvent = {
        type: 'done',
        outputPath: `/output/${projectId}/output/final.mp4`,
        fileSize,
      };
    } else {
      console.log(`[render] error | code=${code}`);
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

// GET /api/render/progress/:projectId — SSE stream for render progress
// If the render already finished, the stored doneEvent is sent immediately so
// reconnecting clients (e.g. after a network blip) always get the final state.
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

// DELETE /api/render/:projectId — cancel in-progress render
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
