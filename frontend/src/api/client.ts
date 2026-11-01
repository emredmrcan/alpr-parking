import axios from 'axios'
import { toast } from 'sonner'
import i18n, { currentLang } from '@/i18n'

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
})

client.interceptors.request.use((config) => {
  config.headers.set('Accept-Language', currentLang())
  return config
})

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      toast.error(i18n.t('errors.network'))
      return Promise.reject(error)
    }
    const status = error.response?.status
    if (status >= 500) {
      toast.error(i18n.t('errors.server'))
    }
    return Promise.reject(error)
  },
)

export default client
