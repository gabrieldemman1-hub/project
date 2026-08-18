import { useEffect, useState } from 'react'
import type { Book } from '../db/schema'
import { initialsOf } from '../lib/format'

/**
 * A cover, or an honest typographic stand-in. Never a broken image icon — half
 * this library will not resolve on Open Library, and a shelf of broken images
 * would make the app look untrustworthy on day one.
 */
export function Cover({ book, className = '' }: { book: Book; className?: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (book.coverBlob) {
      const url = URL.createObjectURL(book.coverBlob)
      setSrc(url)
      return () => URL.revokeObjectURL(url)
    }
    setSrc(book.coverUrl)
    return undefined
  }, [book.coverBlob, book.coverUrl])

  const showImage = src && !failed

  return (
    <div
      className={`relative overflow-hidden rounded-[var(--radius-sm)] bg-surface-sunk
        border border-border-soft shrink-0 ${className}`}
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center p-1">
          <span className="serif text-ink-faint font-semibold leading-none text-[min(2.2rem,40cqw)]">
            {initialsOf(book.title)}
          </span>
        </div>
      )}
    </div>
  )
}
