const swaggerAutogen = require('swagger-autogen')();

const doc = {
  info: {
    title: 'Fitness AI Backend API',
    version: '1.1.0',
    description: 'Unified & Optimized API Documentation for the Fitness AI project. Integrated with secure JWT Bearer Authentication and performance-optimized single-day lazy loaded workouts.',
  },
  host: 'localhost:5000',
  schemes: ['http', 'https'],
  securityDefinitions: {
    BearerAuth: {
      type: 'apiKey',
      in: 'header',
      name: 'Authorization',
      description: 'JWT Authorization header using the Bearer scheme. Input: "Bearer <token>"'
    }
  },
  security: [
    {
      BearerAuth: []
    }
  ]
};

const outputFile = './swagger_output.json';
const endpointsFiles = ['./server.js'];

/* NOTE: if you use the express Router, you must pass in the 
   'endpointsFiles' only the root file where the route starts. */
swaggerAutogen(outputFile, endpointsFiles, doc).then(() => {
    console.log("Swagger documentation generated successfully.");
});
