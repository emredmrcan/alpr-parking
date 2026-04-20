import axios from 'axios'
import type { RecognitionResult } from '@/types/api'

export const recognizeApi = {
  upload: (file: File): Promise<RecognitionResult> => {
    const form = new FormData()
    form.append('file', file)
    return axios
      .post<RecognitionResult>('/api/recognize', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60_000,
      })
      .then((r) => r.data)
  },
}
