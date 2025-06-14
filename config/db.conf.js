import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create a connection
const connection = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10, // Adjust this as needed
    queueLimit: 0, // 0 means no limit
});

// Test the connection 
(async () => {
    try {
        const [rows] = await connection.query('SELECT 1'); // Simple test query
        console.log('Database connected successfully!');
    } catch (err) {
        console.error('Database connection failed:', err.message);
    }
})();

export default connection;