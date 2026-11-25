import { ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import type { Worker } from '../lib/api';
import { PortfolioImage } from './ui';

export function PortfolioGallery({ samples }: { samples: Worker['work_samples'] }) {
  const title = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [index, setIndex] = useState<number | null>(null);
  const current = index === null ? undefined : samples[index];

  function move(direction: number) {
    setIndex(previous => previous === null ? null : (previous + direction + samples.length) % samples.length);
  }

  function open(position: number, button: HTMLButtonElement) {
    trigger.current = button;
    setIndex(position);
    dialog.current?.showModal();
    closeButton.current?.focus();
  }

  return <>
    <div className="portfolio-grid credential-gallery">{samples.map((sample, position) =>
      <figure key={sample.image_url}>
        <button type="button" className="gallery-tile" aria-haspopup="dialog"
          aria-label={'Enlarge work sample ' + (position + 1) + (sample.caption ? ': ' + sample.caption : '')}
          onClick={event => open(position, event.currentTarget)}>
          <PortfolioImage path={sample.image_url} caption={sample.caption} />
          <span className="gallery-expand"><Maximize2 size={16} aria-hidden="true" /></span>
        </button>
        {sample.caption && <figcaption>{sample.caption}</figcaption>}
      </figure>,
    )}</div>
    <dialog ref={dialog} className="portfolio-dialog" aria-labelledby={title}
      onClose={() => { setIndex(null); trigger.current?.focus(); }}
      onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}
      onKeyDown={event => {
        if (samples.length < 2 || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
        event.preventDefault();
        move(event.key === 'ArrowLeft' ? -1 : 1);
      }}>
      <div className="portfolio-dialog-content">
        <header><h2 id={title}>Work sample</h2><button ref={closeButton} type="button" className="button secondary gallery-control"
          aria-label="Close work sample viewer" onClick={() => dialog.current?.close()}>
          <X size={19} aria-hidden="true" />
        </button></header>
        {current && <>
          <PortfolioImage key={current.image_url} path={current.image_url} caption={current.caption} eager />
          <footer>
            <div role="status" aria-atomic="true">
              <p className="gallery-count">{(index ?? 0) + 1} of {samples.length}</p>
              {current.caption && <p>{current.caption}</p>}
            </div>
            {samples.length > 1 && <div className="gallery-controls">
              <button className="button secondary gallery-control" type="button" aria-label="Previous sample" onClick={() => move(-1)}>
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              <button className="button secondary gallery-control" type="button" aria-label="Next sample" onClick={() => move(1)}>
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            </div>}
          </footer>
        </>}
      </div>
    </dialog>
  </>;
}
