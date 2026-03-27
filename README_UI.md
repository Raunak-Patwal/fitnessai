# Fitness AI Trainer - Streamlit UI

A beautiful Streamlit interface for the Fitness AI Backend API.

## Features

- 🔐 User registration and authentication
- 🏋️ Browse and search exercises
- 🎯 Generate personalized workout routines
- 📊 View workout history
- 💬 Submit feedback for better recommendations
- 🔄 Replace exercises in routines
- 📱 Responsive design with sidebar navigation

## Setup

### Option 1: Full Setup (Backend + UI)
1. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Start MongoDB** (if using backend)

3. **Start the backend server:**
   ```bash
   npm install
   npm start
   ```
   Backend runs on `http://localhost:5000`

4. **Run the Streamlit app:**
   ```bash
   streamlit run app.py
   ```

5. **Open your browser** to `http://localhost:8501`

### Option 2: Demo Mode (UI Only)
If you can't set up the backend, use **Demo Mode**:

1. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Run the Streamlit app:**
   ```bash
   streamlit run app.py
   ```

3. **Enable Demo Mode:**
   - Check the "🎭 Demo Mode" toggle in the sidebar
   - All features work with mock data - no backend required!

4. **Open your browser** to `http://localhost:8501`

## Usage

### Getting Started
1. **Register** a new account or **Login** with existing credentials
2. **Generate Routine** - Select your goals, experience, and workout frequency
3. **View Exercises** - Browse the exercise database with filters
4. **Track Progress** - Check your workout history
5. **Provide Feedback** - Help improve future recommendations

### Key Features

- **Smart Routine Generation**: Creates 7-day plans with proper rest days
- **Experience-Based Training**: Adjusts intensity based on your level
- **Real-time Feedback**: Submit feedback to refine AI recommendations
- **Exercise Replacement**: Find suitable alternatives for injured muscles
- **Progress Tracking**: Monitor your workout history and performance

## API Integration

The UI connects to all backend endpoints:
- Authentication (`/auth/register`, `/auth/login`)
- Exercise management (`/exercises`, `/exercises/search`, etc.)
- Routine generation (`/exercises/routine/generate`)
- Feedback system (`/exercises/feedback`)
- Workout tracking (`/workouts/history`)
- Exercise replacement (`/exercises/routine/replace`)

## Requirements

- Python 3.8+
- Node.js 14+
- MongoDB (running on default port 27017)
- Streamlit
- Requests library

## Database Setup

The application requires exercise data in MongoDB. If you see "0 exercises found", you need to populate the database:

1. **Connect to MongoDB** using MongoDB Compass or mongo shell
2. **Insert exercise documents** into the `fitness_ai.exercises` collection
3. **Example document:**
```json
{
  "name": "Bench Press",
  "primary_muscle": "chest",
  "secondary_muscles": ["triceps", "shoulders"],
  "equipment": "barbell",
  "movement_pattern": "horizontal_push",
  "movement_plane": "horizontal",
  "force_vector": "push",
  "dominant_joint": "shoulder",
  "fiber_bias": "mixed",
  "grip_type": "pronated",
  "grip_width": "shoulder_width",
  "stability_requirement": "stable",
  "unilateral": false,
  "push_pull": "push",
  "split_tags": ["push"],
  "injury_risk": "low",
  "angle": "flat",
  "rom_type": "full"
}
```

**Note:** The UI includes fallback default options for filters even without database data.

## Troubleshooting

- **Backend not connected**: Ensure the backend server is running on port 5000
- **Authentication issues**: Check your login credentials
- **Empty results**: Make sure you have exercise data in the database
- **UI not loading**: Try clearing browser cache or restarting Streamlit

## Development

To modify the UI:
- Edit `app.py` for interface changes
- Update `requirements.txt` for new dependencies
- The UI automatically refreshes on code changes

Enjoy your personalized fitness journey! 💪