import type {
  AudienceRule,
  ConfigChange,
  Dependency,
  FeatureFlag,
  RevisionBoundaryKey,
  RevisionSnapshot,
} from '@/types'

export const boundaryLabels: Record<RevisionBoundaryKey, string> = {
  audienceRules: '受众规则',
  dependencies: '依赖关系',
  rollbackConditions: '回滚边界',
}

const operatorLabels: Record<AudienceRule['operator'], string> = {
  equals: '等于',
  'not-equals': '不等于',
  contains: '包含',
  in: '属于集合',
  gte: '大于等于',
  lte: '小于等于',
}

const dependencyTypeLabels: Record<Dependency['type'], string> = {
  requires: '前置依赖',
  conflicts: '互斥冲突',
  fallback: '降级路径',
}

/** 受审批保护、改动即触发版本失效的三大边界 */
export const boundaryKeys: RevisionBoundaryKey[] = [
  'audienceRules',
  'dependencies',
  'rollbackConditions',
]

export const describeAudienceRule = (rule: AudienceRule): string =>
  `${rule.attribute} ${rule.negate ? '不' : ''}${operatorLabels[rule.operator]} ${rule.value}`

export const describeDependency = (dependency: Dependency): string =>
  `[${dependencyTypeLabels[dependency.type]}] ${dependency.flagId}：${dependency.condition}`

const describeBoundary = (key: RevisionBoundaryKey, flag: FeatureFlag): string[] => {
  if (key === 'audienceRules') return flag.audienceRules.map(describeAudienceRule)
  if (key === 'dependencies') return flag.dependencies.map(describeDependency)
  return [...flag.rollbackConditions]
}

export const takeSnapshot = (flag: FeatureFlag): RevisionSnapshot => ({
  enabled: flag.enabled,
  rolloutPercentage: flag.rolloutPercentage,
  audienceRules: flag.audienceRules.map((rule) => ({ ...rule })),
  regions: [...flag.regions],
  minClientVersion: { ...flag.minClientVersion },
  dependencies: flag.dependencies.map((dependency) => ({ ...dependency })),
  rollbackConditions: [...flag.rollbackConditions],
  metricNames: [...flag.metricNames],
  deadCodeStatus: flag.deadCodeStatus,
  rolloutSteps: flag.rolloutSteps.map((step) => ({
    ...step,
    guardrails: [...step.guardrails],
  })),
})

/** 稳定序列化：与属性顺序无关 */
const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

/** cyrb53 短哈希，仅用于内容指纹展示 */
const hash = (input: string): string => {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < input.length; i += 1) {
    const char = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ char, 2654435761)
    h2 = Math.imul(h2 ^ char, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(8, '0')
}

/** 计算受众 / 依赖 / 回滚边界的内容指纹 */
export const boundaryFingerprint = (flag: FeatureFlag): string => {
  const boundary = {
    audienceRules: flag.audienceRules
      .map((rule) => ({ attribute: rule.attribute, operator: rule.operator, value: rule.value, negate: rule.negate })),
    dependencies: flag.dependencies.map((dependency) => ({
      flagId: dependency.flagId,
      type: dependency.type,
      condition: dependency.condition.trim(),
    })),
    rollbackConditions: flag.rollbackConditions.map((condition) => condition.trim()),
  }
  return hash(stableStringify(boundary))
}

/** 判断两次配置在受保护边界上是否发生变化 */
export const boundaryChanged = (before: FeatureFlag, after: FeatureFlag): boolean =>
  boundaryFingerprint(before) !== boundaryFingerprint(after)

/** 相对上一版本快照计算结构化边界差异 */
export const diffBoundaries = (previous: RevisionSnapshot | undefined, next: FeatureFlag): ConfigChange[] => {
  const changes: ConfigChange[] = []
  for (const key of boundaryKeys) {
    const oldItems = previous
      ? key === 'audienceRules'
        ? previous.audienceRules.map(describeAudienceRule)
        : key === 'dependencies'
          ? previous.dependencies.map(describeDependency)
          : [...previous.rollbackConditions]
      : []
    const newItems = describeBoundary(key, next)
    const removed = oldItems.filter((item) => !newItems.includes(item))
    const added = newItems.filter((item) => !oldItems.includes(item))
    if (added.length > 0 || removed.length > 0) {
      changes.push({ boundary: key, label: boundaryLabels[key], added, removed })
    }
  }
  return changes
}
