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

        // Get the current timestamp in the correct epoch
        const now = dayjs().valueOf() / 1000 - dayjs('2001-01-01').valueOf() / 1000;

        // Prepare SQL statements
        const updateCheat = db.prepare(`
            UPDATE ZCHEAT
            SET ZISENABLED = ?, ZCODE = ?, ZMODIFIEDDATE = ?
            WHERE Z_PK = ?
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

        // Find the ZGAME.Z_PK value corresponding to the shasum
        const gameStmt = db.prepare(`SELECT Z_PK FROM ZGAME WHERE ZIDENTIFIER = ?`);
        const game = gameStmt.get(shasum);
        if (!game) {
            throw new Error('Game not found in ZGAME table.');
        }
        const zGamePk = game.Z_PK;

        // Start a transaction to ensure atomicity
        const updateTransaction = db.transaction((cheats) => {
            cheats.forEach(cheat => {
                // Check if the cheat exists
                const existingCheat = db.prepare(`SELECT Z_PK FROM ZCHEAT WHERE ZNAME = ? AND ZGAME = ?`).get(cheat.name, zGamePk);
                if (existingCheat) {
                    // Update existing cheat
                    updateCheat.run(
                        cheat.is_enabled ? 1 : 0,
                        formatCheatCodes(cheat.codes),
                        now,
                        existingCheat.Z_PK
                    );
                } else {
                    // Insert new cheat
                    pkCounter += 1;
                    insertCheat.run(
                        pkCounter, // Z_PK
                        1, // Z_ENT - Correctly set to 1
                        2, // Z_OPT - Correctly set to 2
                        cheat.is_enabled ? 1 : 0, // ZISENABLED
                        zGamePk, // ZGAME
                        now, // ZCREATIONDATE
                        now, // ZMODIFIEDDATE
                        formatCheatCodes(cheat.codes),
                        generateUUID(), // ZIDENTIFIER
                        cheat.name,
                        Buffer.from('62706c6973743030d4010203040506070a582476657273696f6e592461726368697665725424746f7058246f626a6563747312000186a05f100f4e534b657965644172636869766572d1080954726f6f748001a20b0c55246e756c6c5c416374696f6e5265706c617908111a24293237494c5153565c0000000000000101000000000000000d00000000000000000000000000000069', 'hex') // ZTYPE
                    );
                }
            });
        });

        // Execute the transaction
        updateTransaction(selectedCheats);

        // Close the database connection
        db.close();

        return fs.readFileSync(deltaDbPath); // Return the modified database as a buffer

    } catch (error) {
        console.error('Error modifying Delta database:', error);
        throw error;
    }
};

// Helper function to format cheat codes
const formatCheatCodes = (codes) => {
    // Ensure the cheat codes string is not null or undefined
    if (codes === null || codes === undefined) {
        return ''; // Return an empty string or handle it as appropriate for your application
    }

    // Remove all whitespace and line breaks
    let formattedCodes = codes.replace(/\s+/g, '');

    // Ensure the string has an even number of characters by padding with '0' if necessary
    if (formattedCodes.length % 2 !== 0) {
        formattedCodes += '0';
    }

    // Insert a space every 8 characters and a line break every 16 characters
    let result = '';
    for (let i = 0; i < formattedCodes.length; i += 8) {
        if (i > 0) {
            if (i % 16 === 0) {
                result += '\n'; // Line break every 16 characters
            } else {
                result += ' '; // Space every 8 characters
            }
        }
        result += formattedCodes.substring(i, i + 8);
    }

    return result;
};

// Helper function to generate a UUID
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0,
            v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16).toUpperCase();
    });
}

module.exports = { modifyDeltaDatabase };
