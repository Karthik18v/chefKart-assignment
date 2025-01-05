require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// PostgreSQL Connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT
});

pool.connect()
  .then(() => console.log('Database connected'))
  .catch((err) => console.error('Error connecting to the database', err.stack));

// Initialize Database Schema
const initDB = async () => {
  const createTablesQuery = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(256) NOT NULL,
      mobile_number BIGINT UNIQUE NOT NULL,
      address TEXT,
      post_count INT DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      images JSONB DEFAULT '[]'::JSONB
    );
  `;

  try {
    await pool.query(createTablesQuery);
    console.log('Database initialized successfully.');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
};
initDB();

// Create User API
app.post('/users', async (req, res) => {
  const { name, mobile_number, address } = req.body;

  try {
    const result = await pool.query(
      'INSERT INTO users (name, mobile_number, address) VALUES ($1, $2, $3) RETURNING *',
      [name, mobile_number, address]
    );
    res.status(201).json({ message: 'User created', user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Mobile number already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create Post API
app.post('/posts', async (req, res) => {
  const { title, description, user_id, images } = req.body;

  try {
    const postResult = await pool.query(
      'INSERT INTO posts (title, description, user_id, images) VALUES ($1, $2, $3, $4) RETURNING *',
      [title, description, user_id, JSON.stringify(images)]
    );

    await pool.query(
      'UPDATE users SET post_count = post_count + 1 WHERE id = $1',
      [user_id]
    );

    res.status(201).json({ message: 'Post created', post: postResult.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get All Users
app.get('/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get Posts by User ID
app.get('/users/:id/posts', async (req, res) => {
  const { id } = req.params;
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });

  try {
    const result = await pool.query('SELECT * FROM posts WHERE user_id = $1', [id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Graceful Shutdown
process.on('SIGINT', async () => {
  console.log('Closing database connection...');
  await pool.end();
  process.exit(0);
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
