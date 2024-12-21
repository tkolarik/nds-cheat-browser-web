// server.js

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { generateGameID } = require('./scripts/gameIdTools');
const { getCheatsForGameID, searchCheats } = require('./scripts/cheatLookup');
const { createDeltaDatabase } = require('./scripts/generateDeltaDb');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Ensure upload directories exist
const uploadDirs = ['uploads', 'data'];
uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
  }
});

// Endpoint to upload NDS ROM
app.post('/upload-rom', upload.single('rom'), async (req, res) => {
  try {
    const uploadedFile = req.file;
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No ROM file uploaded.' });
    }

    if (!uploadedFile.originalname.toLowerCase().endsWith('.nds')) {
      return res.status(400).json({ error: 'Invalid file format. Please upload a .nds file.' });
    }

    // Generate GameID
    const gameID = await generateGameID(uploadedFile.path);
    if (!gameID) {
      return res.status(500).json({ error: 'Failed to generate GameID. Ensure ndstool is installed and the ROM is valid.' });
    }

    // Lookup cheats
    const cheatsData = getCheatsForGameID(gameID);
    if (!cheatsData) {
      return res.status(404).json({ error: 'No cheats found for this GameID.', gameid: gameID });
    }

    // Respond with cheat data
    res.json({
      gameid: gameID,
      game_name: cheatsData.name,
      folders: cheatsData.folders,
    });

  } catch (error) {
    console.error('Error in /upload-rom:', error);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    // Clean up uploaded ROM file
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting uploaded ROM:', err);
      });
    }
  }
});

// Endpoint to upload Delta SQLite
app.post('/upload-delta', upload.single('delta'), async (req, res) => {
  try {
    const uploadedFile = req.file;
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No Delta SQLite file uploaded.' });
    }

    if (!uploadedFile.originalname.toLowerCase().endsWith('.sqlite')) {
      return res.status(400).json({ error: 'Invalid file format. Please upload a .sqlite file.' });
    }

    // Save the uploaded Delta SQLite to the data directory
    const deltaPath = path.join(__dirname, 'data', 'delta.sqlite');
    fs.renameSync(uploadedFile.path, deltaPath);

    res.json({ message: 'Delta SQLite file uploaded successfully.' });

  } catch (error) {
    console.error('Error in /upload-delta:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Endpoint to search games
app.get('/search-games', (req, res) => {
  const query = req.query.q || '';
  const results = getCheatsForGameID(query);
  res.json(results);
});

// Endpoint to generate Delta SQLite
app.post('/generate-delta', async (req, res) => {
  try {
    const { gameid, game_name, selectedCheats } = req.body;
    if (!gameid || !selectedCheats || !Array.isArray(selectedCheats)) {
      return res.status(400).json({ error: 'Missing gameid or selectedCheats.' });
    }

    // Create Delta SQLite database
    const dbBuffer = await createDeltaDatabase(gameid, game_name, selectedCheats);

    // Set headers to prompt download
    res.setHeader('Content-Disposition', 'attachment; filename="delta_cheats.sqlite"');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(dbBuffer);

  } catch (error) {
    console.error('Error in /generate-delta:', error);
    res.status(500).json({ error: 'Failed to generate Delta SQLite.' });
  }
});

// Start the server
const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
  console.log('Access the app from your phone using your Mac\'s local IP and port 5050.');
});
