import pgPromise from "pg-promise";
import dotenv from 'dotenv';

dotenv.config();

const pgp = pgPromise();
export const db = pgp(process.env.DATABASE_URL || '');
