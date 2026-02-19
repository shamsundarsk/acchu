import React from 'react';

function TestApp() {
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>🚀 ACCHU Mobile Version - Test</h1>
      <p>If you can see this, the React app is working!</p>
      <div style={{ background: '#f0f0f0', padding: '10px', borderRadius: '5px', marginTop: '20px' }}>
        <h3>Status:</h3>
        <ul>
          <li>✅ Vite dev server running</li>
          <li>✅ React components loading</li>
          <li>✅ TypeScript compilation working</li>
        </ul>
      </div>
    </div>
  );
}

export default TestApp;