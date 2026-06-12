const router = require('express').Router();
const Anthropic = require('@anthropic-ai/sdk');

// CRITICAL: This prompt must produce React.createElement code — NO JSX, NO imports.
// The generated code is evaluated at runtime inside a Function constructor which
// cannot parse JSX syntax. All Remotion/React primitives are injected as variables.
const SYSTEM_PROMPT = `You are a Remotion component generator for a documentary video app.

Generate a single self-contained React component for a video scene.

CRITICAL FORMAT RULES — READ CAREFULLY:
1. Do NOT include any import statements. All dependencies are pre-injected as variables.
2. Do NOT use JSX angle-bracket syntax. Use React.createElement() for ALL rendering.
   BAD:  <AbsoluteFill style={{background:'#0a0a0a'}}><div>Hello</div></AbsoluteFill>
   GOOD: React.createElement(AbsoluteFill, {style:{background:'#0a0a0a'}}, React.createElement('div', null, 'Hello'))
3. Available variables (already in scope — do NOT import them):
   - React, useState, useEffect, useRef, useMemo
   - useCurrentFrame, useVideoConfig, interpolate, spring, AbsoluteFill
   - durationInFrames  ← the REAL scene length in frames — USE THIS, never hardcode
   - fps               ← frames per second (always 30)
4. Define your component as: const SceneComponent = () => { ... }
5. The LAST line of your code MUST be: return SceneComponent;
   Do NOT use: export default SceneComponent

COMPONENT REQUIREMENTS:
- Use useCurrentFrame() and interpolate() for animation
- CRITICAL: Use durationInFrames in ALL interpolate() frame ranges, e.g.:
    interpolate(frame, [0, durationInFrames], [startValue, endValue], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  Never write hardcoded numbers like [0, 150] or [0, 300] — the actual scene
  duration varies and hardcoded values cause animation freeze or snap at cuts.
- Use the dark cinematic palette: background #0a0a0a, text #f0f0f0, accent #3b82f6
- Match the mood and content of the script excerpt
- Create visually compelling motion graphics (counters, quotes, timelines, charts, etc.)

Return ONLY the JavaScript code. No markdown fences, no explanation.`;

// Strip any import lines or export default that Claude adds despite instructions
function postProcess(code) {
  return code
    .replace(/^import\s+[^\n]+from\s+['"][^'"]+['"];?\s*/gm, '')
    .replace(/^export default\s+/m, 'return ')
    .trim()
}

router.post('/', async (req, res) => {
  const { scene_id, script_excerpt, mood, shot_type } = req.body;

  if (!scene_id || !script_excerpt) {
    return res.status(400).json({ error: 'scene_id and script_excerpt are required' });
  }

  const client = new Anthropic();

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Scene ID: ${scene_id}
Script excerpt: ${script_excerpt}
Mood: ${mood || 'neutral'}
Shot type: ${shot_type || 'motion_graphic'}

Generate the Remotion component for this scene. Remember: React.createElement only, no JSX, no imports, end with "return SceneComponent;"`,
      }],
    });

    let component_code = message.content[0].text.trim();

    // Strip markdown fences if Claude added them despite instructions
    component_code = component_code
      .replace(/^```(?:jsx?|javascript|tsx?)?\n?/im, '')
      .replace(/\n?```\s*$/im, '')
      .trim();

    // Strip any imports or export default Claude accidentally included
    component_code = postProcess(component_code);

    console.log(`[motion] scene ${scene_id} component generated (${component_code.length} chars)`);
    res.json({ scene_id, component_code });
  } catch (err) {
    console.error('[motion] Claude error:', err.message);
    res.status(500).json({ error: `Component generation failed: ${err.message}` });
  }
});

module.exports = router;
