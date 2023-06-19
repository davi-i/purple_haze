import { Request, Response } from "express";
import pgPromise from "pg-promise";
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const pgp = pgPromise();
const db = pgp(process.env.DATABASE_URL || '');

export const registerUser = async (req: Request, res: Response) => {
  const { username, password } = req.body;
  // You should validate and sanitize the input data here

  // Save the user to the database
  try {
    await db.none('INSERT INTO users(username, password) VALUES($1, $2)', [username, password]);
    res.status(201).json({ message: "user registered" });
  } catch (error) {
    console.error('Error occurred while registering user:', error);
    res.sendStatus(500);
  }
}

export const login = async (req: Request, res: Response) => {
  const { username, password } = req.body;
  // You should validate and sanitize the input data here

  // Check if the user exists in the database
  try {
    const user = await db.oneOrNone('SELECT * FROM users WHERE username = $1', [username]);
    if (user && user.password === password) {
      // Generate JWT token
      const token = jwt.sign({ username }, process.env.JWT_SECRET_KEY || '');
      res.json({ message: "logged in successfully", token });
    } else {
      res.sendStatus(401); // Unauthorized
    }
  } catch (error) {
    console.error('Error occurred while logging in:', error);
    res.sendStatus(500);
  }
};
