// scripts/generateDeltaDb.js

const Database = require('better-sqlite3');
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');

/**
 * Modifies an existing Delta-compatible SQLite database file with selected cheats.
 * Leaves other tables untouched.
 * 
 * @param {string} deltaDbPath - Path to the existing delta.sqlite file.
 * @param {string} shasum - The shasum (SHA1) associated with the cheats.
 * @param {Array} selectedCheats - Array of selected cheats { name: '', codes: '', is_enabled: boolean }.
 * @returns {Buffer} - The modified SQLite database as a buffer.
 */
const modifyDeltaDatabase = async (deltaDbPath, shasum, selectedCheats) => {
    try {
        // Open the existing delta.sqlite
        const db = new Database(deltaDbPath);

        // Get the current timestamp
        const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

        // Prepare SQL statements
        const updateCheat = db.prepare(`
            UPDATE ZCHEAT
            SET ZISENABLED = ?, ZCODE = ?, ZMODIFIEDDATE = ?
            WHERE ZNAME = ?
        `);

        const insertCheat = db.prepare(`
            INSERT INTO ZCHEAT (
                Z_PK, Z_ENT, Z_OPT, ZISENABLED, ZGAME, 
                ZCREATIONDATE, ZMODIFIEDDATE, ZCODE, ZIDENTIFIER, ZNAME, ZTYPE
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Find the maximum Z_PK to assign new primary keys
        const maxPkStmt = db.prepare(`SELECT MAX(Z_PK) as maxPk FROM ZCHEAT`);
        const { maxPk } = maxPkStmt.get() || { maxPk: 0 };
        let pkCounter = maxPk;

        // Start a transaction to ensure atomicity
        const updateTransaction = db.transaction((cheats) => {
            cheats.forEach(cheat => {
                // Check if the cheat exists
                const existingCheat = db.prepare(`SELECT * FROM ZCHEAT WHERE ZNAME = ?`).get(cheat.name);
                if (existingCheat) {
                    // Update existing cheat
                    updateCheat.run(
                        cheat.is_enabled ? 1 : 0,
                        cheat.codes,
                        now,
                        cheat.name
                    );
                } else {
                    // Insert new cheat
                    pkCounter += 1;
                    insertCheat.run(
                        pkCounter, // Z_PK
                        1, // Z_ENT (assuming 1 is the correct entity number for Cheat)
                        1, // Z_OPT
                        cheat.is_enabled ? 1 : 0, // ZISENABLED
                        1, // ZGAME (assuming single game; adjust if multiple games are supported)
                        now, // ZCREATIONDATE
                        now, // ZMODIFIEDDATE
                        cheat.codes,
                        shasum, // ZIDENTIFIER set to shasum (SHA1)
                        cheat.name,
                        null // ZTYPE
                    );
                }
            });
        });

        // Execute the transaction with selected cheats
        updateTransaction(selectedCheats);

        // Close the database connection
        db.close();

        // Read the modified database into a buffer
        const dbBuffer = fs.readFileSync(deltaDbPath);

        return dbBuffer;

    } catch (error) {
        console.error('modifyDeltaDatabase Error:', error);
        throw error;
    }
};

module.exports = { modifyDeltaDatabase };
