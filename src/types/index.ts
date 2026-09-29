export type FlagStatus = 'draft' | 'review' | 'active' | 'frozen' | 'rolled-back'
export type Environment = 'dev' | 'staging' | 'production'
export type RuleOperator = 'equals' | 'not-equals' | 'contains' | 'in' | 'gte' | 'lte'
export type IssueSeverity = 'blocker' | 'warning' | 'info'
export type IssueCategory =
  | 'rule-conflict'
  | 'dead-code'
  | 'missing-metric'
  | 'overlap'
  | 'client-compatibility'

/** 送审版本的生命周期状态：送审后内容不可变 */
export type RevisionStatus =
  | 'pending' // 已送审、等待评审
  | 'approved' // 评审通过、当前生效（或曾生效）
  | 'rejected' // 评审驳回
  | 'superseded' // 送审后、批准前配置被改，本版本已被新草稿取代
  | 'invalidated' // 批准且灰度开始后配置被改，旧批准失效、退回重审
  | 'pending-confirmation' // 旧开关首次启用，等待补确认的历史版本

export type RevisionBoundaryKey = 'audienceRules' | 'dependencies' | 'rollbackConditions'

export interface AudienceRule {
  id: string
  attribute: string
  operator: RuleOperator
  value: string
  negate: boolean
}

export interface RolloutStep {
  id: string
  percentage: number
  audience: string
  startedAt: string
  status: 'completed' | 'running' | 'planned' | 'paused'
  guardrails: string[]
}

export interface Dependency {
  flagId: string
  type: 'requires' | 'conflicts' | 'fallback'
  condition: string
}

/** 送审边界相对上一版本的结构化差异 */
export interface ConfigChange {
  boundary: RevisionBoundaryKey
  label: string
  added: string[]
  removed: string[]
}

/** 送审瞬间固化的全量配置快照，回滚时按它恢复 */
export interface RevisionSnapshot {
  enabled: boolean
  rolloutPercentage: number
  audienceRules: AudienceRule[]
  regions: string[]
  minClientVersion: Record<Environment, string>
  dependencies: Dependency[]
  rollbackConditions: string[]
  metricNames: string[]
  deadCodeStatus: FeatureFlag['deadCodeStatus']
  rolloutSteps: RolloutStep[]
}

/** 一次送审对应一个不可变版本 */
export interface ReleaseRevision {
  id: string
  flagId: string
  version: number
  status: RevisionStatus
  /** 送审时的受众、依赖、回滚边界内容指纹（8 位） */
  boundaryHash: string
  /** 送审人（旧开关待确认版本为系统） */
  submittedBy: string
  submittedAt: string
  /** 批准人 / 驳回人 */
  reviewedBy?: string
  reviewedAt?: string
  reviewComment?: string
  /** 批准时附带的冻结策略 */
  freezeUntil?: string
  /** 相对上一送审版本的边界变化；首个版本为空 */
  changes: ConfigChange[]
  /** 送审时固化的全量配置，任何时候都不随草稿修改 */
  snapshot: RevisionSnapshot
}

export interface FeatureFlag {
  id: string
  key: string
  name: string
  description: string
  owner: string
  team: string
  status: FlagStatus
  environment: Environment
  enabled: boolean
  rolloutPercentage: number
  audienceRules: AudienceRule[]
  regions: string[]
  minClientVersion: Record<Environment, string>
  dependencies: Dependency[]
  rollbackConditions: string[]
  metricNames: string[]
  deadCodeStatus: 'clean' | 'candidate' | 'confirmed'
  rolloutSteps: RolloutStep[]
  createdAt: string
  updatedAt: string
  lastChangedBy: string
  /** 每次送审固化的不可变版本，按版本号升序 */
  revisions: ReleaseRevision[]
}

export interface AuditEvent {
  id: string
  flagId: string
  flagKey: string
  action:
    | 'created'
    | 'updated'
    | 'submitted'
    | 'approved'
    | 'rejected'
    | 'frozen'
    | 'unfrozen'
    | 'rolled-back'
    | 'rollout-adjusted'
    | 'superseded'
    | 'approval-invalidated'
    | 'revision-confirmed'
  actor: string
  summary: string
  before?: string
  after?: string
  affectedUsers: number
  createdAt: string
  /** 关联的不可变送审版本 */
  revisionId?: string
  revisionVersion?: number
}

export interface ImpactIssue {
  id: string
  flagId: string
  flagKey: string
  category: IssueCategory
  severity: IssueSeverity
  title: string
  detail: string
  suggestion: string
  resolved: boolean
}

export interface DashboardData {
  activeFlags: number
  pendingReview: number
  blockerIssues: number
  affectedUsers: number
  environmentDiff: Array<{ flag: string; dev: number; staging: number; production: number }>
  adoptionTrend: Array<{ date: string; flags: number; rollbacks: number }>
}

export interface FlagFilter {
  keyword?: string
  status?: FlagStatus | ''
  environment?: Environment | ''
  team?: string
  owner?: string
}

export interface ReviewPayload {
  reviewer: string
  decision: 'approved' | 'rejected'
  comment: string
  freezeUntil?: string
  /** 必须明确批准的送审版本；只允许批准自己看到的那一版 */
  revisionId?: string
}
