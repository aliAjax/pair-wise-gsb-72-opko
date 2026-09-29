import { Chip } from '@mui/material'
import type { ReleaseRevision } from '@/types'
import { revisionStatusColor, revisionStatusLabel } from '@/services/revisionUtils'

interface RevisionBadgeProps {
  revision: ReleaseRevision
  size?: 'small' | 'medium'
  showHash?: boolean
}

export function RevisionBadge({ revision, size = 'small', showHash = false }: RevisionBadgeProps) {
  return (
    <Chip
      size={size}
      color={revisionStatusColor[revision.status]}
      variant={revision.status === 'approved' ? 'filled' : 'outlined'}
      label={
        showHash
          ? `v${revision.version} · ${revisionStatusLabel[revision.status]} · ${revision.boundaryHash}`
          : `v${revision.version} · ${revisionStatusLabel[revision.status]}`
      }
    />
  )
}
