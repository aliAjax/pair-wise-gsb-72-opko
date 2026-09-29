import { Box, Chip, Stack, Typography } from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded'
import type { ConfigChange, ReleaseRevision } from '@/types'
import { RevisionBadge } from '@/components/RevisionBadge'
import { boundaryLabels } from '@/services/revisions'
import { formatRevisionTime } from '@/services/revisionUtils'

const dependencyName = (flagId: string, flagNameById?: Map<string, string>) =>
  flagNameById?.get(flagId) ?? flagId

const formatLine = (line: string, flagNameById?: Map<string, string>) =>
  line.replace(/\bflag-\d+\b/g, (match) => dependencyName(match, flagNameById))

export function BoundaryDiff({
  changes,
  flagNameById,
}: {
  changes: ConfigChange[]
  flagNameById?: Map<string, string>
}) {
  if (changes.length === 0) {
    return <Typography variant="body2" color="text.secondary">与上一送审版本边界一致，无变化。</Typography>
  }
  return (
    <Stack spacing={1.2}>
      {changes.map((change) => (
        <Box key={change.boundary} className="revision-diff-group">
          <Typography variant="body2" fontWeight={700}>{change.label}变化</Typography>
          {change.added.map((line) => (
            <Stack key={`add-${line}`} direction="row" spacing={0.8} alignItems="flex-start" className="diff-line diff-added">
              <AddRoundedIcon fontSize="small" />
              <Typography variant="body2">{formatLine(line, flagNameById)}</Typography>
            </Stack>
          ))}
          {change.removed.map((line) => (
            <Stack key={`remove-${line}`} direction="row" spacing={0.8} alignItems="flex-start" className="diff-line diff-removed">
              <RemoveRoundedIcon fontSize="small" />
              <Typography variant="body2">{formatLine(line, flagNameById)}</Typography>
            </Stack>
          ))}
        </Box>
      ))}
    </Stack>
  )
}

export function RevisionSnapshotView({
  revision,
  flagNameById,
}: {
  revision: ReleaseRevision
  flagNameById?: Map<string, string>
}) {
  const { snapshot } = revision
  const groups: Array<{ key: string; title: string; items: string[] }> = [
    {
      key: 'audienceRules',
      title: boundaryLabels.audienceRules,
      items: snapshot.audienceRules.map(
        (rule) => `${rule.attribute} ${rule.negate ? '不' : ''}${rule.operator} ${rule.value}`,
      ),
    },
    {
      key: 'dependencies',
      title: boundaryLabels.dependencies,
      items: snapshot.dependencies.map(
        (dependency) =>
          `[${dependency.type === 'requires' ? '前置依赖' : dependency.type === 'conflicts' ? '互斥冲突' : '降级路径'}] ${dependencyName(dependency.flagId, flagNameById)}：${dependency.condition}`,
      ),
    },
    {
      key: 'rollbackConditions',
      title: boundaryLabels.rollbackConditions,
      items: [...snapshot.rollbackConditions],
    },
  ]
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <RevisionBadge revision={revision} showHash />
        <Typography variant="caption" color="text.secondary">
          {revision.submittedBy} · 送审于 {formatRevisionTime(revision.submittedAt)} · 固化灰度 {snapshot.rolloutPercentage}%
        </Typography>
        {revision.reviewedBy && (
          <Chip size="small" variant="outlined" label={`评审：${revision.reviewedBy} · ${formatRevisionTime(revision.reviewedAt ?? '')}`} />
        )}
        {revision.freezeUntil && revision.status === 'approved' && (
          <Chip size="small" color="info" variant="outlined" label={`冻结扩大流量至 ${revision.freezeUntil}`} />
        )}
      </Stack>
      {revision.reviewComment && (
        <Typography variant="body2" color="text.secondary" className="revision-comment">
          评审意见：{revision.reviewComment}
        </Typography>
      )}
      {groups.map((group) => (
        <Box key={group.key} className="revision-snapshot-group">
          <Typography variant="caption" color="text.secondary">
            {group.title}（{group.items.length}）
          </Typography>
          {group.items.length > 0 ? (
            group.items.map((item) => (
              <Typography key={item} variant="body2" className="snapshot-line">
                • {formatLine(item, flagNameById)}
              </Typography>
            ))
          ) : (
            <Typography variant="body2" className="snapshot-line">• 无</Typography>
          )}
        </Box>
      ))}
    </Stack>
  )
}
