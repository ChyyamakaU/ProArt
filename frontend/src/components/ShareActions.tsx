import { Link2, Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export function ShareActions({ url, title }: { url: string; title: string }) {
  const [message, setMessage] = useState('');
  const [manualCopy, setManualCopy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (manualCopy) input.current?.focus();
  }, [manualCopy]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setManualCopy(false);
      setMessage('Link copied.');
    } catch {
      setManualCopy(true);
      setMessage('Copy the link below to share this Trust Card.');
    }
  }

  async function shareLink() {
    setSharing(true);
    try {
      await navigator.share({ title, url });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) await copyLink();
    } finally {
      setSharing(false);
    }
  }

  return <div className="share-actions">
    <div className="share-buttons">
      {typeof navigator.share === 'function' && <button className="button secondary" type="button" disabled={sharing}
        onClick={() => void shareLink()}><Share2 size={18} aria-hidden="true" /> Share</button>}
      <button className="button secondary" type="button" onClick={() => void copyLink()}><Link2 size={18} aria-hidden="true" /> Copy link</button>
    </div>
    <span className="share-feedback" role="status" aria-atomic="true">{message}</span>
    {manualCopy && <input ref={input} className="share-input" aria-label="Trust Card link" value={url} readOnly onFocus={event => event.target.select()} />}
  </div>;
}
