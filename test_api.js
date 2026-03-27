const http = require('http');

const postData = JSON.stringify({
  userId: "6988654dab52477db7fd45cb",
  goal: "hypertrophy",
  experience: "beginner",
  days: 5
});

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/exercises/routine/generate',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      console.log('\n=== FULL API RESPONSE ===');
      console.log(JSON.stringify(result, null, 2).substring(0, 3000)); // First 3000 chars
      
      console.log('\n=== ROUTINE CHECK ===');
      if (result.routine && result.routine.length > 0) {
        console.log('✓ Routine array exists with', result.routine.length, 'days');
        result.routine.forEach((day, i) => {
          console.log(`\nDay ${i + 1}: ${day.day}`);
          console.log('  Exercises field type:', typeof day.exercises);
          console.log('  Exercises is array?', Array.isArray(day.exercises));
          console.log('  Exercises length:', day.exercises ? day.exercises.length : 'undefined');
          if (day.exercises && day.exercises.length > 0) {
            console.log('  First exercise:', day.exercises[0].name);
          } else {
            console.log('  ⚠ NO EXERCISES in this day');
          }
        });
      } else {
        console.log('✗ No routine array in response');
      }
    } catch (e) {
      console.error('Error parsing response:', e);
      console.log('Raw response (first 1000 chars):', data.substring(0, 1000));
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e.message);
});

req.write(postData);
req.end();
