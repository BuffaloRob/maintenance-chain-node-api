import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import config from './config.js';
import { errorHandler, notFound } from './errors.js';
import routes from './routes.js';

const app = express();
app.disable('x-powered-by');

// config/initializers/cors.rb
app.use(
  cors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    exposedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 7200,
  }),
);
if (config.env !== 'test') app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1', routes);
app.use(notFound);
app.use(errorHandler);

export default app;
