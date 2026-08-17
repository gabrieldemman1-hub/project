import type { LoadDecision } from './load'
import type { SetsDecision } from './sets'

/**
 * The one plain-English sentence the engine must always be able to give
 * (BRIEF Part 5). Built from what actually changed, leading with the load,
 * and always ending with a reason a human would accept.
 */
export function buildSentence(args: {
  load: LoadDecision
  setsDecision: SetsDecision
  setsBefore: number
  setsAfter: number
  incrementLb: number
  feedbackMissing: boolean
}): string {
  const { load, setsBefore, setsAfter, incrementLb, feedbackMissing } = args
  const setsChange = setsAfter - setsBefore

  const setsClause =
    setsChange > 0
      ? `add ${setsChange === 1 ? 'a set' : `${setsChange} sets`}`
      : setsChange < 0
        ? `drop ${setsChange === -1 ? 'a set' : `${-setsChange} sets`}`
        : ''

  const blocked = load.reasons.find((reason) => reason.startsWith('increase-blocked:'))

  let loadClause: string
  let reason: string

  if (load.reasons.some((reason) => reason.includes('below-floor'))) {
    loadClause = `drop to ${load.weightLb} lb`
    reason = 'reps fell under the target range'
  } else if (load.action === 'increase') {
    loadClause = `add ${incrementLb} lb`
    reason = 'you had reps in the tank'
  } else if (blocked === 'increase-blocked:consecutive') {
    loadClause = `stay at ${load.weightLb} lb`
    reason = 'the weight already went up last session — earn it twice'
  } else if (blocked === 'increase-blocked:joint-pain') {
    loadClause = `stay at ${load.weightLb} lb`
    reason = 'that joint pain needs a quiet week'
  } else if (blocked === 'increase-blocked:still-sore') {
    loadClause = `stay at ${load.weightLb} lb`
    reason = 'still sore means recover, not push'
  } else if (load.repsToBeat !== null) {
    loadClause = `same weight, beat ${load.repsToBeat} reps`
    reason = feedbackMissing ? 'no feedback last time, so chase reps' : 'nothing left in the tank last time'
  } else {
    loadClause = `same weight, match last session`
    reason = 'that was a true max effort'
  }

  const action = setsClause ? `${capitalise(setsClause)} and ${loadClause}` : capitalise(loadClause)
  return `${action} — ${reason}.`
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
