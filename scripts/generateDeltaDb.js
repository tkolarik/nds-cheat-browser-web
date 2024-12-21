// scripts/generateDeltaDb.js

const Database = require('better-sqlite3');
const dayjs = require('dayjs');

/**
 * Creates a Delta-compatible SQLite database buffer.
 * @param {string} gameID - The GameID (e.g., "IPKE 1234ABCD").
 * @param {string} gameName - The name of the game.
 * @param {Array} selectedCheats - Array of selected cheats { name: '', codes: '' }.
 * @returns {Buffer} - The SQLite database as a buffer.
 */
const createDeltaDatabase = async (gameID, gameName, selectedCheats) => {
  try {
    const db = new Database(':memory:');

    // Create tables
    db.exec(`
      CREATE TABLE ZGAME (
        Z_PK INTEGER PRIMARY KEY,
        Z_ENT INTEGER,
        Z_OPT INTEGER,
        ZIDENTIFIER VARCHAR,
        ZNAME VARCHAR
      );

      CREATE TABLE ZCHEAT (
        Z_PK INTEGER PRIMARY KEY,
        Z_ENT INTEGER,
        Z_OPT INTEGER,
        ZISENABLED INTEGER,
        ZGAME INTEGER,
        ZCREATIONDATE TIMESTAMP,
        ZMODIFIEDDATE TIMESTAMP,
        ZCODE VARCHAR,
        ZIDENTIFIER VARCHAR,
        ZNAME VARCHAR,
        ZTYPE BLOB
      );
    `);

    // Insert into ZGAME
    const insertGame = db.prepare(`
      INSERT INTO ZGAME (Z_PK, Z_ENT, Z_OPT, ZIDENTIFIER, ZNAME)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertGame.run(1, 16, 1, gameID, gameName);

    // Insert into ZCHEAT
    const insertCheat = db.prepare(`
      INSERT INTO ZCHEAT (
        Z_PK, Z_ENT, Z_OPT, ZISENABLED, ZGAME, 
        ZCREATIONDATE, ZMODIFIEDDATE, ZCODE, ZIDENTIFIER, ZNAME, ZTYPE
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

    let pkCounter = 1;
    selectedCheats.forEach(cheat => {
      pkCounter += 1;
      insertCheat.run(
        pkCounter,
        16, // Z_ENT
        1,  // Z_OPT
        1,  // ZISENABLED (1 = enabled)
        1,  // ZGAME (refers to Z_PK in ZGAME)
        now,
        now,
        cheat.codes,
        `${gameID}_${pkCounter}`,
        cheat.name,
        null // ZTYPE (can be null or a blob if needed)
      );
    });

    // Serialize the in-memory DB to a file
    const tempDbPath = '/tmp/delta_cheats_temp.sqlite';
    const fileDb = new Database(tempDbPath);
    fileDb.exec('ATTACH DATABASE ":memory:" AS memdb;');
    fileDb.exec('BEGIN;');
    fileDb.exec(`
      CREATE TABLE ZGAME AS SELECT * FROM main.ZGAME;
      CREATE TABLE ZCHEAT AS SELECT * FROM main.ZCHEAT;
    `);
    fileDb.exec('COMMIT;');
    fileDb.close();
    db.close();

    // Read the temp DB file into a buffer
    const dbBuffer = fs.readFileSync(tempDbPath);

    // Delete the temp DB file
    fs.unlinkSync(tempDbPath);

    return dbBuffer;
  } catch (error) {
    console.error('createDeltaDatabase Error:', error);
    throw error;
  }
};

module.exports = { createDeltaDatabase };
