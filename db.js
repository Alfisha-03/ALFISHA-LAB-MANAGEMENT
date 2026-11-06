
const mysql = require('mysql2');
require('dotenv').config();

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: process.env.DB_PASSWORD,
    database: 'college_lab_management'
});

db.connect((err) => {
    if (err) {
        console.log('Database connection failed!');
        console.log(err.message);
        return;
    }

    console.log('MySQL connected successfully!');
});

module.exports = db;
