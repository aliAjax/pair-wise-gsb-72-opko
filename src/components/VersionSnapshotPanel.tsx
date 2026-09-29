import {
  Alert,
  Box,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material'
import type { ReactNode } from 'react'
import type { FeatureFlag, ReviewVersion, VersionChange } from '@/types'
import { formatVersionTime, versionStatusColor, versionStatusLabel } from '@/components/versionUtils'

interface VersionSnapshotPanelProps {
  version: ReviewVersion
  changes?: VersionChange[]
  flags?: FeatureFlag[]
  compact?: boolean
}

const dependencyLabel = (flagId: string, flags?: FeatureFlag[]) =>
  flags?.find((flag) => flag.id === flagId)?.key ?? flagId

export function VersionSnapshotPanel({ version, changes = [], flags, compact }: VersionSnapshotPanelProps) {
  const snapshot = version.snapshot
  const typeLabels = { requires: '前置依赖', conflicts: '互斥', fallback: '降级' }

  return (
    <Box>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1 }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="h3">v{version.versionNumber} 不可变快照</Typography>
          <Chip size="small" color={versionStatusColor(version.status)} label={versionStatusLabel(version.status)} />
          <Chip size="small" variant="outlined" label={version.source === 'legacy-pending' ? '旧开关首次打开生成' : '送审生成'} />
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {formatVersionTime(version.createdAt)} · {version.createdBy} · {version.checksum}
        </Typography>
      </Stack>

      {changes.length > 0 ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          草稿相对该版本发生 {changes.length} 处边界变化，批准的版本不会随草稿更新；需退回重审。
        </Alert>
      ) : (
        <Alert severity={version.source === 'legacy-pending' ? 'warning' : 'info'} sx={{ mb: 2 }}>
          {version.source === 'legacy-pending'
            ? '这是旧开关首次打开时自动固定的待确认版本，原审计记录保留。'
            : '审批只能绑定此校验和对应的快照，后续草稿修改不会影响本版本。'}
        </Alert>
      )}

      {changes.length > 0 && (
        <>
          <Typography variant="h3" sx={{ mb: 1 }}>已标出的变化</Typography>
          <List dense disablePadding sx={{ mb: 2 }}>
            {changes.map((change) => (
              <ListItem key={change.field} divider sx={{ alignItems: 'flex-start' }}>
                <ListItemText
                  primary={<Typography variant="body2" fontWeight={700}>{change.label}</Typography>}
                  secondary={
                    <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">送审：{change.before}</Typography>
                      <Typography variant="caption" color="error.main">现草稿：{change.after}</Typography>
                    </Stack>
                  }
                />
              </ListItem>
            ))}
          </List>
          <Divider sx={{ mb: 2 }} />
        </>
      )}

      <Box className={compact ? 'version-snapshot compact' : 'version-snapshot'}>
        <SnapshotSection title="受众边界">
          <SnapshotText>
            {snapshot.audienceRules.length === 0
              ? '全部用户'
              : snapshot.audienceRules
                  .map((rule) => `${rule.attribute} ${rule.operator} ${rule.value}${rule.negate ? '（排除）' : ''}`)
                  .join('；')}
          </SnapshotText>
          <SnapshotText>地区：{snapshot.regions.join('、') || '不限'}</SnapshotText>
          <SnapshotText>
            最低版本：DEV {snapshot.minClientVersion.dev} / STG {snapshot.minClientVersion.staging} / PROD {snapshot.minClientVersion.production}
          </SnapshotText>
        </SnapshotSection>

        <SnapshotSection title="依赖边界">
          {snapshot.dependencies.length === 0 ? (
            <SnapshotText>无依赖</SnapshotText>
          ) : (
            snapshot.dependencies.map((dependency) => (
              <SnapshotText key={`${dependency.flagId}-${dependency.type}`}>
                {typeLabels[dependency.type]} · {dependencyLabel(dependency.flagId, flags)} · {dependency.condition}
              </SnapshotText>
            ))
          )}
        </SnapshotSection>

        <SnapshotSection title="回滚边界">
          {snapshot.rollbackConditions.map((condition) => (
            <SnapshotText key={condition}>{condition}</SnapshotText>
          ))}
        </SnapshotSection>

        <SnapshotSection title="灰度阶段">
          {snapshot.rolloutSteps.map((step, index) => (
            <SnapshotText key={step.id}>
              阶段 {index + 1}：{step.percentage}% · {step.audience} · 守护：{step.guardrails.join('、') || '无'}
            </SnapshotText>
          ))}
        </SnapshotSection>
      </Box>

      {version.comment && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          评审备注：{version.comment}
        </Typography>
      )}
    </Box>
  )
}

function SnapshotSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box className="snapshot-section">
      <Typography variant="caption" fontWeight={800}>{title}</Typography>
      <Box sx={{ mt: 0.7 }}>{children}</Box>
    </Box>
  )
}

function SnapshotText({ children }: { children: ReactNode }) {
  return (
    <Typography variant="body2" sx={{ mb: 0.5 }}>
      • {children}
    </Typography>
  )
}
