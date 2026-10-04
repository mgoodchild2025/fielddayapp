/**
 * "Payment outstanding" for a player who chose cash / e-transfer / cheque:
 * the amount owed and the organizer's instructions. Shown on the event page
 * (registered banner) and the registration success page, so the instructions
 * are never seen only once.
 */
export function PendingPaymentNotice({
  payment,
  instructions,
  className = 'mt-3',
}: {
  payment: { payment_method: string; amount_cents: number; currency: string }
  instructions: string | null
  className?: string
}) {
  const methodLabel =
    payment.payment_method === 'etransfer' ? 'e-transfer'
    : payment.payment_method === 'cheque' ? 'cheque'
    : 'cash'
  const amountFormatted =
    payment.amount_cents > 0
      ? `$${(payment.amount_cents / 100).toFixed(payment.amount_cents % 100 === 0 ? 0 : 2)} ${payment.currency.toUpperCase()}`
      : null

  return (
    <div className={`${className} rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-800`}>
      <p className="font-semibold">
        ⚠ Payment outstanding{amountFormatted ? ` — ${amountFormatted}` : ''}
      </p>
      <p className="mt-0.5 text-amber-700">
        You chose to pay by {methodLabel}. Your spot is reserved, but your registration won&apos;t be fully confirmed until your payment is received by the organiser.
      </p>
      {instructions && (
        <p className="mt-1.5 text-amber-700 whitespace-pre-wrap">{instructions}</p>
      )}
    </div>
  )
}
