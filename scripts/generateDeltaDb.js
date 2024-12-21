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
 * @param {string} gameid - The GameID associated with the cheats.
 * @param {Array} selectedCheats - Array of selected cheats { name: '', codes: '', is_enabled: boolean }.
 * @returns {Buffer} - The modified SQLite database as a buffer.
 */
const modifyDeltaDatabase = async (deltaDbPath, gameid, selectedCheats) => {
    try {
        // Open the existing delta.sqlite
        const db = new Database(deltaDbPath);
    
        // Get the current timestamp
        const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
    
        // Start a transaction
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
    
        // To handle PKs, find the max Z_PK
        const maxPkStmt = db.prepare(`SELECT MAX(Z_PK) as maxPk FROM ZCHEAT`);
        const { maxPk } = maxPkStmt.get() || { maxPk: 0 };
        let pkCounter = maxPk;
    
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
                        16, // Z_ENT
                        1,  // Z_OPT
                        cheat.is_enabled ? 1 : 0,  // ZISENABLED
                        1,  // ZGAME (assuming single game)
                        now, // ZCREATIONDATE
                        now, // ZMODIFIEDDATE
                        cheat.codes,
                        `${gameid}_${pkCounter}`, // ZIDENTIFIER
                        cheat.name,
                        null // ZTYPE
                    );
                }
            });
        });
    
        updateTransaction(selectedCheats);
    
        // Close the database
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
