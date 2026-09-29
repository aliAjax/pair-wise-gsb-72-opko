import type { ReviewVersion } from '@/types'

export const formatVersionTime = (value: string) => {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
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

export const versionStatusColor = (
  status: ReviewVersion['status'],
): 'default' | 'success' | 'error' | 'warning' | 'info' => {
  switch (status) {
    case 'approved':
    case 'restored':
      return 'success'
    case 'rejected':
      return 'error'
    case 'invalidated':
      return 'warning'
    case 'pending':
      return 'info'
    default:
      return 'default'
  }
}
