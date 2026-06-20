import { ExternalLink, User } from 'lucide-react'
import { relativeTime } from '../../hooks/usePlayerIntel'
import { POS_TEXT } from '../../utils/positionColors'
import { Sheet, SheetHeader, Button } from '../ui'

// Bottom-sheet reader for a news item. Full articles can't be embedded
// (sources block cross-origin framing), so the sheet shows everything the
// feed carries — headline, the stored story text, source/time — plus a
// "Read full article" link when the pipeline captured one (opens in iOS's
// in-app Safari sheet from the home-screen app). Layers above the
// PlayerProfileDrawer (z-50), so news inside a profile can open on top.
//
// All the sheet mechanics (scroll-lock, swipe-to-dismiss, escape, overlay tap,
// safe-area padding) come from the shared <Sheet> primitive.
export default function NewsArticleSheet({ article, onClose, onViewPlayer = null }) {
  const player = article.player ?? null
  const meta = [article.source, relativeTime(article.published)].filter(Boolean).join(' · ')

  return (
    <Sheet onClose={onClose} zIndex="z-[60]" label="News article">
      <SheetHeader title={article.headline} eyebrow={meta} onClose={onClose} closeLabel="Close article">
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
      </SheetHeader>

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
          <Button as="a" href={article.link} target="_blank" rel="noopener noreferrer"
            size="lg" fullWidth icon={<ExternalLink size={15} strokeWidth={2} />} iconRight>
            Read full article{article.source ? ` at ${article.source}` : ''}
          </Button>
        )}

        {onViewPlayer && player && (
          <Button variant="secondary" size="lg" fullWidth onClick={() => onViewPlayer(player)}
            icon={<User size={15} strokeWidth={2} />}>
            View {player.name}'s profile
          </Button>
        )}
      </div>
    </Sheet>
  )
}
