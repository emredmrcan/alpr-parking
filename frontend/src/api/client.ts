import axios from 'axios'
import { toast } from 'sonner'

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
})

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      toast.error('Sunucuya ulaşılamıyor. Bağlantınızı kontrol edin.')
      return Promise.reject(error)
    }
    const status = error.response?.status
    if (status >= 500) {
      toast.error('Sunucu hatası. Lütfen tekrar deneyin.')
    }
    return Promise.reject(error)
  },
)

export default client
