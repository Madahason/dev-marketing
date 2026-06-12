const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

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
    overlays: []
  }));

  const audioSpecs = scenes.map(scene => ({
    scene_id: scene.scene_id,
    narration: scene.audio_path ? { url: toHttpUrl(scene.audio_path), volume: 1.0 } : null,
  }));

  console.log('[render] scenes:', absoluteScenes.length);
  console.log('[render] with narration:', audioSpecs.filter(s => s.narration).length);
  console.log('[render] sample audio:', absoluteScenes[0]?.audio_path);

  const renderProps = {
    scenes: absoluteScenes,
    selectedClips: selectedClips || {},
    audioSpecs
  };

  fs.writeFileSync(propsPath, JSON.stringify(renderProps, null, 2));

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  send({ type: 'start', message: 'Render starting...' });

  const remotionPath = path.resolve(PROJECT_ROOT, 'remotion');
  const command = `npx remotion render src/index.jsx Documentary "${outputPath}" --props="${propsPath}"`;

  const proc = exec(command, { cwd: remotionPath });

  const handleOutput = (data) => {
    const text = data.toString();
    const pct = text.match(/(\d+(?:\.\d+)?)%/);
    if (pct) send({ type: 'progress', percent: Math.round(parseFloat(pct[1])) });
  };

  proc.stdout.on('data', handleOutput);
  proc.stderr.on('data', handleOutput);

  proc.on('close', (code) => {
    if (code === 0 && fs.existsSync(outputPath)) {
      const size = fs.statSync(outputPath).size;
      send({
        type: 'done',
        outputPath: `/output/${projectId}/output/final.mp4`,
        fileSizeMB: Math.round(size / 1024 / 1024 * 10) / 10
      });
    } else {
      send({ type: 'error', message: `Render failed with exit code ${code}` });
    }
    res.end();
  });

  proc.on('error', (err) => {
    send({ type: 'error', message: err.message });
    res.end();
  });
});

module.exports = router;
