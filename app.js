
const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('./db');

const app = express();
const PORT = 3000;

// =========================
// MIDDLEWARE
// =========================

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// =========================
// HOME PAGE
// =========================

app.get('/', (req, res) => {
    res.send('College Lab Equipment Management System is running!');
});

// =========================
// GET ALL EQUIPMENT / SEARCH
// =========================

app.get('/api/equipment', (req, res) => {
    const search = req.query.search || '';

    const sql = `
        SELECT *
        FROM equipment
        WHERE name LIKE ? OR category LIKE ?
        ORDER BY equipment_id DESC
    `;

    const searchValue = `%${search}%`;

    db.query(sql, [searchValue, searchValue], (err, results) => {
        if (err) {
            console.error('Equipment retrieval error:', err.message);

            return res.status(500).json({
                message: 'Failed to retrieve equipment.',
                error: err.message
            });
        }

        res.json(results);
    });
});

// =========================
// ADD EQUIPMENT
// =========================

app.post('/api/equipment', (req, res) => {
    const { name, category, quantity } = req.body;
    const qty = Number(quantity);

    if (
        typeof name !== 'string' ||
        !name.trim() ||
        typeof category !== 'string' ||
        !category.trim() ||
        quantity === undefined ||
        quantity === '' ||
        !Number.isInteger(qty) ||
        qty <= 0
    ) {
        return res.status(400).json({
            message: 'Enter a valid name, category, and positive quantity.'
        });
    }

    const sql = `
        INSERT INTO equipment
        (name, category, quantity, available_quantity, status)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(
        sql,
        [name.trim(), category.trim(), qty, qty, 'Available'],
        (err, result) => {
            if (err) {
                console.error('Add equipment error:', err.message);

                return res.status(500).json({
                    message: 'Failed to add equipment.',
                    error: err.message
                });
            }

            res.status(201).json({
                message: 'Equipment added successfully!',
                equipment_id: result.insertId
            });
        }
    );
});

// =========================
// GET EQUIPMENT BY ID
// =========================

app.get('/api/equipment/:id', (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            message: 'Invalid equipment ID.'
        });
    }

    db.query(
        'SELECT * FROM equipment WHERE equipment_id = ?',
        [id],
        (err, results) => {
            if (err) {
                console.error('Equipment lookup error:', err.message);

                return res.status(500).json({
                    message: 'Failed to retrieve equipment.',
                    error: err.message
                });
            }

            if (results.length === 0) {
                return res.status(404).json({
                    message: 'Equipment not found.'
                });
            }

            res.json(results[0]);
        }
    );
});

// =========================
// GET USERS / SEARCH USERS
// =========================

app.get('/api/users', (req, res) => {
    const search = req.query.search || '';

    const sql = `
        SELECT user_id, name, email, role
        FROM users
        WHERE name LIKE ? OR email LIKE ?
        ORDER BY user_id DESC
    `;

    const searchValue = `%${search}%`;

    db.query(sql, [searchValue, searchValue], (err, results) => {
        if (err) {
            console.error('Users retrieval error:', err.message);

            return res.status(500).json({
                message: 'Failed to retrieve users.',
                error: err.message
            });
        }

        res.json(results);
    });
});

// =========================
// REGISTER USER
// =========================

app.post('/api/users', async (req, res) => {
    const { name, email, password, role } = req.body;

    if (
        typeof name !== 'string' ||
        !name.trim() ||
        typeof email !== 'string' ||
        !email.trim() ||
        typeof password !== 'string' ||
        password.length < 8 ||
        !['Student', 'Staff', 'Admin'].includes(role)
    ) {
        return res.status(400).json({
            message: 'Enter a valid name, email, password (at least 8 characters), and role.'
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const sql = `
            INSERT INTO users (name, email, password, role)
            VALUES (?, ?, ?, ?)
        `;

        db.query(
            sql,
            [name.trim(), email.trim(), hashedPassword, role],
            (err, result) => {
                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') {
                        return res.status(409).json({
                            message: 'This email is already registered.'
                        });
                    }

                    console.error('Registration error:', err.message);

                    return res.status(500).json({
                        message: 'Failed to register user.',
                        error: err.message
                    });
                }

                res.status(201).json({
                    message: 'User registered successfully!',
                    user_id: result.insertId
                });
            }
        );
    } catch (err) {
        console.error('Password hashing error:', err.message);

        res.status(500).json({
            message: 'Could not securely register the user.'
        });
    }
});

// =========================
// ISSUE EQUIPMENT
// =========================

app.post('/api/issues', (req, res) => {
    const userId = Number(req.body.user_id);
    const equipmentId = Number(req.body.equipment_id);
    const quantity = Number(req.body.quantity);

    if (
        !Number.isInteger(userId) || userId <= 0 ||
        !Number.isInteger(equipmentId) || equipmentId <= 0 ||
        !Number.isInteger(quantity) || quantity <= 0
    ) {
        return res.status(400).json({
            message: 'Enter a valid user, equipment, and quantity.'
        });
    }

    db.beginTransaction(err => {
        if (err) {
            console.error('Issue transaction error:', err.message);

            return res.status(500).json({
                message: 'Could not start the issue transaction.'
            });
        }

        const rollback = (status, message) => {
            db.rollback(() => {
                res.status(status).json({ message });
            });
        };

        // Check user
        db.query(
            'SELECT user_id FROM users WHERE user_id = ?',
            [userId],
            (err, users) => {
                if (err) {
                    console.error(err.message);
                    return rollback(500, 'Failed to check the user.');
                }

                if (users.length === 0) {
                    return rollback(404, 'User not found.');
                }

                // Lock equipment while checking its stock
                db.query(
                    `SELECT available_quantity
                     FROM equipment
                     WHERE equipment_id = ?
                     FOR UPDATE`,
                    [equipmentId],
                    (err, equipment) => {
                        if (err) {
                            console.error(err.message);
                            return rollback(500, 'Failed to check equipment.');
                        }

                        if (equipment.length === 0) {
                            return rollback(404, 'Equipment not found.');
                        }

                        const available = Number(
                            equipment[0].available_quantity
                        );

                        if (available < quantity) {
                            return rollback(
                                400,
                                `Only ${available} unit(s) are available.`
                            );
                        }

                        // Reduce available stock
                        db.query(
                            `UPDATE equipment
                             SET available_quantity = available_quantity - ?,
                                 status = CASE
                                     WHEN available_quantity - ? = 0
                                     THEN 'Out of Stock'
                                     ELSE 'Available'
                                 END
                             WHERE equipment_id = ?`,
                            [quantity, quantity, equipmentId],
                            (err) => {
                                if (err) {
                                    console.error(err.message);
                                    return rollback(
                                        500,
                                        'Failed to update equipment quantity.'
                                    );
                                }

                                // Create issue record
                                db.query(
                                    `INSERT INTO issue_records
                                     (equipment_id, user_id, issue_date,
                                      quantity, returned_quantity, status)
                                     VALUES (?, ?, CURDATE(), ?, 0, 'Issued')`,
                                    [equipmentId, userId, quantity],
                                    (err, result) => {
                                        if (err) {
                                            console.error(err.message);
                                            return rollback(
                                                500,
                                                'Failed to save the issue record.'
                                            );
                                        }

                                        db.commit(commitErr => {
                                            if (commitErr) {
                                                console.error(commitErr.message);

                                                return db.rollback(() => {
                                                    res.status(500).json({
                                                        message: 'Could not complete the issue.'
                                                    });
                                                });
                                            }

                                            res.status(201).json({
                                                message: 'Equipment issued successfully!',
                                                issue_id: result.insertId
                                            });
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    });
});

// =========================
// GET OUTSTANDING ISSUES
// FIXED: FILTER BY REMAINING QUANTITY
// =========================

app.get('/api/issues/open', (req, res) => {
    const sql = `
        SELECT
            ir.issue_id,
            ir.equipment_id,
            ir.user_id,
            e.name AS equipment_name,
            u.name AS user_name,
            ir.issue_date,
            ir.quantity,
            COALESCE(ir.returned_quantity, 0) AS returned_quantity,
            (
                ir.quantity - COALESCE(ir.returned_quantity, 0)
            ) AS remaining_quantity
        FROM issue_records ir
        INNER JOIN equipment e
            ON ir.equipment_id = e.equipment_id
        INNER JOIN users u
            ON ir.user_id = u.user_id
        WHERE ir.quantity > COALESCE(ir.returned_quantity, 0)
        ORDER BY ir.issue_id DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('Could not load outstanding issues:', err.message);

            return res.status(500).json({
                message: 'Failed to load outstanding issues.',
                error: err.message
            });
        }

        res.json(results);
    });
});

// =========================
// RETURN EQUIPMENT
// =========================

app.post('/api/issues/:id/return', (req, res) => {
    const issueId = Number(req.params.id);
    const quantity = Number(req.body.quantity);

    if (
        !Number.isInteger(issueId) || issueId <= 0 ||
        !Number.isInteger(quantity) || quantity <= 0
    ) {
        return res.status(400).json({
            message: 'Enter a valid issue ID and return quantity.'
        });
    }

    db.beginTransaction(err => {
        if (err) {
            console.error('Return transaction error:', err.message);

            return res.status(500).json({
                message: 'Could not start the return transaction.'
            });
        }

        const rollback = (status, message) => {
            db.rollback(() => {
                res.status(status).json({ message });
            });
        };

        const sql = `
            SELECT
                issue_id,
                equipment_id,
                quantity,
                COALESCE(returned_quantity, 0) AS returned_quantity
            FROM issue_records
            WHERE issue_id = ?
            FOR UPDATE
        `;

        db.query(sql, [issueId], (err, records) => {
            if (err) {
                console.error(err.message);
                return rollback(500, 'Failed to find the issue record.');
            }

            if (records.length === 0) {
                return rollback(404, 'Issue record not found.');
            }

            const record = records[0];

            const remaining =
                Number(record.quantity) -
                Number(record.returned_quantity);

            if (remaining <= 0) {
                return rollback(
                    400,
                    'This equipment has already been returned.'
                );
            }

            if (quantity > remaining) {
                return rollback(
                    400,
                    `Only ${remaining} unit(s) remain to be returned.`
                );
            }

            // Update the returned quantity and status
            db.query(
                `UPDATE issue_records
                 SET returned_quantity = returned_quantity + ?,
                     status = CASE
                         WHEN returned_quantity + ? >= quantity
                         THEN 'Returned'
                         ELSE 'Issued'
                     END,
                     return_date = CASE
                         WHEN returned_quantity + ? >= quantity
                         THEN CURDATE()
                         ELSE NULL
                     END
                 WHERE issue_id = ?`,
                [quantity, quantity, quantity, issueId],
                err => {
                    if (err) {
                        console.error(err.message);
                        return rollback(
                            500,
                            'Failed to update the issue record.'
                        );
                    }

                    // Restore available stock
                    db.query(
                        `UPDATE equipment
                         SET available_quantity = available_quantity + ?,
                             status = CASE
                                 WHEN available_quantity + ? >= quantity
                                 THEN 'Available'
                                 ELSE 'Out of Stock'
                             END
                         WHERE equipment_id = ?`,
                        [
                            quantity,
                            quantity,
                            record.equipment_id
                        ],
                        err => {
                            if (err) {
                                console.error(err.message);
                                return rollback(
                                    500,
                                    'Failed to update equipment stock.'
                                );
                            }

                            db.commit(commitErr => {
                                if (commitErr) {
                                    console.error(commitErr.message);

                                    return db.rollback(() => {
                                        res.status(500).json({
                                            message: 'Could not complete the return.'
                                        });
                                    });
                                }

                                res.json({
                                    message: 'Equipment returned successfully!'
                                });
                            });
                        }
                    );
                }
            );
        });
    });
});

// =========================
// GET ALL ISSUE RECORDS
// =========================

app.get('/api/issues', (req, res) => {
    const sql = `
        SELECT
            ir.issue_id,
            ir.equipment_id,
            ir.user_id,
            e.name AS equipment_name,
            u.name AS user_name,
            ir.issue_date,
            ir.return_date,
            ir.quantity,
            COALESCE(ir.returned_quantity, 0) AS returned_quantity,
            (
                ir.quantity - COALESCE(ir.returned_quantity, 0)
            ) AS remaining_quantity,
            ir.status
        FROM issue_records ir
        INNER JOIN equipment e
            ON ir.equipment_id = e.equipment_id
        INNER JOIN users u
            ON ir.user_id = u.user_id
        ORDER BY ir.issue_id DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('Issue records error:', err.message);

            return res.status(500).json({
                message: 'Failed to load issue records.',
                error: err.message
            });
        }

        res.json(results);
    });
});

// =========================
// START SERVER
// =========================

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
