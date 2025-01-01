// server.js

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const { generateGameID, computeShasum } = require('./scripts/gameIdTools');
const { getCheatsForGameID } = require('./scripts/cheatLookup');
const { modifyDeltaDatabase } = require('./scripts/generateDeltaDb');
const Database = require('better-sqlite3');
const rateLimit = require('express-rate-limit');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Session Configuration
app.use(session({
  secret: 'your-secret-key', // Replace with a strong secret in production
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Rate Limiting
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many upload requests from this IP, please try again later.'
});

app.use('/upload-rom', uploadLimiter);
app.use('/upload-delta', uploadLimiter);

// Ensure upload and data directories exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const deltasDir = path.join(uploadDir, 'deltas');
if (!fs.existsSync(deltasDir)) {
  fs.mkdirSync(deltasDir);
}

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

// Initialize Bookmarks Database
const dbBookmarksPath = path.join(dataDir, 'bookmarks.sqlite');
const dbBookmarks = new Database(dbBookmarksPath);

// Create bookmarks table if it doesn't exist
dbBookmarks.exec(`
  CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gameid TEXT NOT NULL,
    cheat_name TEXT NOT NULL,
    cheat_code TEXT NOT NULL
  );
`);

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

// In-memory storage for user-uploaded Delta Emulator data
let userDeltaData = {}; // Structure: { shasum: { cheatCode: { name: '', is_enabled: true } } }

/**
 * Endpoint: POST /upload-rom
 * Description: Uploads a .nds ROM file, generates its GameID, computes shasum, and retrieves corresponding cheats.
 */
app.post('/upload-rom', upload.single('rom'), async (req, res) => {
  try {
    const uploadedFile = req.file;
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No ROM file uploaded.', gameid: null });
    }

    if (!uploadedFile.originalname.toLowerCase().endsWith('.nds')) {
      return res.status(400).json({ error: 'Invalid file format. Please upload a .nds file.', gameid: null });
    }

    // Compute shasum (SHA1)
    const shasum = await computeShasum(uploadedFile.path);
    req.session.currentGameShasum = shasum;

    // Generate GameID
    const gameID = await generateGameID(uploadedFile.path);
    if (!gameID) {
      return res.status(500).json({ error: 'Failed to generate GameID. Ensure ndstool is installed and the ROM is valid.', gameid: null });
    }

    // Set currentGameID
    req.session.currentGameID = gameID;

    // Lookup cheats from cheats.xml
    const cheatsData = getCheatsForGameID(gameID);
    if (!cheatsData) {
      // No cheats found, but send back the GameID for debugging
      return res.status(404).json({ error: 'No cheats found for this GameID.', gameid: gameID });
    }

    // Check if user has uploaded a Delta SQLite and has cheats for this shasum
    let userCheats = {};
    if (userDeltaData[shasum]) {
      userCheats = userDeltaData[shasum]; // { cheatCode: { name, is_enabled } }
    }

    // Prepare response data
    const responseData = {
      gameid: gameID,
      game_identifier: shasum,
      game_name: cheatsData.name,
      folders: cheatsData.folders.map(folder => ({
        ...folder,
        cheats: folder.cheats.map(cheat => {
          const formattedCheatCode = formatCheatCodes(cheat.codes);
          const isEnabled = userCheats[formattedCheatCode]?.is_enabled || false;
          return {
            ...cheat,
            is_enabled: isEnabled,
            is_bookmarked: isEnabled // Automatically bookmark if enabled
          };
        })
      }))
    };

    // Respond with cheat data
    res.json(responseData);

  } catch (error) {
    console.error('Error in /upload-rom:', error);
    res.status(500).json({ error: 'Server error.', gameid: null });
  } finally {
    // Clean up uploaded ROM file
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting uploaded ROM:', err);
      });
    }
  }
});

/**
 * Endpoint: POST /upload-delta
 * Description: Uploads a Delta Emulator SQLite database file, parses it, and stores cheat data in memory.
 */
app.post('/upload-delta', upload.single('delta'), async (req, res) => {
  try {
    const deltaFile = req.file;
    if (!deltaFile) {
      return res.status(400).json({ error: 'No Delta SQLite file uploaded.' });
    }

    // Compute SHA1 hash of the uploaded file
    const shasum = await computeShasum(deltaFile.path);

    // Open the uploaded Delta database
    const dbDelta = new Database(deltaFile.path, { readonly: true });

    // Get all cheats for the game from the ZCHEAT table
    const cheatsStmt = dbDelta.prepare(`
      SELECT ZCHEAT.ZISENABLED, ZCHEAT.ZCODE, ZCHEAT.ZNAME
      FROM ZCHEAT
      INNER JOIN ZGAME ON ZCHEAT.ZGAME = ZGAME.Z_PK
      WHERE ZGAME.ZIDENTIFIER = ?
    `);
    const cheats = cheatsStmt.all(shasum);

    // Organize cheats by code for efficient lookup
    const userCheats = {};
    cheats.forEach(cheat => {
      const formattedCheatCode = formatCheatCodes(cheat.ZCODE);
      userCheats[formattedCheatCode] = {
        name: cheat.ZNAME,
        is_enabled: cheat.ZISENABLED === 1
      };
    });

    // Store in memory, keyed by shasum
    userDeltaData[shasum] = userCheats;

    // Close the Delta database
    dbDelta.close();

    // Move the uploaded file to the deltas directory
    const newDeltaPath = path.join(deltasDir, `${shasum}.sqlite`);
    fs.renameSync(deltaFile.path, newDeltaPath);

    res.json({ message: 'Delta SQLite file uploaded and parsed successfully.' });

  } catch (error) {
    console.error('Error in /upload-delta:', error);
    res.status(500).json({ error: 'Failed to process Delta SQLite file.' });
  }
});

/**
 * Endpoint: POST /generate-delta
 * Description: Generates a modified Delta-compatible SQLite database with selected cheats.
 */
app.post('/generate-delta', async (req, res) => {
  try {
    const { gameid, game_name, selectedCheats } = req.body;
    if (!gameid || !game_name || !Array.isArray(selectedCheats)) {
      return res.status(400).json({ error: 'Invalid request data.' });
    }

    // Use the shasum stored in the session
    const shasum = req.session.currentGameShasum;
    if (!shasum) {
      return res.status(400).json({ error: 'No game identifier (shasum) found in session.' });
    }

    // Find the path to the uploaded Delta SQLite file
    const deltaDbPath = path.join(deltasDir, `${shasum}.sqlite`);
    if (!fs.existsSync(deltaDbPath)) {
      return res.status(404).json({ error: 'Delta SQLite file not found for this game.' });
    }

    // Modify the Delta database
    const modifiedDbBuffer = await modifyDeltaDatabase(deltaDbPath, shasum, selectedCheats);

    // Send the modified database as a download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="delta_cheats_modified.sqlite"`);
    res.send(modifiedDbBuffer);

  } catch (error) {
    console.error('Error in /generate-delta:', error);
    res.status(500).json({ error: 'Failed to generate Delta SQLite.' });
  }
});

/**
 * Endpoint: GET /api/games
 * Description: Retrieves all games and their cheats, with user-enabled cheats merged in.
 */
app.get('/api/games', (req, res) => {
  try {
    const allGames = [];

    for (const shasum in userDeltaData) {
      const cheats = userDeltaData[shasum];
      const gameName = Object.values(cheats).find(cheat => cheat.name)?.name || 'Unknown Game';

      // Find corresponding cheats from cheats.xml using gameid (shasum)
      const gameCheatsData = getCheatsForGameID(shasum);
      if (gameCheatsData) {
        const folders = gameCheatsData.folders.map(folder => ({
          folder_name: folder.folder_name,
          cheats: folder.cheats.map(cheat => {
            const formattedCheatCode = formatCheatCodes(cheat.codes);
            return {
              name: cheat.name,
              notes: cheat.notes,
              codes: cheat.codes,
              is_enabled: cheats[formattedCheatCode]?.is_enabled || false,
              is_bookmarked: cheats[formattedCheatCode]?.is_enabled || false
            };
          })
        }));

        allGames.push({
          gameid: shasum, // Use shasum as gameid
          game_name: gameName,
          folders: folders
        });
      }
    }

    // Log the retrieved games
    console.log('Retrieved games:', allGames.map(game => ({ gameid: game.gameid, game_name: game.game_name })));

    res.json({ games: allGames });

  } catch (error) {
    console.error('Error in /api/games:', error);
    res.status(500).json({ error: 'Failed to retrieve games.' });
  }
});

/**
 * Endpoint: POST /save-bookmarks
 * Description: Saves user bookmarks.
 */
app.post('/save-bookmarks', (req, res) => {
  try {
    const { gameid, bookmarks } = req.body;
    if (!gameid || !Array.isArray(bookmarks)) {
      return res.status(400).json({ error: 'Invalid request data.' });
    }

    // Delete existing bookmarks for the game
    const deleteStmt = dbBookmarks.prepare('DELETE FROM bookmarks WHERE gameid = ?');
    deleteStmt.run(gameid);

    // Insert new bookmarks
    const insertStmt = dbBookmarks.prepare('INSERT INTO bookmarks (gameid, cheat_name, cheat_code) VALUES (?, ?, ?)');
    const insertMany = dbBookmarks.transaction((cheats) => {
      cheats.forEach(cheat => {
        insertStmt.run(gameid, cheat.name, cheat.code);
      });
    });

    insertMany(bookmarks);

    // Log the saved bookmarks
    console.log(`Bookmarks saved for gameid ${gameid}:`, bookmarks);

    res.json({ message: 'Bookmarks saved successfully.' });
  } catch (error) {
    console.error('Error in /save-bookmarks:', error);
    res.status(500).json({ error: 'Failed to save bookmarks.' });
  }
});

/**
 * Endpoint: GET /get-bookmarks
 * Description: Retrieves user bookmarks for a specific game.
 * Query Params: gameid
 */
app.get('/get-bookmarks', (req, res) => {
  try {
    const { gameid } = req.query;
    if (!gameid) {
      return res.status(400).json({ error: 'GameID is required.' });
    }

    const stmt = dbBookmarks.prepare('SELECT cheat_name, cheat_code FROM bookmarks WHERE gameid = ?');
    const rows = stmt.all(gameid);
    const bookmarks = rows.map(row => ({ name: row.cheat_name, code: row.cheat_code }));

    // Log the retrieved bookmarks
    console.log(`Retrieved bookmarks for gameid ${gameid}:`, bookmarks);

    res.json({ bookmarks });
  } catch (error) {
    console.error('Error in /get-bookmarks:', error);
    res.status(500).json({ error: 'Failed to retrieve bookmarks.' });
  }
});

/**
 * Debug Endpoint: GET /debug-cheats
 * Description: Returns the cheatsData object.
 * NOTE: Remove or secure this endpoint in production.
 */
app.get('/debug-cheats', (req, res) => {
  res.json(getCheatsForGameID); // Adjusted to prevent exposing all cheats
});

// Endpoint to get bookmarks for a specific game
app.get('/get-bookmarks', (req, res) => {
  const { gameid } = req.query;
  if (!gameid) {
    return res.status(400).json({ error: 'Game ID is required.' });
  }

  try {
    const bookmarks = dbBookmarks.prepare('SELECT cheat_name, cheat_code FROM bookmarks WHERE gameid = ?').all(gameid);
    res.json({ bookmarks: bookmarks.map(b => ({ name: b.cheat_name, code: b.cheat_code })) });
  } catch (error) {
    console.error('Error fetching bookmarks:', error);
    res.status(500).json({ error: 'Failed to fetch bookmarks.' });
  }
});

// Endpoint to save bookmarks for a specific game
app.post('/save-bookmarks', (req, res) => {
  const { gameid, bookmarks } = req.body;
  if (!gameid || !Array.isArray(bookmarks)) {
    return res.status(400).json({ error: 'Invalid request data.' });
  }

  try {
    dbBookmarks.transaction(() => {
      // Clear existing bookmarks for the game
      dbBookmarks.prepare('DELETE FROM bookmarks WHERE gameid = ?').run(gameid);

      // Insert new bookmarks
      const insert = dbBookmarks.prepare('INSERT INTO bookmarks (gameid, cheat_name, cheat_code) VALUES (?, ?, ?)');
      bookmarks.forEach(cheat => {
        insert.run(gameid, cheat.name, cheat.code);
      });
    })();

    res.json({ message: 'Bookmarks saved successfully.' });
  } catch (error) {
    console.error('Error saving bookmarks:', error);
    res.status(500).json({ error: 'Failed to save bookmarks.' });
  }
});

// Endpoint to get all bookmarked cheats across all games
app.get('/api/bookmarks', (req, res) => {
  try {
    const allBookmarks = dbBookmarks.prepare('SELECT * FROM bookmarks').all();
    res.json({ bookmarks: allBookmarks.map(b => ({ name: b.cheat_name, gameid: b.gameid, code: b.cheat_code })) });
  } catch (error) {
    console.error('Error fetching all bookmarks:', error);
    res.status(500).json({ error: 'Failed to fetch all bookmarks.' });
  }
});

/**
 * Endpoint: POST /update-cheats
 * Description: Updates cheat data for a specific game.
 */
app.post('/update-cheats', (req, res) => {
  const { gameid, cheats } = req.body;
  if (!gameid || !Array.isArray(cheats)) {
    return res.status(400).json({ error: 'Invalid request data.' });
  }

  try {
    // Update the in-memory cheatsData object
    if (cheatsData[gameid]) {
      cheatsData[gameid].folders = cheats;
      // Optionally, you can also update the cheats.xml file here if needed
    }

    res.json({ message: 'Cheats updated successfully.' });
  } catch (error) {
    console.error('Error updating cheats:', error);
    res.status(500).json({ error: 'Failed to update cheats.' });
  }
});

// Start the server
const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});
