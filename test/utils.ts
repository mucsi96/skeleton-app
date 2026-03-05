import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: 5460,
  database: 'test',
  user: 'postgres',
  password: 'postgres',
});

export async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

export async function cleanupDb() {
  await query('DELETE FROM greetings');
}

export async function populateDb() {
  await query(`
    INSERT INTO greetings (name, message)
    VALUES ('World', 'Welcome to the skeleton app!')
    ON CONFLICT DO NOTHING
  `);
}

export async function cleanupDbRecords() {
  await query('DELETE FROM greetings');
}

export async function insertGreeting(name: string, message: string) {
  await query('INSERT INTO greetings (name, message) VALUES ($1, $2)', [name, message]);
}

export async function getGreetings() {
  const result = await query('SELECT * FROM greetings ORDER BY id');
  return result.rows;
}
