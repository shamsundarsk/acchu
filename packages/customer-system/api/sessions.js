// Serverless function for session creation
const crypto = require('crypto');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
    return;
  }

  try {
    // Generate unique session ID
    const sessionId = `session_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    
    // Generate security token for WebSocket authentication
    const token = crypto.randomBytes(32).toString('hex');
    
    console.log(`Creating new session: ${sessionId}`);
    
    const response = {
      success: true,
      data: {
        sessionId,
        token, // Return token for WebSocket authentication
      },
      message: 'Session created successfully',
    };

    res.status(201).json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create session',
    });
  }
};
