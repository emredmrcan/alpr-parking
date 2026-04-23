export interface PlateCandidate {
  plate: string
  raw_ocr: string
  confidence: number
  is_valid: boolean
  bbox: number[]
}

export interface RecognitionResult {
  success: boolean
  best: PlateCandidate | null
  candidates: PlateCandidate[]
  image_path: string | null
  error: string | null
}

export interface Session {
  id: number
  plate_number: string
  raw_ocr_text: string | null
  entrance_time: string
  exit_time: string | null
  duration_minutes: number | null
  amount_due: string | null
  amount_paid: string | null
  status: 'ACTIVE' | 'PAID'
  entered_manually: boolean
  image_path: string | null
  exit_image_path: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SessionListResponse {
  total: number
  items: Session[]
}

export interface PriceSummary {
  session_id: number
  plate_number: string
  entrance_time: string
  duration_minutes: number
  amount_due: string
}

export interface PriceRule {
  id: number
  duration_from_min: number
  duration_to_min: number | null
  price: string
  label: string | null
  created_at: string
}

export interface TodayStats {
  active_count: number
  total_today: number
  revenue_today: number
  avg_duration_minutes: number | null
}

export interface SessionCreatePayload {
  plate_number: string
  raw_ocr_text?: string | null
  entered_manually: boolean
  image_path?: string | null
  notes?: string | null
  gate_id?: number
  trigger_barrier?: boolean
}

export interface ExitConfirmPayload {
  amount_paid: number
  exit_image_path?: string | null
  notes?: string | null
  gate_id?: number
  trigger_barrier?: boolean
}

export interface BarrierTriggerResult {
  triggered: boolean
  event_id: number | null
  notes: string | null
}

export interface SessionActionResult {
  session: Session
  barrier: BarrierTriggerResult | null
}

export interface PriceRulePayload {
  duration_from_min: number
  duration_to_min: number | null
  price: number
  label: string | null
}

export interface GateCandidate {
  gate_id: number
  plate: string
  raw_ocr: string
  confidence: number
  is_valid: boolean
  detected_at: string
}

/** One physical gate: camera + barrier pair (backend: parking_gates). */
export interface ParkingGate {
  id: number
  label: string
  sort_order: number
  is_active: boolean
  camera_source: string
  barrier_driver: string
  barrier_port: string | null
  barrier_relay_channel: number
  barrier_ip_url: string | null
  barrier_open_duration_sec: number
  barrier_timeout_sec: number
  created_at: string
  updated_at: string
}

export interface GateBarrierHealth {
  gate_id: number
  label: string
  connected: boolean
  driver: string
  barrier_driver: string
}
