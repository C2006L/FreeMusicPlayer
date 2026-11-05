import { http } from '@/utils/http'
export const workspaceRequest = async <T = any>(
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  data?: unknown,
  signal?: AbortSignal
): Promise<T> => {
  const result = await http<{ code: number; message: string; data: T }>(
    method,
    `/workspace${path}`,
    { data, signal }
  )
  if (result.code !== 0) throw new Error(result.message || '操作失败')
  return result.data
}
