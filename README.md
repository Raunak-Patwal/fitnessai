# Fitness AI Backend & Streamlit UI

Welcome to the **Fitness AI** project! This repository contains a full-stack application designed to generate intelligent, personalized workout routines, track progress, and adapt to user feedback using Reinforcement Learning and Gemini AI.

## Project Structure

The project is divided into several core modules:

### Backend (Node.js + Express + MongoDB)

- **`config/`**: Database connection and environment configurations.
- **`models/`**: Mongoose schemas (e.g., `User`, `Exercise`, `WorkoutLog`, `Program`).
- **`routes/`**: API endpoints (`/auth`, `/exercises`, `/workouts`, `/analytics`).
- **`engine/`**: The core intelligence of the app. Includes `beamSearchPlanner.js`, `fitnessEngine.js`, and specialized modules for cardio, composition, and meso-cycle planning.
- **`safety/`**: Safety constraints (e.g., `fatigueGuard.js`, `jointGuard.js`) to ensure generated workouts are safe and balanced.
- **`learning/`**, **`ml/`**, **`policy/`**, **`state/`**: Reinforcement Learning (RL) and Machine Learning logic to continuously improve workout recommendations.
- **`observability/`**: Logging and tracing pipelines.
- **`tests/`**: API and engine test scripts.

### Frontend (Streamlit)

- **`streamlit_app/`**: A fully featured Streamlit UI for users to register, browse exercises, generate routines, track history, and provide feedback.

## Prerequisites

Before running the project, ensure you have the following installed:
- **Node.js** (v14 or later)
- **Python** (v3.8 or later)
- **MongoDB** (running locally on port `27017` or a cloud URI)

## Setup Instructions

### 1. Environment Variables

Create a `.env` file in the root directory (where `server.js` is located) with the following content (adjust values as needed):

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/fitness_ai
GEMINI_API_KEY=your_gemini_api_key_here
JWT_SECRET=your_jwt_secret_key_here
```

### 2. Backend Setup

1. Open your terminal in the root directory.
2. Install the Node.js dependencies:
   ```bash
   npm install
   ```
3. Start the backend server:
   ```bash
   npm run db:start
   npm start
   ```
   The backend will start running on `http://localhost:5000`.

### 3. Frontend Setup (Streamlit UI)

1. Navigate to the `streamlit_app` directory:
   ```bash
   cd streamlit_app
   ```
2. (Optional but recommended) Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   # Windows
   venv\Scripts\activate
   # Mac/Linux
   source venv/bin/activate
   ```
3. Install the Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run the Streamlit app:
   ```bash
   streamlit run app.py
   ```
   The Streamlit UI will open in your browser at `http://localhost:8501`.

## Database Initialization

The AI planner requires exercise data to generate routines. If your database is empty, you need to populate the `exercises` collection in MongoDB. 

See the `README_UI.md` file for an example document structure or run a database seed script if one is available.

## Key Features

- **Smart Routine Generation**: Uses a Beam Search planner to create well-rounded workouts.
- **Safety Guards**: Prevents overtraining, balances volume, and avoids redundant movements.
- **Reinforcement Learning**: Tracks muscle adaptation and adjusts weights based on user feedback.
- **Generative AI Integration**: Utilizes Gemini for complex reasoning and generating rich workout descriptions.

## Deep Architecture & Component Breakdown

The Fitness AI Backend represents a state-of-the-art approach to automated fitness coaching, acting as a real-time constraint-solver, adaptive learning system, and intelligent orchestrator. The pipeline spans multiple specialized layers to safely generate, score, and evaluate routines.

### 1. The Core Engine Layer (`engine/`)
This is the heart of the AI trainer, primarily responsible for producing optimized workout routines through search algorithms.
- **`fitnessEngine.js`**: The main entry point orchestrator. Given a user's state (experience, goals, preferences) and workout history, it applies Mesocycle State management, calls the search planner, applies rigorous safety constraints, scores the week, and saves the program to the database.
- **`beamSearchPlanner.js`**: Replaces standard greedy logic with a robust **Beam Search Algorithm**. For every slot in a workout day, it generates `K` candidate branching days, dynamically re-ranks candidate exercises against fatigue or stimulus gaps, and retains the top optimal paths.
- **`objectiveFunction.js`**: An 8-term Multi-Objective Scoring mechanism that evaluates the quality of routines (Scores between 0 and 1). Includes components like Goal-Stimulus Alignment (GSA), Weekly Balance Score (WBS), Diversity Entropy (DE), Fatigue Safety (FS), Joint Integrity (JI), Progressive Overload Continuity (POC), Redundancy Penalty (RP), and Recovery Overdraft Penalty (ROP).
- **`mesocycleIntelligence.js` & `muscleAdaptation.js`**: Manage macro periodization. They control the scaling of volume/intensity week-over-week and adjust modifiers based on how a muscle group is adapting to avoid plateaus.
- **`experienceEngine.js`**: Automates user leveling transitions (e.g., advancing from beginner to intermediate) organically tied to their workout adherence.

### 2. The Safety & Constraint Layer (`safety/`)
A dedicated gatekeeper module ensuring the generated routines never compromise the physical well-being of the user.
- **`fatigueGuard.js`**: Checks muscle fatigue levels before scheduling exercises. If a muscle's fatigue is over 90%, it blocks direct training. It also handles reduction flags (70%-90% fatigue).
- **`volumeGuard.js`, `jointGuard.js`, `redundancyGuard.js` & `substitutionGuard.js`**: Implement strict boundaries preventing excessive joint stress overlap (e.g., too many "squat" and "lunge" patterns in a single day), blocking identical movement vectors to avoid redundancy, and ensuring that any AI-driven exercise substitutions strictly respect the initial biomechanical constraints.

### 3. Machine Learning & Progressive Overload Layer (`ml/` & `learning/`)
This layer handles the micro-adjustments required to keep users progressing without hitting plateaus or risking burnout.
- **`ml/progressiveOverload.js`**: Tracks chronological workout logs to dictate the exact sets, reps, and weight recommendations. It behaves differently based on user experience: novices get simple rep increases, whereas advanced lifters get complex dual-progression models factored against RPE (Rate of Perceived Exertion).
- **`learning/learningEngine.js` & `learning/banditEngine.js`**: Interprets direct post-workout feedback from the user (such as pain reports or difficulty ratings). Uses a Multi-Armed Bandit strategy to punish/reward exercises via point adjustments, making the AI less likely to recommend exercises that cause pain in the future while slowly "decaying" (forgetting) old feedback to re-try exercises eventually.

### 4. API & Orchestration Layer (`routes/`)
Maps frontend HTTP requests directly to engine processes.
- **`routes/exercises.js`**: Houses the critical `/routine/generate` endpoint which gathers the user profile, fatigue records, and logs to kickstart the `fitnessEngine`. Also handles generic database querying for browsing movements.
- **`routes/workouts.js`**: Responsible for the real-time execution of the program. Exposes `/track-set` for real-time app checking, handles `/complete` payloads computing adherence scores, and `/adjust` routes for dynamic, mid-workout length alterations (scaling workouts up or down depending on user time constraints).

### 5. Data Modeling Layer (`models/`)
Utilizes strictly validated Mongoose Schemas.
- Core schema files such as **`Exercise.js`**, **`User.js`**, **`Program.js`**, **`WorkoutLog.js`** handle document validation, while **`MuscleHistory.js`** and **`RLWeight.js`** store the hyper-specific reinforcement learning states tailored for each individual.
