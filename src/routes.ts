import { Express } from 'express';
import { login, registerUser } from './controllers';

export const createRoutes = (app: Express) => {
  app.post('/register', registerUser);
  app.post('/login', login);
}
