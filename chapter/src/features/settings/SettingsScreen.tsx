import { useEffect, useState } from 'react'
import { Screen } from '../../components/Screen'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { FieldGroup } from '../../components/Field'
import { useLive } from '../../lib/useLive'
import { getSettings } from '../../db/queries'
import { updateSettings } from '../../db/mutations'
import { backupFilename, exportJson, importBackup, shareBackup } from '../../db/backup'
import { isStandalone, storageReport } from '../../lib/storage'
import { todayKey } from '../../lib/day'
import { hrefFor } from '../../lib/router'
import type { ThemeMode } from '../../lib/theme'

export function SettingsScreen() {
  const settings = useLive(() => getSettings(), [])
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [storage, setStorage] = useState<Awaited<ReturnType<typeof storageReport>> | null>(null)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    void storageReport().then(setStorage)
  }, [])

  async function setMode(mode: ThemeMode) {
    // Recording the day is what makes the override expire at midnight.
    await updateSettings({
      themeMode: mode,
      themeOverrideDay: mode === 'auto' ? null : todayKey(new Date()),
    })
  }

  async function doExport() {
    setBusy('export')
    setMessage(null)
    const json = await exportJson()
    const outcome = await shareBackup(json, backupFilename())
    await updateSettings({ lastBackupAt: Date.now() })
    setBusy(null)
    setMessage(
      outcome === 'shared'
        ? 'Backup shared. Save it somewhere off this phone.'
        : outcome === 'copied'
          ? 'Sharing was unavailable, so the backup is on your clipboard. Paste it somewhere safe.'
          : 'Could not export. Try again, or copy it from the box below.',
    )
  }

  async function doImport() {
    setBusy('import')
    setMessage(null)
    try {
      const counts = await importBackup(importText)
      setMessage(
        `Restored ${counts.books} books, ${counts.notes} notes and ${counts.readingLogs} logged chapters. Covers will refetch.`,
      )
      setImportText('')
      setImporting(false)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'That import failed.')
    } finally {
      setBusy(null)
    }
  }

  const mode = settings?.themeMode ?? 'auto'
  const lastBackup = settings?.lastBackupAt
  const daysSinceBackup =
    lastBackup === null || lastBackup === undefined
      ? null
      : Math.floor((Date.now() - lastBackup) / 86_400_000)

  return (
    <Screen title="Settings" back={{ label: 'Home', href: hrefFor({ name: 'home' }) }}>
      <section className="mt-4">
        <FieldGroup
          label="Theme"
          hint={
            mode === 'auto'
              ? `Light until ${settings?.darkFromHour ?? 19}:00, dark after. The dark screen is the signal that it is recall time.`
              : 'Your choice holds until midnight, then the clock takes over again.'
          }
        >
          <div className="flex gap-2">
            {(['auto', 'light', 'dark'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => void setMode(option)}
                aria-pressed={mode === option}
                className={`flex-1 min-h-11 rounded-[var(--radius-md)] border text-sm capitalize ${
                  mode === option
                    ? 'bg-accent-soft border-accent text-accent-ink font-medium'
                    : 'bg-surface border-border-soft text-ink-quiet'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </FieldGroup>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-ink-quiet mb-2">Backup</h2>
        <Card className="p-4">
          <p className="text-sm leading-relaxed text-ink">
            Deleting this app from your home screen deletes every note with it. There is no recycle
            bin and no cloud copy. Export sends a JSON file to your share sheet — put it in Files or
            iCloud Drive.
          </p>
          {daysSinceBackup !== null && (
            <p
              className={`text-sm mt-3 tnum ${daysSinceBackup >= 30 ? 'text-warn' : 'text-ink-quiet'}`}
            >
              Last backed up {daysSinceBackup === 0 ? 'today' : `${daysSinceBackup} days ago`}.
            </p>
          )}
          {daysSinceBackup === null && (
            <p className="text-sm mt-3 text-warn">Never backed up.</p>
          )}
          <div className="flex gap-2 mt-4">
            <Button variant="secondary" className="flex-1" onClick={doExport} disabled={busy !== null}>
              {busy === 'export' ? 'Exporting…' : 'Export'}
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setImporting((v) => !v)}
              disabled={busy !== null}
            >
              Import
            </Button>
          </div>

          {importing && (
            <div className="mt-4">
              <p className="text-sm text-warn leading-relaxed">
                Importing replaces everything currently in the app. Export first if you are not sure.
              </p>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Paste the contents of a Chapter backup here"
                rows={5}
                className="w-full mt-2 p-3 rounded-[var(--radius-md)] bg-surface-sunk border border-border-soft text-sm"
              />
              <Button
                variant="danger"
                full
                className="mt-2"
                onClick={doImport}
                disabled={busy !== null || importText.trim() === ''}
              >
                {busy === 'import' ? 'Restoring…' : 'Replace everything with this backup'}
              </Button>
            </div>
          )}

          {message && <p className="text-sm text-ink-quiet mt-3 leading-relaxed">{message}</p>}
        </Card>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-ink-quiet mb-2">Storage</h2>
        <Card className="p-4 text-sm leading-relaxed">
          {!isStandalone() && (
            <p className="text-warn mb-3">
              You are in a browser tab, not the installed app. Safari deletes a site's data after
              seven days without a visit — and the installed app keeps a separate copy of everything.
              Add Chapter to your home screen and enter your books there.
            </p>
          )}
          <p className="text-ink-quiet">
            {storage?.persisted === true
              ? 'Storage is marked persistent — iOS will not evict it to reclaim space.'
              : storage?.persisted === false
                ? 'Storage is not marked persistent. Opening the app regularly is what keeps it alive.'
                : 'This browser does not report storage durability.'}
          </p>
          {storage?.usageMb !== null && storage?.usageMb !== undefined && (
            <p className="text-ink-faint mt-2 tnum">
              Using {storage.usageMb} MB{storage.quotaMb ? ` of ${storage.quotaMb} MB` : ''}.
            </p>
          )}
        </Card>
      </section>

      <p className="text-xs text-ink-faint mt-10 leading-relaxed">
        Chapter has no reminders. A web app on iOS cannot schedule a notification, and faking one
        would mean running a server. It is somewhere you go at seven, not something that finds you.
      </p>
    </Screen>
  )
}
