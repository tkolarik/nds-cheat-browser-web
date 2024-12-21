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
app.post('/upload-rom', upload.single('rom'), async (req, res) => {
    try {
      const uploadedFile = req.file;
      if (!uploadedFile) {
        return res.status(400).json({ error: 'No ROM file uploaded.', gameid: null });
      }
  
      if (!uploadedFile.originalname.toLowerCase().endsWith('.nds')) {
        return res.status(400).json({ error: 'Invalid file format. Please upload a .nds file.', gameid: null });
      }
  
      // Generate GameID
      const gameID = await generateGameID(uploadedFile.path);
      if (!gameID) {
        return res.status(500).json({ error: 'Failed to generate GameID. Ensure ndstool is installed and the ROM is valid.', gameid: null });
      }
  
      // Lookup cheats
      const cheatsData = getCheatsForGameID(gameID);
      if (!cheatsData) {
        // No cheats found, but send back the GameID for debugging
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