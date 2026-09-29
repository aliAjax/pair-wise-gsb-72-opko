import type { FeatureFlag, ReleaseRevision } from '@/types'

export const revisionStatusLabel: Record<ReleaseRevision['status'], string> = {
  pending: '待评审',
  approved: '已批准',
  rejected: '已驳回',
  superseded: '送审后已改 · 作废',
  invalidated: '批准已失效 · 退回重审',
  'pending-confirmation': '旧开关 · 待确认',
}

export const revisionStatusColor: Record<
  ReleaseRevision['status'],
  'default' | 'primary' | 'success' | 'error' | 'warning' | 'info'
> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  superseded: 'default',
  invalidated: 'error',
  'pending-confirmation': 'info',
}

export const latestRevision = (flag: FeatureFlag | undefined): ReleaseRevision | undefined =>
  flag?.revisions.at(-1)

export const actionableRevision = (flag: FeatureFlag | undefined): ReleaseRevision | undefined =>
  flag ? [...flag.revisions].reverse().find((item) => item.status === 'pending' || item.status === 'pending-confirmation') : undefined

export const approvedRevision = (flag: FeatureFlag | undefined): ReleaseRevision | undefined =>
  flag ? [...flag.revisions].reverse().find((item) => item.status === 'approved') : undefined

/** 最近一次曾被批准的版本（含已失效的），人工回滚按该快照恢复 */
export const lastApprovedRevision = (flag: FeatureFlag | undefined): ReleaseRevision | undefined =>
  flag
    ? [...flag.revisions].reverse().find((item) => item.status === 'approved' || item.status === 'invalidated')
    : undefined

export const invalidatedRevision = (flag: FeatureFlag | undefined): ReleaseRevision | undefined =>
  flag ? [...flag.revisions].reverse().find((item) => item.status === 'invalidated') : undefined

/** 当前评审页应该展示的版本：优先待评审 / 待确认；否则给最近一版（可能已失效） */
export const reviewableRevision = (flag: FeatureFlag | undefined): ReleaseRevision | undefined =>
  actionableRevision(flag) ?? latestRevision(flag)

export const formatRevisionTime = (value: string): string => value.slice(0, 16).replace('T', ' ')
