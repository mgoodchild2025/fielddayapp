export const MAX_MESSAGE_CHARS = 100

export const EMAIL_TIMING_OPTIONS = [
  { hours: 4,  label: '4 hours before game (same day)' },
  { hours: 12, label: '12 hours before game (morning of)' },
  { hours: 24, label: '24 hours before game (night before)' },
  { hours: 48, label: '48 hours before game (two days before)' },
]

export const TIMING_OPTIONS = [
  { minutes: 15,   label: '15 minutes before' },
  { minutes: 30,   label: '30 minutes before' },
  { minutes: 60,   label: '1 hour before' },
  { minutes: 120,  label: '2 hours before' },
  { minutes: 180,  label: '3 hours before' },
  { minutes: 360,  label: '6 hours before' },
  { minutes: 720,  label: '12 hours before' },
  { minutes: 1440, label: '24 hours before' },
]

export const DEFAULT_MESSAGES: Record<number, string> = {
  15:   "Your game starts in 15 minutes!",
  30:   "Your game starts in 30 minutes.",
  60:   "Your game is in 1 hour. Time to warm up!",
  120:  "Your game is in 2 hours.",
  180:  "Your game is in 3 hours.",
  360:  "Your game is in 6 hours.",
  720:  "Your game is tonight!",
  1440: "Your game is tomorrow. See you there!",
}
