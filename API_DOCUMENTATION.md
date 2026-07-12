# Fitness AI Platform — Complete Developer Integration Guide

> **Base URL (Production):** `https://fitnessai-5rja.onrender.com`
> **Base URL (Local):** `http://localhost:5000`
> **Swagger UI:** `http://localhost:5000/docs`

---

## ?? Rules for Integration

### Header (Sabse important)
Saare protected routes (??) mein ye header **MUST** bhejo:
```
Content-Type: application/json
Authorization: Bearer <token>
```
Token register ya login se milta hai. Ise secure storage mein save karo.

---

## 1. REGISTER — `POST /auth/register`

**Header:**
```
Content-Type: application/json
```
*(No token needed)*

**Body:**
```json
{
  "name": "Raunak",
  "email": "raunak@gmail.com",
  "password": "Test@1234",
  "goal": "strength",
  "experience": "intermediate",
  "gender": "male",
  "training_days_per_week": 5,
  "age": 25,
  "weight": 75,
  "height": 175,
  "recovery_profile": "fast",
  "equipment": ["barbell", "dumbbell"],
  "injury_flags": []
}
```

**Allowed Values:**

| Field | Options |
|---|---|
| `goal` | `hypertrophy` `strength` `fatloss` `hybrid` |
| `experience` | `beginner` `intermediate` `advanced` |
| `gender` | `male` `female` `other` |
| `recovery_profile` | `fast` `moderate` `slow` |
| `training_days_per_week` | 1 to 7 |

**Response:**
```json
{
  "user": {
    "id": "6a52a477f716f80464d7cf25",
    "name": "Raunak",
    "email": "raunak@gmail.com",
    "goal": "strength",
    "experience": "intermediate",
    "gender": "male",
    "training_days_per_week": 5,
    "age": 25,
    "weight": 75,
    "height": 175,
    "recovery_profile": "fast",
    "equipment": ["barbell", "dumbbell"],
    "injury_flags": [],
    "role": "user"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## 2. LOGIN — `POST /auth/login`

**Header:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "email": "raunak@gmail.com",
  "password": "Test@1234"
}
```

**Response:**
```json
{
  "user": { "id": "...", "name": "Raunak", ... },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## 3. ONBOARDING — `POST /users/onboarding` ??

Register ke baad AI engine initialize karne ke liye **ek baar** call karo.

**Header:**
```
Content-Type: application/json
Authorization: Bearer <token>
```

**Body (minimum required):**
```json
{
  "name": "Raunak",
  "training_days_per_week": 5
}
```

**Response:**
```json
{
  "success": true,
  "message": "Onboarding complete. AI Engine initialized.",
  "user": { ... },
  "activeWorkout": {
    "day": "push",
    "dayIndex": 0,
    "totalDays": 5,
    "exercises": [ ... ],
    "status": "planned"
  }
}
```

---

## 4. GET USER PROFILE — `GET /users/:userId` ??

**Header:**
```
Authorization: Bearer <token>
```

**URL:**
```
GET /users/6a52a477f716f80464d7cf25
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "6a52a477f716f80464d7cf25",
    "name": "Raunak",
    "email": "raunak@gmail.com",
    "goal": "strength",
    "experience": "intermediate",
    "gender": "male",
    "age": 25,
    "weight": 75,
    "height": 175,
    "training_days_per_week": 5,
    "recovery_profile": "fast",
    "equipment": ["barbell", "dumbbell"],
    "injury_flags": []
  }
}
```

---

## 5. TODAY'S WORKOUT — `GET /workouts/today/:userId` ??

**Header:**
```
Authorization: Bearer <token>
```

**URL:**
```
GET /workouts/today/6a52a477f716f80464d7cf25
```

**Response:**
```json
{
  "success": true,
  "data": {
    "workoutId": "6a53...",
    "day": "push",
    "dayIndex": 0,
    "totalDays": 5,
    "exercises": [
      {
        "exerciseId": "...",
        "name": "Barbell Bench Press",
        "primary_muscle": "chest_mid",
        "equipment": "barbell",
        "target_sets": 3,
        "target_reps": 8,
        "target_rpe": 8,
        "status": "pending"
      }
    ]
  }
}
```

---

## 6. WEEK SPLIT — `GET /workouts/days/:userId` ??

Sirf day names fetch karo (lightweight — dashboard ke liye).

**Header:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "totalDays": 5,
  "days": [
    { "dayIndex": 0, "dayName": "push", "muscles": ["chest", "shoulders", "triceps"], "exerciseCount": 5 },
    { "dayIndex": 1, "dayName": "pull", "muscles": ["back", "biceps"], "exerciseCount": 5 }
  ]
}
```

---

## 7. COMPLETE WORKOUT — `POST /workouts/complete` ??

**Header:**
```
Content-Type: application/json
Authorization: Bearer <token>
```

**Body:**
```json
{
  "workoutId": "6a53...",
  "mode": "bulk",
  "exercises": [
    {
      "exerciseIndex": 0,
      "actual_sets": 3,
      "actual_reps": 8,
      "weight": 80,
      "rpe": 7,
      "status": "completed"
    },
    {
      "exerciseIndex": 1,
      "status": "skipped",
      "reason": "too tired"
    }
  ]
}
```

---

## 8. TRACK SET — `POST /workouts/track-set` ??

Har set ke baad call karo (live tracking).

**Header:**
```
Content-Type: application/json
Authorization: Bearer <token>
```

**Body:**
```json
{
  "workoutId": "6a53...",
  "exerciseIndex": 0,
  "setsCompleted": 2,
  "weight": 80,
  "rpe": 7
}
```

---

## 9. SKIP EXERCISE — `POST /workouts/skip` ??

**Header:**
```
Content-Type: application/json
Authorization: Bearer <token>
```

**Body:**
```json
{
  "workoutId": "6a53...",
  "exerciseIndex": 1,
  "reason": "knee pain"
}
```

---

## 10. GENERATE WORKOUT (AI) — `POST /workouts/generate` ??

**Header:**
```
Content-Type: application/json
Authorization: Bearer <token>
```

**Body:**
```json
{
  "goal": "strength",
  "experience_level": "intermediate",
  "selected_days": ["Monday", "Wednesday", "Friday", "Saturday"],
  "equipment": ["barbell", "dumbbell"],
  "duration_minutes": 60,
  "injury_flags": []
}
```

---

## 11. ANALYTICS — `GET /analytics/summary/:userId` ??

**Header:**
```
Authorization: Bearer <token>
```

---

## 12. PROGRAM — `GET /program/:userId` ??

**Header:**
```
Authorization: Bearer <token>
```

---

## ?? Typical Integration Flow

```
Step 1: POST /auth/register  ? Token lo + user profile save karo
Step 2: POST /users/onboarding ? AI engine initialize karo (ek baar)
Step 3: GET /workouts/today/:userId ? Aaj ka workout dikhao
Step 4: POST /workouts/track-set ? Har set ke baad (live)
Step 5: POST /workouts/complete ? Workout khatam par
Step 6: GET /analytics/summary ? Progress dikhao
```

---

## ? Common Mistakes

| Galti | Fix |
|---|---|
| `Authorization` header missing | Sab ?? routes pe `Bearer <token>` bhejo |
| `Content-Type` missing | POST/PUT mein `application/json` set karo |
| `gender`/`training_days_per_week` missing | Register mein saare fields bhejo |
| Workout complete bina `workoutId` | Pehle `/workouts/today` se `workoutId` lo |
| Token expire hone ke baad 401 | `POST /auth/login` se naya token lo |
