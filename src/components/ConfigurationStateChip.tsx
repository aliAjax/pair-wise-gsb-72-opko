import { Chip } from '@mui/material'
import type { ConfigurationState } from '@/types'

const stateMap: Record<ConfigurationState, { label: string; color: 'default' | 'warning' | 'error' }> = {
  current: { label: '批准版本一致', color: 'default' },
  drifted: { label: '批准已失效 · 待重审', color: 'error' },
  'legacy-pending': { label: '旧开关待确认', color: 'warning' },
}

export function ConfigurationStateChip({ state }: { state: ConfigurationState }) {
  const value = stateMap[state]
  return <Chip size="small" color={value.color} variant={state === 'current' ? 'outlined' : 'filled'} label={value.label} />
}
