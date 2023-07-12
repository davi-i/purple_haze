import { Request, Response } from "express";
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { db } from "./database";
import { User, WithId, WithPassword } from "./types";


export const registerUser = async (req: Request, res: Response) => {
  const { email, username, password } = req.body;

  // TODO: validate email format and uniqueness
  // TODO: validate username format(?) and uniquess

  if (!email || !username || !password) {
    res.status(500).json({ message: 'email, username and password are required' });
    return;
  }

  try {
    // Encrypt password
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(password, salt);

    await db.none('INSERT INTO users(email, username, password) VALUES($1, $2, $3)', [email, username, hashedPassword]);
    res.status(201).json({ message: "user registered" });
  } catch (error) {
    console.error('Error occurred while registering user:', error);
    res.status(500).json({ message: 'internal error' });
  }
}

export const login = async (req: Request, res: Response) => {
  const { username, password } = req.body;

  try {
    const user: WithId<WithPassword<User>> | null = await db.oneOrNone('SELECT * FROM users WHERE username = $1', [username]);
    const isMatch = user && await bcrypt.compare(password, user.password);
    if (isMatch) {
      const token = jwt.sign(
        { id: user.id, email: user.email, username },
        process.env.JWT_SECRET_KEY || '',
        { expiresIn: '2h' },
      );
      res.json({ message: "logged in successfully", token });
    } else {
      res.status(401).json({ message: 'username or password are wrong' });
    }
  } catch (error) {
    console.error('Error occurred while logging in:', error);
    res.status(500).json({ message: 'internal error' });
  }
};
