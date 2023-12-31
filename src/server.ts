import express from 'express';
import { createRoutes } from './routes';
import { startSocketIo } from './socketIo';

const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(express.json());

createRoutes(app);

export const server = app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

startSocketIo();
