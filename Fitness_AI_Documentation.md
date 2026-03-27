# Fitness AI Backend - Detailed Project Documentation

Yeh document Fitness AI backend engine ka complete detailed overview hai. Isme hum saare features, backend architecture ka flow, MongoDB database ki detailed schema logic, folder aur file structure ka purpose, aur unko start/run karne ki saari commands cover karenge.

---

## 🚀 Key Features of Fitness AI
1. **Smart Routine Generation (Beam Search Planner):** Simple greedy algorithms ki jagah, ye system Beam Search Algorithm use karta hai jo multiple candidate branching days generate karta hai aur unme se optimal muscle combinations and fatigue states ke basis par best workout day chunta hai.
2. **Safety & Constraint Checks (Multi-Guards):** User ki safety sabse important hai.
   - **Fatigue Guard:** Kisi muscle ki fatigue > 90% hone par direct train nahi karne deta.
   - **Joint/Volume & Redundancy Guard:** Ek session me same joint stress (jaise shoulder pe lgaatar dabav) aur ek jaise movement patterns ko filter out karta hai.
3. **Progressive Overload & Reinforcement Learning (RL):**  
   - Users ke complete kiye gaye workouts ko ML algorithm track karta hai.
   - Naye users (beginners) ke liye simple sets/reps increase hota hai. Advance users ke liye RPE-based dual-progression model kaam karta hai.
   - **Multi-Armed Bandit Strategy:** User ke feedback (jaise difficulty score ya pain report) se samjhta hai. Jin exercise se pain hota hai unka score kam karke future mei block karta hai, aur dhire-dhire decay factor se revisit karta hai.
4. **Mesocycle Intelligence:** Workout load (volume, intensity) ko week-on-week scale and progress karta hai taaki muscular plateaus hit na hon. Leveling engine se user apne adherence ke based par 'beginner' se 'intermediate/advanced' tak organically switch hota hai.

---

## 🗄️ Database Architecture (MongoDB Schemas)

Database ko MongoDB (Mongoose ODM) pe banaya gaya hai jiska primary maqsad fast fetching aur structured metrics store karna hai.

### 1. `User` (User Profile & Stats)
User details store hoti hai. Isme user ki age, gender, weight, height ke alawa **fitness capabilities** (hypertrophy, fat loss aadi) store hote hain.  
- Fields: `name`, `email`, `password` (hashed with bcrypt), `goal`, `experience` (beginner, advanced), `training_days_per_week`, `equipment` lists, `recovery_profile`, aur `injury_flags`.

### 2. `Exercise` (Universal Exercise Database)
Yeh application ka encyclopedia hai. Har ek exercise ki bio-mechanical information detail me mapped hai.  
- Fields: `name`, `primary_muscle`, `secondary_muscles`, `movement_pattern`, `force_vector`, `dominant_joint`, `fatigue_cost`, `joint_stress` (knee, hip, shoulder aadi point-value par), aur `difficulty`.

### 3. `Program` (Generated Week/Macro-plans)
User ka pura routine as an object save hota hai jise dashboard read karta hai.  
- Fields: `userId`, `goal`, `mesocycle_phase`, `objective_score`, aur ek `weeks` ka array jisme saare din ke generated schedules ek nested array list (`routine`) ke format me hote hain.

### 4. `WorkoutLog` (Daily Tracking & Session Record)
Jab user workout chalu karta hai, ek naya record add hota hai. Isme target reps/weights vs actual hit count save hota hai jise RL models update karte hain.
- Fields: `userId`, `exercises` (array containing `target_sets`, `actual_sets`, `fatigue_impact`, `rl_weight_at_time`, `difficulty`, `pain_level`), and `session_summary` containing `adherence_score` and workout metadata.

### 5. Other specialized Models (`Fatigue`, `RLWeight`, `Feedback`, `MuscleHistory`)
Yeh secondary state tracking tables hain jo core prediction engine ko specific input dete rehte hain taaki engine ko hamesha latest fatigue and bias update milti rahe.

---

## 📂 Folder System & File Flow (Konsi file kya kaam kar rahi hai?)

1. **`routes/` (Network Endpoints):** HTTP requests define hote hain (e.g., `/exercises`, `/workouts`, `/program`). Postman ya Frontend yaha hit karte hain.
2. **`models/` (Mongoose Schemas):** Database schemas yahan likhe gaye hain.
3. **`engine/` (Core Brain / Planner):** 
   - `fitnessEngine.js`: Head orchestrator. User constraints collect karke planner initiate karta hai.
   - `beamSearchPlanner.js`: Mathematical ranking and filtering. Real routine yehi model karta hai.
   - `objectiveFunction.js`: Multi-Objective Scoring apply karta hai. Ex: WBS, Fatigue Safety, Joint Integrity aadi check karke 0 se 1 ke beech score deta hai.
   - `mesocycleIntelligence.js` & `experienceEngine.js`: Progression handling logic.
4. **`safety/` (Protection Layers):** 
   - `fatigueGuard.js`, `jointGuard.js`, `volumeGuard.js`: Filter aur constraints lagate hain exercise map fetch karne ke baad, taaki list safety parameters pass karke hi aage jaaye.
5. **`learning/` & `ml/` (AI Adaptation):** 
   - `ml/progressiveOverload.js`: Reps/Weights ka calculation track karta hai.
   - `learning/banditEngine.js`: Reinforcement learning ka logic. Pain aur low-rating waali exercises hatana aur optimize karna.
6. **`streamlit_app/` (Frontend UI Folder):** Python Streamlit app jo API connect kar ke UI render karti hai.

---

## 🛠️ Step-by-Step Commands to Start Everything

Bhai puri setup ko run karne ke steps niche likhe hain. Ek naya terminal khol le source index open location (backend folder) pe aur flow follow kar:

### 1. Environment Configurations Set Karna (Backend Folder)
Make sure teri list mein ek `.env` file padi ho backend root par (`server.js` ke baaju me):
```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/fitness_ai
GEMINI_API_KEY=tu_apni_gemini_api_key_yaha_daal
JWT_SECRET=super_secret_jwt_random_string
```

### 2. Database and Backend Chalu Karna
1. **Dependencies install maar:**
   ```bash
   npm install
   ```
2. **MongoDB server start kar** (agar locally installed hai) script se:
   ```bash
   npm run db:start
   ```
   *(Ye tera `start-mongo.ps1` execute karke local mongodb up kar dega).*

3. **Backend Node Server Start Kar:**
   ```bash
   npm run dev
   # (ya fir 'npm start' without watcher)
   ```
   *Terminal pe "Server running on port 5000" dikhega.*

### 3. Frontend App (Streamlit) Chalu Karna
Ek Naya Powershell/Terminal Window khol:
1. Streamlit app vaale folder mei ja:
   ```bash
   cd streamlit_app
   ```
2. Python Virtual Env bana aur activate kar (Windows version):
   ```bash
   python -m venv venv
   .\venv\Scripts\activate
   ```
3. Python packages install kar:
   ```bash
   pip install -r requirements.txt
   ```
4. Streamlit start maar:
   ```bash
   streamlit run app.py
   ```
   *Browser khud popup hoga at `http://localhost:8501`.*

---
**Done bhai! ✨ Tera database start hai, API listening hai aur UI us API se baat kar raha hai.** Ab user registration aur workout generation proper work karenge!
