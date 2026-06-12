const path      = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express   = require('express');
const cors      = require('cors');
const fs        = require('fs');
const { execSync } = require('child_process');

function checkDeps() {
  let ffmpeg = false;
  try { execSync('ffmpeg -version', { stdio: 'pipe' }); ffmpeg = true; } catch {}
  console.log(`[deps] ffmpeg: ${ffmpeg}`);
  return { ffmpeg };
}
const DEPS = checkDeps();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Serve generated project assets (images, audio, etc.)
app.use('/projects', express.static(path.join(__dirname, '../projects')));

// Ensure library/clips directory exists for the library API
const libraryClipsPath = path.resolve(__dirname, '..', 'library', 'clips');
if (!fs.existsSync(libraryClipsPath)) {
  fs.mkdirSync(libraryClipsPath, { recursive: true });
  console.log('[startup] created library/clips folder');
}

// /output serves the projects folder — clean URL for MP4 downloads
app.use('/output', express.static(path.join(__dirname, '../projects')));

// Confirm env loaded
const apiKeyLoaded = !!process.env.ANTHROPIC_API_KEY;
console.log(`ANTHROPIC_API_KEY loaded: ${apiKeyLoaded}`);

// Routes
app.use('/api/settings',  require('./routes/settings'));
app.use('/api/analyze',   require('./routes/analyze'));
app.use('/api/generate',  require('./routes/generate'));
app.use('/api/motion',    require('./routes/motion'));
app.use('/api/library',   require('./routes/library'));
app.use('/api/voiceover', require('./routes/voiceover'));
app.use('/api/render',    require('./routes/render'));
app.use('/api/stock',     require('./routes/stock'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', anthropic_key: apiKeyLoaded, deps: DEPS });
});

app.get('/api/deps', (req, res) => {
  res.json(DEPS);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`DevMarketing Flow server running on http://localhost:${PORT}`);
});
