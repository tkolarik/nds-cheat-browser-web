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
    cheat_name TEXT NOT NULL
  );
`);

// In-memory storage for user-uploaded Delta Emulator data
let userDeltaData = {}; // Structure: { shasum: { cheatName: { codes: '', is_enabled: true, is_bookmarked: true } } }

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
    let userCheats = null;
    if (userDeltaData[shasum]) {
      userCheats = userDeltaData[shasum]; // { cheatName: { codes, is_enabled, is_bookmarked } }
    }

    // Prepare response data
    const responseData = {
      gameid: gameID,
      game_name: cheatsData.name,
      folders: cheatsData.folders.map(folder => ({
        ...folder,
        cheats: folder.cheats.map(cheat => {
          // If user has this cheat enabled/bookmarked, mark it
          if (userCheats && userCheats[cheat.name]) {
            return {
              ...cheat,
              is_enabled: userCheats[cheat.name].is_enabled,
              is_bookmarked: userCheats[cheat.name].is_bookmarked
            };
          }
          return {
            ...cheat,
            is_enabled: false,
            is_bookmarked: false
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
 * Description: Uploads an existing Delta Emulator SQLite file and parses cheats.
 */
app.post('/upload-delta', upload.single('delta'), async (req, res) => {
  try {
    const uploadedFile = req.file;
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No Delta Emulator SQLite file uploaded.' });
    }

    if (!uploadedFile.originalname.toLowerCase().endsWith('.sqlite')) {
      return res.status(400).json({ error: 'Invalid file format. Please upload a .sqlite file.' });
    }

    const shasum = req.session.currentGameShasum;
    if (!shasum) {
      return res.status(400).json({ error: 'Please upload a ROM file first to set the current game.' });
    }

    // Parse the uploaded SQLite file
    const dbPath = uploadedFile.path;
    const db = new Database(dbPath, { readonly: true });

    // Extract cheats from ZCHEAT and link to ZGAME
    const cheatsStmt = db.prepare(`
      SELECT ZCHEAT.ZNAME as cheatName, ZCHEAT.ZCODE as cheatCodes, ZCHEAT.ZISENABLED as isEnabled, ZGAME.ZIDENTIFIER as identifier
      FROM ZCHEAT
      JOIN ZGAME ON ZCHEAT.ZGAME = ZGAME.Z_PK
      WHERE ZCHEAT.ZGAME IS NOT NULL
    `);
    const rows = cheatsStmt.all();

    // Log all identifiers present in the uploaded delta.sqlite
    const presentIdentifiers = [...new Set(rows.map(row => row.identifier))];
    console.log('Identifiers present in uploaded delta.sqlite:', presentIdentifiers);

    // Log the shasum used for searching
    console.log('Current Game Shasum:', shasum);

    // **Verify that the identifier matches currentGameShasum**
    const allMatch = rows.every(row => row.identifier === shasum);
    if (!allMatch) {
      db.close();
      fs.unlink(dbPath, () => {}); // Delete the uploaded delta.sqlite
      console.error('Delta SQLite does not match the uploaded ROM\'s shasum.');
      return res.status(400).json({ error: 'Delta SQLite does not match the uploaded ROM\'s shasum.' });
    }

    // Organize cheats by shasum
    rows.forEach(row => {
      const { identifier, cheatName, cheatCodes, isEnabled } = row;
      if (!userDeltaData[identifier]) {
        userDeltaData[identifier] = {};
      }
      userDeltaData[identifier][cheatName] = {
        codes: cheatCodes,
        is_enabled: Boolean(isEnabled),
        is_bookmarked: true // Assuming that uploaded cheats are bookmarked by default
      };
    });

    // Move the delta.sqlite to deltasDir with filename as shasum
    const deltaDestinationPath = path.join(deltasDir, `${shasum}.sqlite`);
    fs.renameSync(dbPath, deltaDestinationPath);

    // Clean up uploaded SQLite file
    db.close();

    res.json({ message: 'Delta Emulator SQLite file uploaded and parsed successfully.' });

  } catch (error) {
    console.error('Error in /upload-delta:', error);
    res.status(500).json({ error: 'Failed to parse Delta Emulator SQLite file.' });
  }
});

/**
 * Endpoint: POST /generate-delta
 * Description: Generates a modified Delta-compatible SQLite database based on selected cheats.
 */
app.post('/generate-delta', async (req, res) => {
  try {
    const { gameid, game_name, selectedCheats } = req.body;

    if (!gameid || !game_name || !Array.isArray(selectedCheats) || selectedCheats.length === 0) {
      return res.status(400).json({ error: 'Invalid request data. Ensure gameid, game_name, and selectedCheats are provided.' });
    }

    const shasum = req.session.currentGameShasum;
    if (!shasum) {
      return res.status(400).json({ error: 'No game has been set. Please upload a ROM first.' });
    }

    // Path to the existing delta.sqlite associated with shasum
    const deltaDbPath = path.join(deltasDir, `${shasum}.sqlite`);

    if (!fs.existsSync(deltaDbPath)) {
      return res.status(400).json({ error: 'No Delta Emulator SQLite file uploaded for the current game.' });
    }

    // Modify the existing delta.sqlite with selected cheats
    const dbBuffer = await modifyDeltaDatabase(deltaDbPath, shasum, selectedCheats); // Pass shasum as identifier

    // Overwrite the existing delta.sqlite with modifications
    fs.writeFileSync(deltaDbPath, dbBuffer);

    // Log the shasum used for generation
    console.log('Generating modified delta.sqlite for shasum:', shasum);

    // Send the modified delta.sqlite back to the user
    res.setHeader('Content-Disposition', 'attachment; filename=delta_cheats_modified.sqlite');
    res.setHeader('Content-Type', 'application/vnd.sqlite3');
    res.send(dbBuffer);

  } catch (error) {
    console.error('Error in /generate-delta:', error);
    res.status(500).json({ error: 'Failed to generate modified Delta SQLite database.' });
  }
});

/**
 * Endpoint: GET /api/games
 * Description: Retrieves all games and their cheats with enabled status.
 */
app.get('/api/games', (req, res) => {
  try {
    const allGames = [];

    // Iterate through userDeltaData to get games and cheats
    for (const [shasum, cheats] of Object.entries(userDeltaData)) {
      // Retrieve game name from cheatsData using GameID
      const gameInfo = getCheatsForGameID(req.session.currentGameID); // Assuming single game per session
      if (gameInfo) {
        const gameName = gameInfo.name;
        const folders = gameInfo.folders.map(folder => ({
          folder_name: folder.folder_name,
          cheats: folder.cheats.map(cheat => ({
            name: cheat.name,
            codes: cheat.codes,
            is_enabled: cheats[cheat.name]?.is_enabled || false,
            is_bookmarked: cheats[cheat.name]?.is_bookmarked || false
          }))
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
    const insertStmt = dbBookmarks.prepare('INSERT INTO bookmarks (gameid, cheat_name) VALUES (?, ?)');
    const insertMany = dbBookmarks.transaction((cheats) => {
      cheats.forEach(cheat => {
        insertStmt.run(gameid, cheat);
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

    const stmt = dbBookmarks.prepare('SELECT cheat_name FROM bookmarks WHERE gameid = ?');
    const rows = stmt.all(gameid);
    const bookmarks = rows.map(row => row.cheat_name);

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
    const bookmarks = dbBookmarks.prepare('SELECT cheat_name FROM bookmarks WHERE gameid = ?').all(gameid);
    res.json({ bookmarks: bookmarks.map(b => b.cheat_name) });
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
      const insert = dbBookmarks.prepare('INSERT INTO bookmarks (gameid, cheat_name) VALUES (?, ?)');
      bookmarks.forEach(cheatName => {
        insert.run(gameid, cheatName);
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
    res.json({ bookmarks: allBookmarks });
  } catch (error) {
    console.error('Error fetching all bookmarks:', error);
    res.status(500).json({ error: 'Failed to fetch all bookmarks.' });
  }
});

// Start the server
const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});
