# Fitness AI Platform — Unified Developer API Handbook

Welcome to the official developer documentation for the **Fitness AI Platform Backend**. This guide serves as an authoritative integration manual for frontend engineering teams to easily authenticate, track performance, and retrieve workout programs.

## Key Upgrades in Version 1.1.0:
1. **Unified Authentication**: Login and registration logic under `/api/auth` and `/api/users` are 100% synchronized, using a single authoritative controller.
2. **Bearer JWT Authorization**: Secure routes accept the standard header `Authorization: Bearer <token>`, resolving user IDs dynamically and securely without requiring hardcoded path parameters.
3. **High-Performance Daily Lazy Loading**: Eradicate API lag completely! Instead of querying the massive, multi-week historical program array, the frontend can query lightweight week splits and fetch exercise details for just the active/planned day.

---

## 1. Core Architecture & Auth

### Base URL
```
http://localhost:5000/api
```

### Interactive Sandbox (Swagger UI)
An interactive OpenAPI documentation sandbox is served directly from the server for easy payload testing and live route execution:
- **URL**: `http://localhost:5000/docs`
- **Testing Authorized Endpoints**: Log in or register, copy the `token` string, click **Authorize** at the top right of the Swagger page, and input: `Bearer YOUR_TOKEN_STRING`.

---

## 2. Authentication & User APIs

### [POST] User Registration
Unified endpoint to sign up a new user. The system automatically initializes their recovery profile, experience scores, and injury safeguards.
- **Route**: `POST /auth/register` or `POST /users/register`
- **Body Request**:
  ```json
  {
    "name": "Alex Carter",
    "email": "alex@fitai.com",
    "password": "securepassword123",
    "goal": "hypertrophy",
    "experience": "intermediate",
    "equipment": ["bodyweight", "barbell", "dumbbells"]
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "user": {
      "id": "603f7e1b5b4e7230fc6e7a2d",
      "name": "Alex Carter",
      "email": "alex@fitai.com",
      "goal": "hypertrophy",
      "experience": "intermediate",
      "equipment": ["bodyweight", "barbell", "dumbbells"]
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```

### [POST] User Login
Retrieve a secure token. Password comparisons are securely compiled and evaluated.
- **Route**: `POST /auth/login` or `POST /users/login`
- **Body Request**:
  ```json
  {
    "email": "alex@fitai.com",
    "password": "securepassword123"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "user": {
      "id": "603f7e1b5b4e7230fc6e7a2d",
      "name": "Alex Carter",
      "email": "alex@fitai.com",
      "goal": "hypertrophy",
      "experience": "intermediate",
      "equipment": ["bodyweight", "barbell", "dumbbells"]
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```

### [GET] User Profile
Fetch details for a logged-in user. Automatically maps from token if path variable is omitted.
- **Route**: `GET /users/:userId?`
- **Headers**: `Authorization: Bearer <token>`
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "user": {
      "_id": "603f7e1b5b4e7230fc6e7a2d",
      "name": "Alex Carter",
      "email": "alex@fitai.com",
      "goal": "hypertrophy",
      "experience": "intermediate",
      "equipment": ["bodyweight", "barbell", "dumbbells"],
      "createdAt": "2026-05-21T12:00:00.000Z"
    }
  }
  ```

---

## 3. High-Performance Daily Workout APIs (Lazy Loaded)

To guarantee a lag-free experience on mobile apps and websites, **do not fetch the entire multi-week program**. Instead, use these two lightweight routes to get split structures and single-day details:

### [GET] Fetch Week Split Metadata (Payload < 1 KB)
Returns the training days of the current week's split (metadata only). This allows the frontend to quickly render tab layouts or a list of training days for the week without loading heavy exercise lists.
- **Route**: `GET /workouts/days/:userId?`
- **Headers**: `Authorization: Bearer <token>`
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "userId": "603f7e1b5b4e7230fc6e7a2d",
    "currentWeek": 1,
    "mesocyclePhase": "accumulation",
    "totalDays": 3,
    "days": [
      {
        "dayIndex": 0,
        "dayName": "push_a",
        "label": "Day 1: Push A",
        "muscles": ["chest", "shoulders", "triceps"],
        "exerciseCount": 5
      },
      {
        "dayIndex": 1,
        "dayName": "pull_a",
        "label": "Day 2: Pull A",
        "muscles": ["back", "biceps"],
        "exerciseCount": 5
      },
      {
        "dayIndex": 2,
        "dayName": "legs_a",
        "label": "Day 3: Legs A",
        "muscles": ["quads", "hamstrings", "glutes", "calves"],
        "exerciseCount": 4
      }
    ]
  }
  ```

### [GET] Fetch Single Day Workout Details
Returns the complete planned or logged exercises for a specific day. Highly performance-optimized.
- **Route**: `GET /workouts/day/:userId?`
- **Headers**: `Authorization: Bearer <token>`
- **Query Parameters**:
  - `dayIndex` (integer, 0-indexed): Index of the day (e.g. `0`, `1`, `2`)
  - `dayName` (string): Alternately, name of the day (e.g. `push_a`)
  - `start` (boolean, optional): If `true`, starts the workout and registers a `WorkoutLog` in-progress.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "workoutId": "603f7f455b4e7230fc6e7a3f",
      "day": "push_a",
      "dayIndex": 0,
      "totalDays": 3,
      "status": "in_progress",
      "exercises": [
        {
          "name": "Barbell Bench Press",
          "sets": 4,
          "reps": 8,
          "rpe_target": 8,
          "weight_suggestion": 60,
          "primary_muscle": "chest"
        }
      ],
      "rlScores": {
        "603f7e3c5b4e7230fc6e7a30": 0.85
      }
    }
  }
  ```

### [GET] Today's Workout Status
Retrieves today's active workout. Resolves which day the user is on based oncompleted days.
- **Route**: `GET /workouts/today/:userId?`
- **Headers**: `Authorization: Bearer <token>`

---

## 4. Program & Analytics APIs

### [GET] Complete Program Object
- **Route**: `GET /program/:userId?`
- **Headers**: `Authorization: Bearer <token>`

### [GET] Explainability Logic Report
Provides a complete analysis of the algorithmic decisions, explaining progression multipliers, plateau detection, and volume thresholds tailored for the user.
- **Route**: `GET /program/explain/:userId?`
- **Headers**: `Authorization: Bearer <token>`

### [GET] Analytics Summary
Fetches volume trends, weekly adherence metrics, fatigue levels, progressive overload graphs, and RL preferences in a single call.
- **Route**: `GET /analytics/summary/:userId?`
- **Headers**: `Authorization: Bearer <token>`

---

## 5. Frontend Integration Guide (No-Lag Best Practice)

To build a flawless, ultra-responsive client experience:

1. **Dashboard Loading**:
   - On app launch, query `GET /workouts/days`.
   - Render the days (e.g. "Day 1: Push A", "Day 2: Pull A", "Day 3: Legs A") in a beautiful slider.
2. **Workout Details Preview**:
   - When a user taps on any day in the list, call `GET /workouts/day?dayIndex=X` (replace `X` with the day's index).
   - Display the exercises and reps immediately. No lag!
3. **Beginning a Session**:
   - When the user clicks "Start Workout", call `GET /workouts/day?dayIndex=X&start=true`.
   - Capture the returned `workoutId` to post set completions via `POST /api/workouts/track-set` and completion via `POST /api/workouts/complete`.
