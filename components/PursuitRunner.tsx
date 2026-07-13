"use client";
import { CSSProperties, forwardRef } from "react";

// THE PURSUIT — the Runner (placeholder geometry).
//
// One runner component, zero per-team variants: the runner is design language,
// not a mascot. Pose is a single `data-pose` attribute that drives SVG group
// visibility via CSS (see globals.css). White core / purple edge. The SVG paths
// are the approved placeholder proportions from the prototype; Fable art can
// replace this component wholesale without any layout change — the board only
// ever sets `pose`, position and the moving/sprinting/falling classes.

export type RunnerPose = "idle" | "ready" | "run" | "stumble" | "seated" | "victory";

export const PursuitRunner = forwardRef<HTMLDivElement, { pose: RunnerPose; className?: string; style?: CSSProperties }>(
  function PursuitRunner({ pose, className, style }, ref) {
    return (
      <div ref={ref} className={"pu-runner" + (className ? " " + className : "")} data-pose={pose} style={style}>
        <svg viewBox="0 0 100 100" aria-hidden="true">
        <g className="p-idle">
          <path className="core" d="M47 8 L56 6 L59 14 L50 17 Z" />
          <path className="core" d="M44 20 L59 24 L55 52 L42 48 Z" />
          <path className="edge" d="M44 24 L36 44 L41 46 L48 30 Z" />
          <path className="edge" d="M57 27 L63 45 L58 47 L53 31 Z" />
          <path className="core" d="M43 48 L50 50 L42 92 L35 90 Z" />
          <path className="core" d="M52 50 L59 52 L55 92 L48 90 Z" />
        </g>
        <g className="p-ready">
          <path className="core" d="M62 26 L71 24 L73 32 L64 34 Z" />
          <path className="core" d="M38 52 L62 34 L68 42 L46 60 Z" />
          <path className="edge" d="M60 40 L74 50 L70 55 L58 46 Z" />
          <path className="edge" d="M44 52 L30 60 L33 65 L46 58 Z" />
          <path className="core" d="M42 58 L50 62 L34 82 L27 77 Z" />
          <path className="core" d="M30 80 L36 84 L58 92 L56 97 L26 88 Z" />
        </g>
        <g className="p-run">
          <path className="core" d="M60 12 L69 10 L72 18 L63 20 Z" />
          <path className="core" d="M42 30 L62 22 L67 44 L48 50 Z" />
          <path className="edge" d="M60 26 L76 34 L72 40 L58 33 Z" />
          <path className="edge" d="M46 34 L30 28 L28 34 L44 40 Z" />
          <path className="core" d="M50 48 L60 50 L76 70 L69 76 Z" />
          <path className="edge" d="M70 74 L77 68 L88 76 L84 82 Z" />
          <path className="core" d="M46 50 L54 54 L34 74 L27 68 Z" />
          <path className="edge" d="M30 72 L36 77 L24 92 L17 87 Z" />
        </g>
        <g className="p-stumble">
          <path className="core" d="M66 24 L75 24 L76 32 L67 32 Z" />
          <path className="core" d="M44 40 L66 28 L72 46 L52 56 Z" />
          <path className="edge" d="M64 34 L80 46 L75 52 L62 42 Z" />
          <path className="edge" d="M50 42 L38 52 L43 57 L53 48 Z" />
          <path className="core" d="M52 54 L62 56 L58 84 L50 82 Z" />
          <path className="core" d="M48 56 L54 60 L34 76 L28 70 Z" />
        </g>
        <g className="p-seated">
          <path className="core" d="M46 34 L55 32 L58 40 L49 42 Z" />
          <path className="core" d="M44 46 L58 48 L56 70 L42 68 Z" />
          <path className="edge" d="M56 52 L68 60 L64 65 L54 58 Z" />
          <path className="core" d="M44 68 L56 70 L78 82 L76 89 L42 76 Z" />
          <path className="edge" d="M42 70 L48 72 L46 92 L38 91 Z" />
        </g>
        <g className="p-victory">
          <path className="core" d="M46 14 L55 12 L58 20 L49 22 Z" />
          <path className="core" d="M43 26 L59 28 L56 54 L44 52 Z" />
          <path className="edge" d="M45 28 L33 8 L39 5 L50 24 Z" />
          <path className="edge" d="M57 28 L67 7 L73 10 L61 26 Z" />
          <path className="core" d="M44 52 L51 54 L44 92 L37 91 Z" />
          <path className="core" d="M53 54 L60 54 L58 92 L51 92 Z" />
          </g>
        </svg>
      </div>
    );
  }
);
