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

export interface ReleaseSnapshot {
  key: string
  name: string
  description: string
  owner: string
  team: string
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
}

export type ReviewVersionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'invalidated'
  | 'superseded'
  | 'restored'
export type ReviewVersionSource = 'submission' | 'legacy-pending'

export interface VersionChange {
  field: keyof ReleaseSnapshot

  label: string
  before: string
  after: string
}

export interface ReviewVersion {
  id: string
  flagId: string
  versionNumber: number
  source: ReviewVersionSource
  status: ReviewVersionStatus
  checksum: string
  snapshot: ReleaseSnapshot
  createdBy: string
  createdAt: string
  reviewedAt?: string
  reviewer?: string
  comment?: string
  freezeUntil?: string
  invalidatedAt?: string
  invalidatedBy?: string
  changes?: VersionChange[]
  restoredAt?: string
  restoredBy?: string
}

export type ConfigurationState = 'current' | 'drifted' | 'legacy-pending'

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
  reviewVersions: ReviewVersion[]
  approvedVersionId?: string
  runtimeVersionId?: string
  configurationState: ConfigurationState
  runtimeStatus?: FlagStatus
  runtimePercentage?: number
  runtimeSteps?: RolloutStep[]
  createdAt: string
  updatedAt: string
  lastChangedBy: string
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
    | 'approval-invalidated'
    | 'restored-approved'
  actor: string
  summary: string
  before?: string
  after?: string
  versionId?: string
  versionNumber?: number
  affectedUsers: number
  createdAt: string
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
  versionId: string
  freezeUntil?: string
}
