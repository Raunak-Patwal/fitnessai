const User = require('../models/User');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_here';

const register = async (req, res) => {
  try {
    const { name, email, password, goal, experience, equipment, gender, training_days_per_week, age, weight, height, injury_flags, recovery_profile } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email and password are required' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(400).json({ error: 'User already exists' });

    const user = await User.create({
      name,
      email: email.toLowerCase().trim(),
      password,  // pre-save hook in User model handles hashing
      goal,
      experience,
      equipment,
      gender,
      training_days_per_week,
      age,
      weight,
      height,
      injury_flags,
      recovery_profile
    });

    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        goal: user.goal,
        experience: user.experience,
        equipment: user.equipment,
        gender: user.gender,
        training_days_per_week: user.training_days_per_week,
        age: user.age,
        weight: user.weight,
        height: user.height,
        injury_flags: user.injury_flags,
        recovery_profile: user.recovery_profile,
        role: user.role
      },
      token
    });
  } catch (err) {
    console.error('[AuthController Register Error]:', err);
    res.status(500).json({ error: 'Internal Error' });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const match = await user.comparePassword(password);
    if (!match) {
      console.warn(`[Login] Password mismatch for: ${email}`);
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        goal: user.goal,
        experience: user.experience,
        equipment: user.equipment
      },
      token
    });
  } catch (err) {
    console.error('[AuthController Login Error]:', err);
    res.status(500).json({ error: 'Internal Error' });
  }
};

module.exports = { register, login };
