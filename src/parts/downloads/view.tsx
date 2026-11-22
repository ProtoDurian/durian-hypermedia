// The downloads part's view (format version 11): a card per file with a type icon, the label, the file name, the size, a
// Download button, and the checksum as a short chip that copies the whole value, with how to check it. No tracking: the
// button is a plain link, and nothing is fetched. Every address goes through the host's urlPolicy.
import React from "react";
import type { PartViewProps } from "../types";
import { FILE_ICON, Icon, STR, useCopy, useMediaUrl } from "./media-ui";
import type { DownloadsSpec } from "./part";

const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;
function Sum({ algo, sum, name }: { algo: string; sum: string; name: string }) {
  const [done, copy] = useCopy();
  const cmd = `shasum -a ${algo === "sha256" ? 256 : 512} ${name}`;
  return (
    <div className="dl-sum" data-dh-slot="checksum">
      <button type="button" className="dl-chip" onClick={() => copy(sum)} aria-label={`${STR.copy} ${algo}: ${sum}`} title={sum}>
        <span className="dl-algo">{algo}</span><code>{short(sum)}</code><Icon n={done ? "check" : "copy"} size={15} />
      </button>
      <span className="dl-how">{done ? STR.copied : <>{STR.verify} <code>{cmd}</code></>}</span>
    </div>
  );
}
export default function DownloadsView({ data: spec }: PartViewProps<DownloadsSpec>) {
  const url = useMediaUrl();
  return (
    <div className="dl dh-media">
      {spec.title ? <p className="dl-title">{spec.title}</p> : null}
      <ul className="dl-list">
        {spec.files.map((f, i) => {
          const href = url(f.src);
          return (
            <li key={i} className="dl-card" data-dh-slot="file" data-icon={f.icon}>
              <span className="dl-icon" data-dh-slot="file-icon" aria-hidden="true"><Icon n={FILE_ICON[f.icon] ?? "other"} size={26} /></span>
              <div className="dl-main">
                <b className="dl-label">{f.label || f.name}</b>
                <span className="dl-meta"><span className="dl-name" data-dh-slot="file-name">{f.name}</span>{f.size ? <span className="dl-size" data-dh-slot="file-size">{f.size}</span> : null}</span>
                {f.note ? <span className="dl-note">{f.note}</span> : null}
                {f.sum ? <Sum algo={f.algo} sum={f.sum} name={f.name} /> : null}
              </div>
              {href ? (
                <a className="dl-btn" data-dh-slot="download" href={href} download rel="noreferrer" aria-label={`${STR.download} ${f.label || f.name}${f.size ? ` (${f.size})` : ""}`}><Icon n="dl" size={20} /><span>{STR.download}</span></a>
              ) : (
                <span className="dl-btn dl-off" role="note">{STR.addressRefused}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
