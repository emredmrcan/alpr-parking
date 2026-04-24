import client from '@/api/client'
import type { CameraDiscoveryItem } from '@/types/api'

export const camerasApi = {
  discover: () =>
    client.post<CameraDiscoveryItem[]>('/cameras/discover').then((r) => r.data),
}
