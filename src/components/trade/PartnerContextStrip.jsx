import { AlertTriangle } from 'lucide-react'
import { Card, Badge, WinWindowBadge, cn } from '../ui'

// THE partner intelligence strip — the one-line read on a selected opponent
// (their needs / surpluses, pick capital, win window, mismatch warning), all
// from `rankTradePartners`. Shared by the Trade Analyzer (under its opponent
// selector) and Trade › Targets (under its team selector) so both tools carry
// the same context into the build. Never re-implement it locally.
//
//   <PartnerContextStrip partner={partnerInfo} />

const PICK_CAP_TEXT = {
  Rich:     'text-success',
  Depleted: 'text-danger',
  Neutral:  'text-text-secondary dark:text-text-secondary',
}

export default function PartnerContextStrip({ partner, className }) {
  if (!partner) return null

  return (
    <Card padding="px-3 py-2.5" className={cn('mb-4 flex flex-col gap-1.5', className)}>
      <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap">
        {partner.theirNeeds.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary">Needs</span>
            {partner.theirNeeds.map(pos => (
              <Badge key={pos} tone="danger" soft>{pos}</Badge>
            ))}
          </span>
        )}
        {partner.theirHaves.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary">Has</span>
            {partner.theirHaves.map(pos => (
              <Badge key={pos} tone="success" soft>{pos}</Badge>
            ))}
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary">Picks</span>
          <span className={`font-body text-[10px] font-semibold ${PICK_CAP_TEXT[partner.pickCapStatus] ?? PICK_CAP_TEXT.Neutral}`}>
            {partner.pickCapStatus}
          </span>
        </span>
        <WinWindowBadge tier={partner.winWindowTier} />
      </div>
      {partner.mismatchWarning && (
        <div className="flex items-start gap-1.5">
          <AlertTriangle size={11} strokeWidth={2} className="text-warning shrink-0 mt-0.5" />
          <span className="font-body text-[10px] text-warning leading-tight">{partner.mismatchWarning}</span>
        </div>
      )}
    </Card>
  )
}
