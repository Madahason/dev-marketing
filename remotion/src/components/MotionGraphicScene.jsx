import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion'
import AnimatedCounter from './AnimatedCounter'
import TimelineBar     from './TimelineBar'
import ComparisonChart from './ComparisonChart'
import QuoteCard       from './QuoteCard'
import MapHighlight    from './MapHighlight'

const TEMPLATE_MAP = { AnimatedCounter, TimelineBar, ComparisonChart, QuoteCard, MapHighlight }

// Strip any import lines and turn `export default` → `return` so the code
// can be evaluated inside a Function constructor.
function prepareForEval(code) {
  return code
    .replace(/^import\s+[^\n]+from\s+['"][^'"]+['"];?\s*/gm, '')
    .replace(/^export default\s+/m, 'return ')
    // Strip TypeScript `this` parameter annotations: fn(this: any, x) → fn(x)
    .replace(/\(\s*this\s*:[^,)]+,?\s*/g, '(')
    .replace(/\(\s*this\s*\)/g, '()')
    // Strip remaining type annotations that new Function() can't parse
    .replace(/:\s*(string|number|boolean|any|void|never|object|unknown|React\.FC[^,);\s]*)\b/g, '')
    .trim()
}

// Dynamically evaluates scene.motion_component code (React.createElement, no JSX).
// Falls back to template dispatch when no motion_component is present.
export function MotionGraphicScene({ scene }) {
  const { durationInFrames, fps } = useVideoConfig()
  const componentCode = scene.motion_component

  if (componentCode) {
    try {
      const evalCode = prepareForEval(componentCode)

      // Inject all Remotion / React primitives the generated code may use.
      // durationInFrames and fps are injected so generated code never hardcodes frame counts.
      const factory = new Function(
        'React',
        'useState', 'useEffect', 'useRef', 'useMemo',
        'useCurrentFrame', 'useVideoConfig',
        'interpolate', 'spring',
        'AbsoluteFill',
        'durationInFrames', 'fps',
        evalCode
      )

      const Component = factory(
        React,
        useState, useEffect, useRef, useMemo,
        useCurrentFrame, useVideoConfig,
        interpolate, spring,
        AbsoluteFill,
        durationInFrames, fps
      )

      if (typeof Component !== 'function') {
        throw new Error('Generated code did not return a function component')
      }

      return <Component />

    } catch (err) {
      console.error('[MotionGraphicScene] eval error scene', scene.scene_id, ':', err.message)
      return (
        <AbsoluteFill style={{
          backgroundColor: '#1a0808',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 12,
        }}>
          <div style={{ color: '#ef4444', fontSize: 16, fontFamily: 'sans-serif' }}>
            Component error
          </div>
          <div style={{
            color: 'rgba(255,255,255,0.4)', fontSize: 12,
            maxWidth: 560, textAlign: 'center', fontFamily: 'sans-serif',
          }}>
            {err.message.slice(0, 200)}
          </div>
          <div style={{
            color: 'rgba(255,255,255,0.18)', fontSize: 10, fontFamily: 'monospace',
          }}>
            scene {scene.scene_id} — click &quot;Rebuild Components&quot; to regenerate
          </div>
        </AbsoluteFill>
      )
    }
  }

  // Template fallback — used when no custom component has been built yet
  const Template = TEMPLATE_MAP[scene.motion_graphic_type]
  if (Template) return <Template {...(scene.motion_graphic_props || {})} />

  return (
    <AbsoluteFill style={{
      backgroundColor: '#0a0a0a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 18, fontFamily: 'sans-serif' }}>
        {scene.motion_graphic_type
          ? `Template: ${scene.motion_graphic_type}`
          : 'No component built — use Build Component'}
      </div>
    </AbsoluteFill>
  )
}
