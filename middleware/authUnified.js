const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_here';

/**
 * Unified authentication middleware.
 * Automatically extracts the user from the Authorization header (Bearer token) if present.
 * If requireAuth is true (default is false), it will return a 401 response if no valid token is found.
 * If requireAuth is false, it allows the request to pass through but populates req.userId if a token is valid,
 * otherwise allowing fallback to req.body.userId or req.params.userId.
 */
module.exports = function (requireAuth = false) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (requireAuth) {
        return res.status(401).json({ error: 'Unauthorized. Bearer token required.' });
      }
      return next();
    }

    const token = authHeader.split(' ')[1];

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = { id: payload.id, email: payload.email };
      req.userId = payload.id; // Convenient short-hand
      next();
    } catch (err) {
      if (requireAuth) {
        return res.status(401).json({ error: 'Invalid or expired token.' });
      }
      // Log error but proceed to let parameter extraction do its fallback
      console.warn('[Auth Middleware] Invalid token presented, relying on fallback parameters:', err.message);
      next();
    }
  };
};
