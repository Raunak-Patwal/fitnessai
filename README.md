# Fitness AI Backend 🏋️‍♂️🤖

Welcome to the **Fitness AI Backend**, a state-of-the-art, production-ready intelligent fitness coaching engine. This backend isn't just a simple CRUD API—it is a sophisticated, real-time constraint-solving engine that generates hyper-personalized workout routines, adapts to continuous human feedback via Reinforcement Learning, and protects users through advanced biological modeling.

## 🌟 Core Intelligence Features

1. **Beam Search Generation Planner** 🧠
   Instead of using simple templates, the system uses a heuristic Beam Search algorithm to evaluate thousands of exercise combinations. It scores candidate routines based on CNS (Central Nervous System) fatigue, muscle stimulus deficits, biomechanical movement vectors, and equipment availability.

2. **Fatigue & Readiness Engine** 🔋
   Tracks fatigue at a granular, per-muscle level (0-100 scale). As users train, the engine accumulates fatigue for specific muscles (e.g., `quads`, `chest_mid`) and automatically decays it over time. If a muscle is overtrained, the planner automatically forces lighter exercises or full rest.

3. **Dynamic Mesocycle Intelligence** 📈
   Automatically detects when a user is accumulating too much systemic fatigue and dynamically transitions them through Accumulation, Intensification, and **Deload** phases. 

4. **Predictive Plateau Guard** 🛡️
   A background daemon that constantly analyzes historical volume and performance slopes. If it detects that a user's performance on a specific muscle is stagnating while volume is high, it intervenes by automatically swapping out the stalled exercise for a highly-rated "novel" variation to break the plateau.

5. **Injury Prevention & Recovery System** 🩹
   Monitors user-reported pain levels. If a user reports pain (≥7/10) on a specific joint or muscle cluster within a rolling 14-day window, the engine activates a protective "Injury Flag." All exercises stressing that area are strictly banned until 14 pain-free days have passed.

6. **Period Mode (Menstrual Cycle Protection)** 🌸
   A specialized toggle for female users. When active, the core engine mathematically bans all movements involving high intra-abdominal pressure (Heavy Squats, Deadlifts, Core work) and strictly limits routines to "Light Upper", "Light Pull", and "Light Push" with reduced RPE and total central volume.

7. **Reinforcement Learning (RL) Ranking** 🤖
   The selection pool utilizes an RL-based scoring mechanism. Exercises are ranked not just by scientific viability, but dynamically adjusted based on the individual user's historical ratings (+/- feedback). Exercises that consistently cause pain are heavily blacklisted.

## ⚙️ Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB (Mongoose)
- **AI/ML:** Custom Heuristic Beam Search & RL Multi-Armed Bandit Scoring
- **LLM Integration:** Gemini AI (for rich exercise descriptions and feedback parsing)

## 🚀 Setup & Installation

### 1. Environment Variables
Create a `.env` file in the root directory:
```env
PORT=5000
MONGO_URI=mongodb+srv://<your-username>:<your-password>@cluster0...
JWT_SECRET=super_secret_production_key
GEMINI_KEY_1=your_api_key_here
```

### 2. Run the Server
```bash
npm install
npm start
```
The server will run on `http://localhost:5000`.

## 🌐 API Architecture

The backend operates as a headless REST API, easily consumed by React Native, Flutter, Swift, or Next.js frontends.

- **`POST /api/users/register`**: Onboard a new user with Goal, Experience, and Equipment parameters.
- **`GET /api/program/:userId`**: Request the AI to generate the optimized weekly workout routine.
- **`POST /api/workouts/log/:userId`**: The critical feedback loop. Send completed sets, reps, pain levels, and user ratings to instantly update the Fatigue, Plateau, Injury, and RL databases.
- **`GET /api/program/explain/:userId`**: The "God Mode" Explainability API. Returns a localized (Hinglish/English) human-readable summary of the exact mathematical reasons the AI is making its current decisions (e.g., why it triggered a deload).
- **`GET /api/analytics/...`**: Dedicated endpoints to fetch chart-ready data for Volume Trends, Strength Curves, and Muscle Fatigue history.

## 🧪 Validated by Mega Testing
The engine's reliability is validated by rigorous 24-week Monte Carlo simulations (`megaTest24Weeks.js`) spanning diverse profiles (e.g., *Fatloss Beginner Female*, *Hypertrophy Advanced Male*). These simulations guarantee 100% adherence to biomechanical correctness, progressive overload, and safety constraints over long time horizons.

---
*Built for the future of automated, intelligent strength and conditioning.* 🚀🏋️‍♀️
