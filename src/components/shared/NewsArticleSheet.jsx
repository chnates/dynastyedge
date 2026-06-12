import { useEffect, useRef } from 'react'
import { X, ExternalLink, User } from 'lucide-react'
import { relativeTime } from '../../hooks/usePlayerIntel'
import { useScrollLock } from '../../hooks/useScrollLock'
import { POS_TEXT } from '../../utils/positionColors'

// Bottom-sheet reader for a news item. Full articles can't be embedded
// (sources block cross-origin framing), so the sheet shows everything the
// feed carries — headline, the stored story text, source/time — plus a
// "Read full article" link when the pipeline captured one (opens in iOS's
// in-app Safari sheet from the home-screen app). Layers above the
// PlayerProfileDrawer (z-50), so news inside a profile can open on top.
export default function NewsArticleSheet({ article, onClose, onViewPlayer = null }) {
  const overlayRef = useRef(null)

  useScrollLock()

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose()
  }

  const player = article.player ?? null
  const meta = [article.source, relativeTime(article.published)].filter(Boolean).join(' · ')

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[60] flex items-end bg-black/60"
    >
      <div className="w-full bg-bg-secondary rounded-t-2xl border-t border-border-default">
        <div
          className="max-h-[85vh] overflow-y-auto"
          style={{ overscrollBehavior: 'contain', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {/* Handle bar */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-border-default" />
          </div>

          {/* Header */}
          <div className="flex items-start justify-between px-4 pt-2 pb-3 border-b border-border-default">
            <div className="flex-1 min-w-0 pr-3">
              {meta && (
                <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                  {meta}
                </p>
              )}
              <h2 className="font-display text-xl font-bold uppercase tracking-wide text-text-primary mt-1 leading-tight">
                {article.headline}
              </h2>
              {player && (
                <p className="font-body text-xs text-text-secondary mt-1.5">
                  Tagged to{' '}
                  <span className="font-semibold text-text-primary">{player.name}</span>
                  {player.position && (
                    <span className={`font-semibold uppercase ml-1 ${POS_TEXT[player.position] ?? 'text-text-tertiary'}`}>
                      {player.position}
                    </span>
                  )}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close article"
              className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>

          <div className="px-4 pb-6 pt-3 flex flex-col gap-3">
            {article.story ? (
              <p className="font-body text-sm text-text-primary leading-relaxed">
                {article.story}
              </p>
            ) : (
              <p className="font-body text-sm text-text-tertiary italic">
                No summary available for this story.
              </p>
            )}

            {/* Roundup note: multi-player articles are tagged to everyone mentioned */}
            {player && article.athleteIds?.length > 2 && (
              <p className="font-body text-[11px] text-text-tertiary leading-snug">
                This is a multi-player story — {player.name} is mentioned in the
                full article, which may lead with a different player.
              </p>
            )}

            {article.link && (
              <a
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-accent text-white font-body font-semibold text-sm active:opacity-80 transition-opacity"
              >
                Read full article{article.source ? ` at ${article.source}` : ''}
                <ExternalLink size={15} strokeWidth={2} />
              </a>
            )}

            {onViewPlayer && player && (
              <button
                onClick={() => onViewPlayer(player)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-border-default font-body font-semibold text-sm text-text-primary active:opacity-70 transition-opacity"
              >
                <User size={15} strokeWidth={2} />
                View {player.name}'s profile
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
