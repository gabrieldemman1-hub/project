import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Button } from '../../components/Button'
import { Screen } from '../../components/Screen'
import { getHistoryView, type HistoryPoint } from '../../db/queries'
import { fromIsoDate } from '../../lib/date'
import { navigate } from '../../lib/router'
import { colors, font } from '../../styles/tokens'

/**
 * History (BRIEF Part 6): per exercise, weight over time, total volume over
 * time, and the set-count trend. Three charts, nothing more.
 *
 * Chart craft: single-series charts need no legend; one axis each; thin
 * marks; recessive grid; all text in text tokens with the series colour only
 * on the marks. The accent is the app's single colour (Part 7), so identity
 * is carried by each card's title. Deload sessions draw as hollow points —
 * present, but visibly not working weight.
 */
export function HistoryScreen() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const view = useLiveQuery(() => getHistoryView(selectedId), [selectedId])

  if (!view) return <Screen>{null}</Screen>

  const active = selectedId ?? view.exercises[0]?.id ?? null
  // First render before a selection exists: adopt the first exercise.
  if (active !== selectedId) {
    setSelectedId(active)
    return <Screen>{null}</Screen>
  }

  return (
    <Screen
      action={
        <Button variant="quiet" onClick={() => navigate('/')}>
          ‹ Home
        </Button>
      }
    >
      <header className="flex items-baseline justify-between gap-4">
        <p className="text-xs tracking-wider text-text-secondary uppercase">History</p>
      </header>

      {view.exercises.length === 0 ? (
        <div className="flex flex-1 flex-col justify-center">
          <p className="text-2xl text-text">Nothing yet</p>
          <p className="mt-4 max-w-measure-base text-sm leading-relaxed text-text-secondary">
            Charts appear here after your first completed session.
          </p>
        </div>
      ) : (
        <>
          {/* Exercise picker: one horizontal row, scrolls sideways. shrink-0
              is load-bearing: as a scroll container inside the screen's flex
              column its min-height is zero, so without it the row absorbs all
              the shrink when the charts overflow and collapses to its padding. */}
          <div className="-mx-6 mt-4 flex shrink-0 gap-2 overflow-x-auto px-6 pb-2">
            {view.exercises.map((exercise) => (
              <button
                key={exercise.id}
                type="button"
                onClick={() => setSelectedId(exercise.id)}
                className={
                  exercise.id === active
                    ? 'min-h-touch-min shrink-0 rounded-full border border-border-strong bg-surface-raised px-4 text-sm whitespace-nowrap text-text'
                    : 'min-h-touch-min shrink-0 rounded-full border border-border bg-surface px-4 text-sm whitespace-nowrap text-text-secondary'
                }
              >
                {exercise.name}
              </button>
            ))}
          </div>

          {/* All three charts fit the viewport: the third used to sit
              permanently half-cut at the fold, which read as a rendering
              accident rather than an invitation to scroll. */}
          <div className="mt-5 flex flex-col gap-3">
            <ChartCard
              title="Top set weight"
              unit="lb"
              latest={view.points[view.points.length - 1]?.topWeightLb}
            >
              <HistoryLine points={view.points} dataKey="topWeightLb" />
            </ChartCard>

            <ChartCard
              title="Session volume"
              unit="lb"
              latest={view.points[view.points.length - 1]?.volumeLb}
            >
              <HistoryLine points={view.points} dataKey="volumeLb" />
            </ChartCard>

            <ChartCard
              title="Sets per session"
              unit="sets"
              latest={view.points[view.points.length - 1]?.setCount}
            >
              <SetsBars points={view.points} />
            </ChartCard>

            {/* The hollow points had no explanation anywhere in the UI. */}
            {view.points.some((point) => point.isDeload) ? (
              <p className="flex items-center gap-2 text-micro tracking-wider text-text-muted uppercase">
                <svg width="10" height="10" aria-hidden>
                  <circle
                    cx="5"
                    cy="5"
                    r="3.5"
                    fill={colors.bg}
                    stroke={colors.accent}
                    strokeWidth="1.5"
                  />
                </svg>
                Hollow = deload week
              </p>
            ) : null}
          </div>
        </>
      )}
    </Screen>
  )
}

function ChartCard({
  title,
  unit,
  latest,
  children,
}: {
  title: string
  unit: string
  latest: number | undefined
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-surface px-4 pt-3 pb-1">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xs tracking-wider text-text-secondary uppercase">{title}</h2>
        {latest !== undefined ? (
          <p className="shrink-0">
            <span className="num text-xl text-text">{formatNumber(latest)}</span>
            <span className="ml-1 text-xs tracking-wider text-text-secondary uppercase">
              {unit}
            </span>
          </p>
        ) : null}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  )
}

function formatNumber(value: number): string {
  return value >= 10_000 ? `${(value / 1000).toFixed(1)}k` : String(value)
}

/** e.g. "17 Aug" — short enough for a 390px-wide axis. */
function tickLabel(date: string): string {
  const d = fromIsoDate(date)
  return `${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}`
}

const AXIS_TICK = {
  fill: colors.textSecondary,
  fontSize: 10,
  fontFamily: font.numeric,
} as const

function ChartTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean | undefined
  payload?: Array<{ value?: number | string; payload?: HistoryPoint }> | undefined
  unit: string
}) {
  const point = payload?.[0]
  if (!active || !point || point.payload === undefined) return null
  return (
    <div className="rounded-md border border-border-strong bg-surface-raised px-3 py-2">
      <p className="text-micro tracking-wider text-text-secondary uppercase">
        {tickLabel(point.payload.date)}
        {point.payload.isDeload ? ' · deload' : ''}
      </p>
      <p className="num mt-1 text-base text-text">
        {formatNumber(Number(point.value ?? 0))}{' '}
        <span className="text-xs text-text-secondary">{unit}</span>
      </p>
    </div>
  )
}

/** Deload sessions draw hollow: present, but visibly not working weight. */
function PointDot(props: {
  cx?: number
  cy?: number
  payload?: HistoryPoint
}) {
  const { cx, cy, payload } = props
  if (cx === undefined || cy === undefined) return null
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={payload?.isDeload ? colors.bg : colors.accent}
      stroke={colors.accent}
      strokeWidth={1.5}
    />
  )
}

function HistoryLine({
  points,
  dataKey,
}: {
  points: HistoryPoint[]
  dataKey: 'topWeightLb' | 'volumeLb'
}) {
  const unit = 'lb'
  return (
    <ResponsiveContainer width="100%" height={118}>
      <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid vertical={false} stroke={colors.border} />
        <XAxis
          dataKey="date"
          tickFormatter={tickLabel}
          tick={AXIS_TICK}
          axisLine={{ stroke: colors.border }}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={32}
        />
        <YAxis
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          domain={['auto', 'auto']}
          tickFormatter={(value: number) => formatNumber(value)}
        />
        <Tooltip
          content={<ChartTooltip unit={unit} />}
          cursor={{ stroke: colors.borderStrong }}
        />
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={colors.accent}
          strokeWidth={2}
          dot={<PointDot />}
          activeDot={{ r: 5, fill: colors.accent, stroke: colors.bg, strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

function SetsBars({ points }: { points: HistoryPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={106}>
      <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -28 }}>
        <CartesianGrid vertical={false} stroke={colors.border} />
        <XAxis
          dataKey="date"
          tickFormatter={tickLabel}
          tick={AXIS_TICK}
          axisLine={{ stroke: colors.border }}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={32}
        />
        <YAxis
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          domain={[0, 'dataMax']}
        />
        <Tooltip content={<ChartTooltip unit="sets" />} cursor={{ fill: colors.surfaceRaised }} />
        <Bar
          dataKey="setCount"
          fill={colors.accent}
          radius={[4, 4, 0, 0]}
          maxBarSize={16}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
