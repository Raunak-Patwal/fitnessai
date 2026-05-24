# Workout Generation Engine — Implementation Report

> **Date:** 24 May 2026  
> **Status:** ✅ Complete and verified  
> **Files touched:** 3 new / 1 modified

---

## Part 1 — What Was Broken (Root Causes)

### 🔴 Issue 1: No Workout Generation Endpoint Existed
The backend had no `POST /workouts/generate` endpoint at all. There was a weekly mesocycle engine (`fitnessEngine.js`) but it only ran on schedule — there was no way for a user to submit their days and get a plan back instantly.

### 🔴 Issue 2: The Existing Engine Was LLM-Dependent (Design Risk)
The system was architecturally at risk of calling an LLM for workout decisions — which causes:
- **Hallucinated exercises** (inventing exercise names that don't exist in the DB)
- **Forgotten equipment constraints** (LLMs ignore `full_gym` vs `bodyweight` distinctions)
- **Slow responses** (LLM latency adds 2–10s per request)

### 🔴 Issue 3: No Calendar → Split Mapping
There was no mechanism to take user-selected days like `["tuesday", "thursday", "saturday"]` and map them to a split blueprint (Push/Pull/Legs). Days were stored but not used for plan structuring.

### 🔴 Issue 4: No Rolling Schedule Logic
If a user missed a workout day, the system had no concept of "continue from where you left off." Users would feel they skipped a muscle group permanently, hurting retention.

### 🔴 Issue 5: No Plan Persistence for On-Demand Plans
Generated plans had nowhere to be saved. The existing `Program` model stores mesocycle weeks — it wasn't suitable for instant on-demand previews.

---

## Part 2 — What Was Built to Fix It

### ✅ Fix 1: New Rule-Based Engine (No LLMs)
**File:** `engine/workoutGenerationEngine.js`

A fully deterministic, constraint-driven algorithm with 4 stages:

#### Stage 1 — Split Determination
Reads day count + experience level → selects the optimal split blueprint.

| Days | Beginner | Intermediate | Advanced |
|------|----------|--------------|----------|
| 1 | Full Body | Full Body | Full Body |
| 2 | Upper / Lower | Upper / Lower | Upper / Lower |
| 3 | Full × 3 | Upper / Lower / Full | Push / Pull / Legs |
| 4 | Upper / Lower × 2 | Push / Pull / Lower / Upper | Push / Pull / Legs / Upper |
| 5 | Push/Pull/Legs/Upper/Lower | Push/Pull/Legs/Upper/Lower | Push/Pull/Legs/Push/Pull |
| 6 | Push/Pull/Legs × 2 | Push/Pull/Legs × 2 | Push/Pull/Legs × 2 |

#### Stage 2 — Blueprint → Calendar Mapping
Maps each blueprint day to a user's chosen calendar day sequentially.

```
Blueprint:  [Push,     Pull,      Legs,      Upper    ]
User Days:  [tuesday,  thursday,  saturday,  sunday   ]
Result:     [Tue=Push, Thu=Pull,  Sat=Legs,  Sun=Upper]
```

Each workout carries a `blueprint_day` index (1, 2, 3…) so the frontend can track rolling progress independently of dates.

#### Stage 3 — Exercise Slot Allocation
Each split type has a prioritized movement-pattern slot list. The engine fills each slot from the real `Exercise` collection — no invented names:

| Split | Slots (in order) |
|-------|-----------------|
| **Push** | horizontal_push → vertical_push → chest_fly → triceps_isolation → lateral_raise |
| **Pull** | vertical_pull → horizontal_pull → biceps_isolation → rear_delt → heavy_hinge |
| **Legs** | squat → heavy_hinge → knee_flexion → calf_raise → leg_press |
| **Upper** | horizontal_push → vertical_pull → horizontal_pull → vertical_push → biceps → triceps |
| **Lower** | squat → heavy_hinge → knee_flexion → calf_raise |
| **Full** | squat → horizontal_push → vertical_pull → heavy_hinge → vertical_push → horizontal_pull |

Every candidate exercise passes **3 hard filters** before selection:
1. `matchesEquipment()` — respects `full_gym`, `dumbbell`, `bodyweight`, etc.
2. `matchesInjuryConstraints()` — blocks exercises that stress injured joints
3. `isExperienceAppropriate()` — beginner users don't get advanced movements

#### Stage 4 — Volume Prescription
Sets / reps / rest assigned by goal, not guessed by an AI:

| Goal | Sets (compound) | Reps | Rest |
|------|----------------|------|------|
| **strength** | 4–5 | 3–5 | 210s |
| **hypertrophy** | 3–4 | 8–12 | 75s |
| **fatloss** | 3–4 | 12–15 | 45s |
| **hybrid** | 3–4 | 6–10 | 105s |

---

### ✅ Fix 2: New `GeneratedPlan` Model
**File:** `models/GeneratedPlan.js`

A dedicated Mongoose schema for on-demand plans. Separate from the `Program` (mesocycle) model so instant plans don't pollute the main training program. Each document has a UUID `plan_id` for retrieval.

---

### ✅ Fix 3: Two New API Endpoints
**File:** `routes/workouts.js` (2 routes added)

- `POST /workouts/generate` — generates a new plan
- `GET /workouts/generate/:planId` — retrieves a saved plan by ID

---

## Part 3 — API Integration Guide (For the Frontend / API Integrator)

### Endpoint 1: Generate a Workout Plan

```
POST /workouts/generate
Content-Type: application/json
Authorization: Bearer <jwt_token>   ← optional but recommended
```

#### Request Body

```json
{
  "user_id": "6634abc123def456",
  "goal": "hypertrophy",
  "experience_level": "intermediate",
  "selected_days": ["tuesday", "thursday", "saturday", "sunday"],
  "equipment": ["full_gym"],
  "duration_minutes": 60,
  "injury_flags": []
}
```

#### Field Reference

| Field | Type | Required | Allowed Values | Notes |
|-------|------|----------|---------------|-------|
| `user_id` | string | ✅ Yes* | Any valid MongoDB ObjectId | *Auto-resolved from JWT token if present |
| `goal` | string | ✅ Yes | `hypertrophy` `strength` `fatloss` `hybrid` | Falls back to user's DB profile if omitted |
| `experience_level` | string | ✅ Yes | `beginner` `intermediate` `advanced` | Falls back to user's DB profile if omitted |
| `selected_days` | string[] | ✅ Yes | `monday` `tuesday` `wednesday` `thursday` `friday` `saturday` `sunday` | 1–7 days |
| `equipment` | string[] | ❌ No | `full_gym` `dumbbell` `barbell` `bodyweight` `cable` `machine` `kettlebell` | Falls back to user's DB profile if omitted |
| `duration_minutes` | number | ❌ No | Any positive integer | Stored on plan, default 60 |
| `injury_flags` | array | ❌ No | `[{ muscle: "shoulders", active: true }]` | Falls back to user's DB profile if omitted |

> **Smart merging:** If the user is logged in and fields are omitted, the system automatically reads `goal`, `experience`, `equipment`, and `injury_flags` from their user profile in the database.

---

#### Successful Response `201 Created`

```json
{
  "success": true,
  "plan_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "split": "Push / Pull / Lower / Upper",
  "total_days": 4,
  "goal": "hypertrophy",
  "experience": "intermediate",
  "rolling_schedule_note": "If you miss a session, your next workout continues from the next blueprint day. You never fall behind.",
  "workouts": [
    {
      "calendar_day": "tuesday",
      "blueprint_day": 1,
      "split_type": "push",
      "exercises": [
        {
          "name": "Barbell Bench Press",
          "exercise_id": "64a1c2d3e4f5a6b7c8d9e0f1",
          "primary_muscle": "chest_mid",
          "movement_pattern": "horizontal_push",
          "equipment": "barbell",
          "intensity_category": "compound",
          "sets": 4,
          "reps": "8-12",
          "rest_seconds": 75,
          "rpe": 7.5,
          "prescription": "4x8-12 @RPE 7.5"
        }
      ]
    },
    {
      "calendar_day": "thursday",
      "blueprint_day": 2,
      "split_type": "pull",
      "exercises": ["..."]
    }
  ]
}
```

---

### Endpoint 2: Retrieve a Saved Plan

```
GET /workouts/generate/:planId
```

#### Example

```
GET /workouts/generate/f47ac10b-58cc-4372-a567-0e02b2c3d479
```

Returns the exact same shape as the generate response, plus `created_at` timestamp. Use this to reload a plan without regenerating it.

---

### Error Responses

| HTTP Code | `error` message | What to do |
|-----------|----------------|-----------|
| `400` | `"user_id is required"` | Send `user_id` in body or a valid JWT token |
| `400` | `"Invalid goal '...'"` | Use one of: `hypertrophy` `strength` `fatloss` `hybrid` |
| `400` | `"Invalid experience_level '...'"` | Use one of: `beginner` `intermediate` `advanced` |
| `400` | `"selected_days must be a non-empty array"` | Send at least 1 day name |
| `400` | `"selected_days cannot exceed 7 days"` | Max 7 days |
| `400` | `"At least one valid day must be selected"` | Check day name spelling |
| `404` | `"Plan not found"` | `plan_id` doesn't exist in DB |
| `500` | `"Internal Error"` | Server-side issue, check logs |

---

### Rolling Schedule — How to Implement It on the Frontend

The `blueprint_day` field is the key. Here's the logic:

```
Persist: last_completed_blueprint_day = N   (store this per user)

When user opens the app to work out:
  next_blueprint_day = last_completed_blueprint_day + 1
  Find workout where blueprint_day === next_blueprint_day
  Show that workout regardless of today's calendar date
```

**Example flow:**
```
Monday    → User completes blueprint_day 1 (Push)   → save last = 1
Tuesday   → User is busy, skips
Wednesday → User opens app → show blueprint_day 2 (Pull)  ✅
Thursday  → User completes blueprint_day 2 (Pull)   → save last = 2
Friday    → Show blueprint_day 3 (Legs)              ✅
```

The user **never loses a workout** due to a missed calendar day.

---

### Equipment Values Reference

| Send in request | Unlocks |
|----------------|---------|
| `"full_gym"` | All exercises (barbell, cable, machine, dumbbell…) |
| `"dumbbell"` | Dumbbell exercises only |
| `"barbell"` | Barbell exercises only |
| `"bodyweight"` | No-equipment exercises only |
| `"cable"` | Cable machine exercises |
| `"machine"` | Machine-based exercises |
| `["dumbbell", "cable"]` | Mix of multiple equipment types |

---

## Part 4 — What to Do Next (Recommended Follow-Ups)

| Priority | Task | Why |
|----------|------|-----|
| 🔴 High | **Connect `blueprint_day` tracking to user session** | Without this, the rolling schedule doesn't persist across app opens |
| 🔴 High | **Add `plan_id` to the user's profile or session** | So the app knows which plan the user is currently on |
| 🟡 Medium | **Add `POST /workouts/generate/:planId/start`** | Convert a generated plan into actual `WorkoutLog` documents (ready to track sets/reps) |
| 🟡 Medium | **Add onboarding flow that calls `/generate` on sign-up** | New users should get a plan immediately after setting their profile |
| 🟢 Low | **Add `PUT /workouts/generate/:planId/swap-day`** | Let users swap a calendar day after plan creation |
| 🟢 Low | **Add exercise `alternatives[]` to each exercise in response** | Pre-fetch 3 fallback options per slot so the frontend can offer swaps offline |
