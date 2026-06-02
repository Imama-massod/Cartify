const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Cartify E-commerce API',
            version: '1.0.0',
            description: 'Interactive API Documentation for Cartify Backend',
            contact: {
                name: 'Cartify Support'
            }
        },
        servers: [
            {
                url: 'http://localhost:5000',
                description: 'Local development server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
        security: [
            {
                bearerAuth: [],
            },
        ],
    },
    // This tells Swagger where to look for your API documentation comments (YAML files)
    apis: ['./docs/*.yaml', './routes/*.js'], 
};

const specs = swaggerJsDoc(options);

module.exports = {
    serve: swaggerUi.serve,
    setup: swaggerUi.setup(specs)
};
