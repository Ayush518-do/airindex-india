/**
 * Procedural clouds from SVG fractal noise.
 *
 * feTurbulence(fractalNoise) is the closest thing to real cloud structure that
 * can be produced without a photograph — it has the same self-similar wispy
 * detail at every scale, which gradient blobs never get. The noise is rasterised
 * once and only the wrapper's transform animates, so the filter never re-runs
 * during the flight.
 *
 * `bias` sets coverage (higher = more sky showing through), `detail` the octave
 * count, `freq` the scale of the billows.
 */
export default function CloudLayer({
  id, freq = '0.006 0.013', detail = 5, seed = 2, bias = 0.42, tint = '#ffffff', className, style,
}: {
  id: string;
  freq?: string;
  detail?: number;
  seed?: number;
  bias?: number;
  tint?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg className={className} style={style} preserveAspectRatio="none" viewBox="0 0 1000 400" aria-hidden>
      <defs>
        <filter id={`${id}-f`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={detail} seed={seed} result="noise" />
          {/* luminance of the noise becomes alpha; the bias carves sky out of it */}
          <feColorMatrix
            in="noise" type="matrix"
            values={`0 0 0 0 1
                     0 0 0 0 1
                     0 0 0 0 1
                     1.6 0 0 0 ${-bias}`}
            result="shaped"
          />
          {/* Steepen the alpha ramp: without this the noise stays evenly
              translucent and reads as fog. The hard transfer carves it into
              distinct masses with sky between them. */}
          <feComponentTransfer in="shaped" result="massed">
            <feFuncA type="linear" slope="4.2" intercept="-0.55" />
          </feComponentTransfer>
          {/* soften the cut edges so billows read as vapour, not paper */}
          <feGaussianBlur in="massed" stdDeviation="1.6" />
        </filter>

        {/* concentrate cloud toward the deck and fade it out toward open sky */}
        {/* SVG masks are luminance-based: white keeps, black cuts. */}
        <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000" />
          <stop offset="30%" stopColor="#555" />
          <stop offset="62%" stopColor="#ddd" />
          <stop offset="100%" stopColor="#fff" />
        </linearGradient>
        <mask id={`${id}-m`}>
          <rect width="1000" height="400" fill={`url(#${id}-fade)`} />
        </mask>
      </defs>

      <g mask={`url(#${id}-m)`}>
        <rect width="1000" height="400" filter={`url(#${id}-f)`} fill={tint} />
      </g>
    </svg>
  );
}
