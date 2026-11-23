// This package is the source of this file: edit it here. It began as a copy of the private prototype's composed stage (0.7.0).
// Shared, paint-only box tone flags; each block keeps its own geometry and grammar.
import {StageError} from './stage-core';
export const BOX_TONES={'[good]':'good','[bad]':'bad','[warn]':'warn','[accent]':'acc'} as const;
export function boxTone(text:string,line:number):{text:string;tone?:string}{
 const m=/\s*(\[[^\]]+\])$/.exec(text);if(!m)return{text};
 const tone=BOX_TONES[m[1] as keyof typeof BOX_TONES];if(!tone)throw new StageError(line,'a box tone is [good], [bad], [warn] or [accent]');
 const rest=text.slice(0,m.index).trimEnd();if(/\[[^\]]+\]$/.test(rest))throw new StageError(line,'a box takes one tone');return{text:rest,tone};
}
