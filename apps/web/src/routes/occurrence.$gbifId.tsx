import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, LoaderCircle } from 'lucide-react'
import { occurrenceDetailQueryOptions } from '../queries/occurrenceQueries.js'
import { OccurrenceCard } from '../features/occurrences/OccurrenceCard.js'

export const Route = createFileRoute('/occurrence/$gbifId')({
  component: OccurrenceViewPage,
})

function OccurrenceViewPage() {
  const { gbifId } = Route.useParams()
  const search = Route.useSearch() as { revision?: string }
  const revision = search?.revision || ''

  const { data: record, isLoading, error } = useQuery(
    occurrenceDetailQueryOptions(revision, gbifId),
  )

  return (
    <div className="occurrence-view-page" style={{ padding: '24px', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ marginBottom: '16px', width: '100%', maxWidth: '360px' }}>
        <Link to="/" className="glass-control" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '999px', textDecoration: 'none', color: 'inherit' }}>
          <ArrowLeft size={16} />
          <span>Back to Globe</span>
        </Link>
      </div>

      {isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
          <LoaderCircle className="spinner" size={24} />
          <span>Loading record {gbifId}...</span>
        </div>
      )}

      {error && (
        <div style={{ color: 'var(--danger)', background: 'rgba(239,68,68,0.1)', padding: '16px', borderRadius: '12px' }}>
          Failed to load occurrence: {(error as Error).message}
        </div>
      )}

      {record && (
        <div style={{ position: 'relative', width: '320px', margin: '0 auto' }}>
          <OccurrenceCard
            record={record}
            position={{ left: 0, top: 0 }}
            language="zh"
          />
        </div>
      )}
    </div>
  )
}
