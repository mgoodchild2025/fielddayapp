'use client'

interface Props {
  leagueName: string
  priceCents: number
  onSelect: (role: 'captain' | 'player') => void
}

export function Step0RoleSelect({ leagueName, priceCents, onSelect }: Props) {
  const price = priceCents > 0 ? `$${(priceCents / 100).toFixed(0)}` : null

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border p-5">
        <h2 className="font-semibold text-lg mb-1">How are you registering?</h2>
        <p className="text-sm text-gray-500 mb-5">
          {price
            ? `This event charges ${price} per team. Captains handle payment for their whole roster.`
            : 'Tell us your role so we can guide you through the right steps.'}
        </p>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => onSelect('captain')}
            className="w-full text-left rounded-lg border-2 p-4 hover:border-current transition-colors group"
            style={{ borderColor: 'var(--brand-primary)' }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white text-lg mt-0.5"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                🏆
              </div>
              <div>
                <p className="font-semibold">I&apos;m a captain</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  I&apos;m registering my team.
                  {price && ` I'll pay the ${price} team fee after setting up my roster.`}
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelect('player')}
            className="w-full text-left rounded-lg border-2 border-gray-200 p-4 hover:border-gray-400 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0 text-lg mt-0.5">
                🙋
              </div>
              <div>
                <p className="font-semibold">I&apos;m a player</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  I have a team code, want to request to join a team, or I&apos;ll find one later.
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
