/**
 * Types mirroring the foodsharing hackathon API (v2.4.0).
 * Source of truth: `Foodsharing API/SCHEMA.md` in this repo, and
 * https://app-foodsharing-hackathon.azurewebsites.net/openapi.json
 *
 * Only fields the docs actually guarantee are declared here — the task brief
 * asks us to rely on documented fields only.
 */

export interface Verification {
  status: 'quiz_pending' | 'trial_pending' | 'approval_pending' | 'verified'
  is_verified: boolean
  quiz_passed: boolean
  quiz_passed_at: string | null
  trial_pickups_completed: number
  trial_pickups_required: number
  mentor_approved: boolean
  mentor_approved_at: string | null
  verified_at: string | null
  may_pick_up: boolean
  may_pick_up_from_business: boolean
  may_earn_rewards: boolean
  next_step: string | null
}

export interface User {
  id: number
  team_id: number
  team_name: string
  display_name: string
  is_default: boolean
  joined_at: string
  pickups_completed: number
  trial_pickups_completed: number
  verification: Verification
}

export interface FoodSharePoint {
  id: number
  name: string
  description: string | null
  address: string | null
  lat: number
  lon: number
  opening_hours: string | null
  region_id: number | null
  /** only set when the request used a radius search */
  distance_km: number | null
}

export type BasketStatus = 'available' | 'requested' | 'picked_up' | 'expired'
export type RequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'picked_up'

export interface PickupRequestSummary {
  requester_id: number
  status: RequestStatus
  requested_at: string
}

export interface Basket {
  id: number
  title: string
  description: string | null
  lat: number
  lon: number
  food_types: string[] | null
  status: BasketStatus
  created_by_user_id: number | null
  created_at: string
  /** hard cut-off: the API refuses pickups at or after this instant */
  expires_at: string
  distance_km: number | null
  /** only present on GET /baskets/{id} */
  pickup_requests?: PickupRequestSummary[]
}

export interface Business {
  id: number
  name: string
  lat: number
  lon: number
}

export type PickupSource = 'basket' | 'food_share_point' | 'business'

export interface Pickup {
  id: number
  source: PickupSource
  picked_up_at: string
  was_trial: boolean
  food_share_point_id: number | null
  food_share_point_name: string | null
  business_id: number | null
  business_name: string | null
  basket_id: number | null
  basket_title: string | null
  basket_created_at: string | null
  basket_expires_at: string | null
  food_types: string[] | null
  lat: number | null
  lon: number | null
}

/** /pickups/sample replaces `id` with a pseudonym and drops user identity */
export type SamplePickup = Omit<Pickup, 'id'> & { person: string }

/** Shape of FastAPI error bodies we actually surface to the user. */
export interface ApiErrorDetail {
  error?: string
  message?: string
  verification?: Verification
}
