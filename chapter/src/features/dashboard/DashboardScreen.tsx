import { Screen } from '../../components/Screen'
import { LinkButton } from '../../components/Button'
import { Card } from '../../components/Card'
import { Cover } from '../../components/Cover'
import { ProgressBar } from '../../components/ProgressBar'
import { StreakNumber } from '../../components/StreakNumber'
import { useLive } from '../../lib/useLive'
import { getSettings, readingDays, reviewSessionDays, todaysBook } from '../../db/queries'
import { daysWithNothingDue, tonightsQueue } from '../../db/reviews'
import { readingStreak, reviewStreak } from '../../lib/streaks'
import { hasMeasurableProgress, percentLabel, progressLabel } from '../../lib/format'
import { addDays, todayKey } from '../../lib/day'
import { hrefFor } from '../../lib/router'

/**
 * The front door. One glance answers "what do I do now" and "is today done".
 * Everything else is one tap away and nothing competes with the primary action.
 */
export function DashboardScreen() {
  const today = todayKey(new Date())
  const book = useLive(() => todaysBook(), [])
  const logDays = useLive(() => readingDays(), [])
  const sessionDays = useLive(() => reviewSessionDays(), [])
  const exemptDays = useLive(() => daysWithNothingDue(addDays(today, -120), today), [today])
  const queue = useLive(async () => {
    const settings = await getSettings()
    return tonightsQueue(today, settings?.reviewCap ?? 5)
  }, [today])

  const settings = useLive(() => getSettings(), [])

  // exemptDays is part of the answer, not an embellishment: without it a streak
  // currently bridged by a nothing-due night renders as 0 and then jumps.
  if (
    logDays === undefined ||
    sessionDays === undefined ||
    queue === undefined ||
    exemptDays === undefined
  ) {
    return <Screen>{null}</Screen>
  }

  const reading = readingStreak(logDays, today)
  const review = reviewStreak(sessionDays, today, exemptDays)
  // What tonight will actually serve — the cap is for the night, not the
  // session, so this is zero once the allowance is spent.
  const due = queue.queue.length
  // Recall is a NIGHT ritual: retrieval before sleep is the point, and the dark
  // screen is the signal. Before the switchover hour the count is stated but
  // the app does not push you into it.
  const isNight = new Date().getHours() >= (settings?.darkFromHour ?? 19)
  const offerRecall = due > 0 && isNight
  const recallIsPrimary = reading.doneToday && offerRecall

  return (
    <Screen
      action={
        <a
          href={hrefFor({ name: 'settings' })}
          className="text-sm text-ink-quiet min-h-11 flex items-center"
        >
          Settings
        </a>
      }
      footer={
        <div className="space-y-2">
          {recallIsPrimary ? (
            <LinkButton href={hrefFor({ name: 'night' })} full>
              Recall {due} {due === 1 ? 'note' : 'notes'}
            </LinkButton>
          ) : reading.doneToday ? (
            <div className="text-center py-3 rounded-[var(--radius-md)] bg-accent-soft">
              <p className="text-sm font-medium text-accent-ink">Today's chapter is done.</p>
              <a
                href={hrefFor({ name: 'log', bookId: null })}
                className="text-xs text-ink-quiet underline underline-offset-4 mt-1 inline-block min-h-11"
              >
                Log another
              </a>
            </div>
          ) : (
            <LinkButton href={hrefFor({ name: 'log', bookId: book?.id ?? null })} full>
              Read today's chapter
            </LinkButton>
          )}
          <div className="flex gap-2">
            {recallIsPrimary ? (
              <LinkButton href={hrefFor({ name: 'log', bookId: null })} variant="secondary" full>
                Log another chapter
              </LinkButton>
            ) : offerRecall ? (
              <LinkButton href={hrefFor({ name: 'night' })} variant="secondary" full>
                Recall {due} {due === 1 ? 'note' : 'notes'}
              </LinkButton>
            ) : null}
            <LinkButton href={hrefFor({ name: 'library' })} variant="secondary" full>
              Library
            </LinkButton>
          </div>
        </div>
      }
    >
      <div className="pt-6">
        <p className="text-sm text-ink-quiet mb-1">Reading streak</p>
        <StreakNumber streak={reading} />
      </div>

      {book && (
        <Card className="mt-8 p-4">
          <p className="text-xs text-ink-faint mb-3">Today's book</p>
          <a href={hrefFor({ name: 'book', id: book.id })} className="flex gap-3.5 items-center">
            <Cover book={book} className="w-14 h-[5.25rem] [container-type:inline-size]" />
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-snug">{book.title}</p>
              <p className="text-sm text-ink-quiet mt-0.5 truncate">{book.author}</p>
              <div className="mt-2.5">
                {hasMeasurableProgress(book) && <ProgressBar percent={book.percentComplete} />}
                <p className="text-xs text-ink-faint mt-1.5 tnum">
                  {hasMeasurableProgress(book) && book.percentComplete > 0
                    ? `${percentLabel(book.percentComplete)} · ${progressLabel(book)}`
                    : progressLabel(book)}
                </p>
              </div>
            </div>
          </a>
        </Card>
      )}

      <div className="mt-8 pt-4 border-t border-[var(--border)]">
        <p className="text-sm text-ink-quiet">
          Review streak{' '}
          <span className="tnum text-ink font-medium">
            {review.current} {review.current === 1 ? 'night' : 'nights'}
          </span>
        </p>
        <p className="text-xs text-ink-faint mt-1">
          {due > 0
            ? `${due} ${due === 1 ? 'note is' : 'notes are'} waiting${queue.heldBack > 0 ? ` of ${queue.dueCount} due` : ''}${isNight ? '.' : ` — recall opens at ${settings?.darkFromHour ?? 19}:00.`}`
            : queue.capReached
              ? `Tonight's ${queue.alreadyDone} are done. ${queue.heldBack} keep until tomorrow.`
              : 'Nothing due tonight.'}
        </p>
      </div>
    </Screen>
  )
}
