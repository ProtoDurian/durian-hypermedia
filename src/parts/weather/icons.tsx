// The weather part's own sky icons: small SVG drawings, nothing fetched. The colours are tokens; the motion is slow and
// stops under reduced motion, `data-dh-motion="off"` and static.
import React from "react";
import { SKY_WORDS, type Sky } from "./units";

export function SkyIcon({ sky }: { sky: Sky }) {
  const cloud = (dy = 0, cls = "wx-cloud") => <path className={cls} transform={`translate(0 ${dy})`} d="M14 33h20a7 7 0 0 0 0-14 10 10 0 0 0-19-2 8 8 0 0 0-1 16z" />;
  const sun = (cx: number, cy: number, r: number) => (
    <g className="wx-sunb" style={{ transformOrigin: `${cx}px ${cy}px` }}>
      <g className="wx-rays" style={{ transformOrigin: `${cx}px ${cy}px` }}>{Array.from({ length: 8 }, (_, k) => <line key={k} x1={cx} y1={cy - r - 3} x2={cx} y2={cy - r - 7} transform={`rotate(${k * 45} ${cx} ${cy})`} />)}</g>
      <circle className="wx-disc" cx={cx} cy={cy} r={r} />
    </g>
  );
  let inner: React.ReactNode;
  switch (sky) {
    case "sun": inner = sun(24, 24, 9); break;
    case "clear-night": inner = <><path className="wx-moon" d="M31 9a15 15 0 1 0 9 26 13 13 0 0 1-9-26z" /><circle className="wx-star" cx="12" cy="12" r="1.6" /><circle className="wx-star" cx="38" cy="14" r="1.2" /></>; break;
    case "partly": inner = <>{sun(17, 17, 6.5)}{cloud(4)}</>; break;
    case "cloud": inner = cloud(0); break;
    case "fog": inner = <>{cloud(-4, "wx-cloud is-pale")}<g className="wx-fog"><line x1="10" y1="32" x2="38" y2="32" /><line x1="14" y1="38" x2="42" y2="38" /><line x1="10" y1="44" x2="34" y2="44" /></g></>; break;
    case "drizzle": inner = <>{cloud(-6)}<g className="wx-drops is-light">{[16, 24, 32].map((x, k) => <line key={x} x1={x} y1="38" x2={x - 2} y2="43" style={{ animationDelay: `${k * 0.3}s` }} />)}</g></>; break;
    case "rain": inner = <>{cloud(-6)}<g className="wx-drops">{[15, 24, 33].map((x, k) => <line key={x} x1={x} y1="37" x2={x - 3} y2="45" style={{ animationDelay: `${k * 0.25}s` }} />)}</g></>; break;
    case "storm": inner = <>{cloud(-6, "wx-cloud is-dark")}<polygon className="wx-bolt" points="26,31 19,42 24,42 21,50 31,38 25.5,38" /></>; break;
    case "snow": inner = <>{cloud(-6)}<g className="wx-flakes">{[15, 24, 33].map((x, k) => <circle key={x} cx={x} cy={41 + (k % 2) * 3} r="2" style={{ animationDelay: `${k * 0.4}s` }} />)}</g></>; break;
    case "sleet": inner = <>{cloud(-6)}<g className="wx-drops"><line x1="16" y1="37" x2="13" y2="45" /><line x1="32" y1="37" x2="29" y2="45" /></g><g className="wx-flakes"><circle cx="24" cy="43" r="2" /></g></>; break;
    case "hail": inner = <>{cloud(-6, "wx-cloud is-dark")}<g className="wx-hail">{[15, 24, 33].map((x, k) => <circle key={x} cx={x} cy={41 + (k % 2) * 4} r="2.4" style={{ animationDelay: `${k * 0.2}s` }} />)}</g></>; break;
    case "wind": inner = <g className="wx-wind"><path d="M6 18h22a5 5 0 1 0-5-5" /><path d="M6 27h30a5 5 0 1 1-5 5" /><path d="M6 36h16a4 4 0 1 1-4 4" /></g>; break;
  }
  return <svg className={`wx-icon wx-s-${sky}`} viewBox="0 0 48 48" width="44" height="44" role="img" aria-label={SKY_WORDS[sky]}>{inner}</svg>;
}
