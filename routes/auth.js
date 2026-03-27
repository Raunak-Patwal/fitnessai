const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_here';
const SALT_ROUNDS = 10;

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, goal, experience, equipment } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email and password are required' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(400).json({ error: 'User already exists' });

    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await User.create({
      name,
      email: email.toLowerCase().trim(),
      password: hash,
      goal,
      experience,
      equipment
    });

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
    console.error(err);
    res.status(500).json({ error: 'Internal Error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Invalid credentials' });

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
    console.error(err);
    res.status(500).json({ error: 'Internal Error' });
  }
});

module.exports = router;
