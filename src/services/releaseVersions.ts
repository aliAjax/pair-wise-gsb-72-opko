import type {
  Dependency,
  FeatureFlag,
  ReleaseSnapshot,
  ReviewVersion,
  RolloutStep,
  VersionChange,
} from '@/types'

export const releaseFieldLabels: Record<keyof ReleaseSnapshot, string> = {
  key: '开关 Key',
  name: '开关名称',
  description: '业务说明',
  owner: '负责人',
  team: '团队',
  environment: '环境',
  enabled: '启用状态',
  rolloutPercentage: '初始流量',
  audienceRules: '受众',
  regions: '生效地区',
  minClientVersion: '最低客户端版本',
  dependencies: '依赖边界',
  rollbackConditions: '回滚条件',
  metricNames: '监控指标',
  deadCodeStatus: '死代码状态',
  rolloutSteps: '灰度边界',
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export const createSnapshot = (flag: FeatureFlag): ReleaseSnapshot => ({
  key: flag.key,
  name: flag.name,
  description: flag.description,
  owner: flag.owner,
  team: flag.team,
  environment: flag.environment,
  enabled: flag.enabled,
  rolloutPercentage: flag.rolloutPercentage,
  audienceRules: clone(flag.audienceRules),
  regions: clone(flag.regions),
  minClientVersion: clone(flag.minClientVersion),
  dependencies: clone(flag.dependencies),
  rollbackConditions: clone(flag.rollbackConditions),
  metricNames: clone(flag.metricNames),
  deadCodeStatus: flag.deadCodeStatus,
  rolloutSteps: clone(flag.rolloutSteps.map((step) => ({ ...step, status: 'planned', startedAt: '' }))),
})

const stableValue = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map((item) => stableValue(item)).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${key}:${stableValue((value as Record<string, unknown>)[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export const calculateChecksum = (snapshot: ReleaseSnapshot): string => {
  const serialized = stableValue(snapshot)
  let hash = 5381
  for (let index = 0; index < serialized.length; index += 1) {
    hash = ((hash << 5) + hash + serialized.charCodeAt(index)) >>> 0
  }
  return `sha-like-${hash.toString(16).padStart(8, '0')}`
}

const formatValue = (field: keyof ReleaseSnapshot, value: unknown): string => {
  if (field === 'audienceRules') {
    const rules = value as ReleaseSnapshot['audienceRules']
    return rules.length === 0
      ? '全部用户'
      : rules.map((rule) => `${rule.attribute} ${rule.operator} ${rule.value}${rule.negate ? '（排除）' : ''}`).join('；')
  }
  if (field === 'dependencies') {
    const dependencies = value as Dependency[]
    const typeLabels = { requires: '前置', conflicts: '互斥', fallback: '降级' }
    return dependencies.length === 0
      ? '无依赖'
      : dependencies.map((dependency) => `${typeLabels[dependency.type]} ${dependency.flagId}：${dependency.condition}`).join('；')
  }
  if (field === 'rolloutSteps') {
    const steps = value as RolloutStep[]
    return steps.length === 0
      ? '无灰度阶段'
      : steps
          .map((step, index) => `阶段${index + 1} ${step.percentage}%/${step.audience}/守护：${step.guardrails.join('、') || '无'}`)
          .join('；')
  }
  if (field === 'regions') return (value as string[]).join('、') || '无地区'
  if (field === 'rollbackConditions') return (value as string[]).join('；') || '无回滚条件'
  if (field === 'metricNames') return (value as string[]).join('、') || '无监控指标'
  if (field === 'minClientVersion') {
    const versions = value as ReleaseSnapshot['minClientVersion']
    return `DEV ${versions.dev} / STG ${versions.staging} / PROD ${versions.production}`
  }
  if (field === 'enabled') return value ? '打开' : '关闭'
  if (field === 'rolloutPercentage') return `${value}%`
  return String(value ?? '-')
}

export const compareSnapshots = (
  before: ReleaseSnapshot,
  after: ReleaseSnapshot,
  fields: Array<keyof ReleaseSnapshot>,
): VersionChange[] =>
  fields
    .filter((field) => stableValue(before[field]) !== stableValue(after[field]))
    .map((field) => ({
      field,
      label: releaseFieldLabels[field],
      before: formatValue(field, before[field]),
      after: formatValue(field, after[field]),
    }))

export const protectedFields: Array<keyof ReleaseSnapshot> = [
  'audienceRules',
  'regions',
  'minClientVersion',
  'dependencies',
  'rollbackConditions',
  'metricNames',
  'rolloutSteps',
]

export const getSnapshotChanges = (
  version: ReviewVersion | undefined,
  snapshot: ReleaseSnapshot,
): VersionChange[] =>
  version ? compareSnapshots(version.snapshot, snapshot, protectedFields) : []

export const getLatestVersion = (flag: FeatureFlag): ReviewVersion | undefined =>
  flag.reviewVersions.at(0)

export const getApprovedVersion = (flag: FeatureFlag): ReviewVersion | undefined =>
  flag.reviewVersions.find((version) => version.id === flag.approvedVersionId)

export const getRuntimeVersion = (flag: FeatureFlag): ReviewVersion | undefined =>
  flag.reviewVersions.find((version) => version.id === flag.runtimeVersionId)

export const getEffectiveFlag = (flag: FeatureFlag): FeatureFlag => {
  if (flag.configurationState !== 'drifted') return flag
  const runtime = getRuntimeVersion(flag)
  if (!runtime) return flag
  return {
    ...flag,
    ...runtime.snapshot,
    enabled: true,
    status: flag.runtimeStatus ?? flag.status,
    rolloutPercentage: flag.runtimePercentage ?? runtime.snapshot.rolloutPercentage,
    rolloutSteps: clone(flag.runtimeSteps ?? runtime.snapshot.rolloutSteps),
  }
}

export const needsReview = (flag: FeatureFlag): boolean => {
  if (flag.configurationState === 'drifted') return true
  const latest = getLatestVersion(flag)
  return latest?.status === 'pending'
}

export const versionStatusLabel = (status: ReviewVersion['status']): string => {
  const labels: Record<ReviewVersion['status'], string> = {
    pending: '待确认',
    approved: '已批准',
    rejected: '已驳回',
    invalidated: '已失效',
    superseded: '已被替代',
    restored: '已恢复',
  }
  return labels[status]
}
