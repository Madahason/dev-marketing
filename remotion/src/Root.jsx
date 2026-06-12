import { Composition } from 'remotion'
import { loadFont as loadInter }      from '@remotion/google-fonts/Inter'
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat'
import { loadFont as loadPlayfair }   from '@remotion/google-fonts/PlayfairDisplay'
import { loadFont as loadDMSans }     from '@remotion/google-fonts/DMSans'
import { loadFont as loadBebas }      from '@remotion/google-fonts/BebasNeue'
import { Documentary, calculateDocumentaryDuration } from './compositions/Documentary'

// Load all fonts once at module level — prevents the "too many requests" warning
// that occurs when overlay components each call loadFont() for the same family.
loadInter(     undefined, { ignoreTooManyRequestsWarning: true })
loadMontserrat(undefined, { ignoreTooManyRequestsWarning: true })
loadPlayfair(  undefined, { ignoreTooManyRequestsWarning: true })
loadDMSans(    undefined, { ignoreTooManyRequestsWarning: true })
loadBebas(     undefined, { ignoreTooManyRequestsWarning: true })
import AnimatedCounter from './components/AnimatedCounter'
import TimelineBar     from './components/TimelineBar'
import ComparisonChart from './components/ComparisonChart'
import QuoteCard       from './components/QuoteCard'
import MapHighlight    from './components/MapHighlight'
import { testScenes, testImagePaths, testSelectedClips } from './testData'

export const RemotionRoot = () => {
  return (
    <>
      {/* Main composition — wired to test data for Studio preview */}
      <Composition
        id="Documentary"
        component={Documentary}
        durationInFrames={calculateDocumentaryDuration(testScenes)}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          scenes:        testScenes,
          imagePaths:    testImagePaths,
          selectedClips: testSelectedClips,
        }}
        calculateMetadata={({ props }) => {
          const scenes = props.scenes?.length ? props.scenes : testScenes;
          return { durationInFrames: calculateDocumentaryDuration(scenes) };
        }}
      />

      {/* Individual template previews */}
      <Composition id="AnimatedCounter" component={AnimatedCounter} fps={30} width={1920} height={1080} durationInFrames={150}
        defaultProps={{ value: 3000000000, label: 'Revenue', prefix: '$' }} />

      <Composition id="TimelineBar" component={TimelineBar} fps={30} width={1920} height={1080} durationInFrames={150}
        defaultProps={{ title: 'Key Milestones', events: [
          { year: '1997', label: 'Founded' },
          { year: '2001', label: 'First Product' },
          { year: '2007', label: 'Breakthrough' },
          { year: '2012', label: 'Global Expansion' },
          { year: '2020', label: 'IPO' },
        ]}} />

      <Composition id="ComparisonChart" component={ComparisonChart} fps={30} width={1920} height={1080} durationInFrames={150}
        defaultProps={{ title: 'Market Share', unit: '%', items: [
          { label: 'Before', value: 12 },
          { label: 'After',  value: 67 },
        ]}} />

      <Composition id="QuoteCard" component={QuoteCard} fps={30} width={1920} height={1080} durationInFrames={150}
        defaultProps={{ text: 'This changes everything.', attribution: 'CEO, 2007', style: 'center' }} />

      <Composition id="MapHighlight" component={MapHighlight} fps={30} width={1920} height={1080} durationInFrames={150}
        defaultProps={{ region: 'Silicon Valley', lat: 37.4, lng: -122.0, label: 'Cupertino, CA' }} />
    </>
  )
}
