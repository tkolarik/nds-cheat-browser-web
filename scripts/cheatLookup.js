// scripts/cheatLookup.js

const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

let cheatsData = {};

// Load and parse cheats.xml on startup
const loadCheats = () => {
  try {
    const xmlPath = path.join(__dirname, '..', 'data', 'cheats.xml');
    if (!fs.existsSync(xmlPath)) {
      console.error('cheats.xml not found in data directory.');
      return;
    }

    const xmlData = fs.readFileSync(xmlPath, 'utf8');
    const parser = new XMLParser({ ignoreAttributes: false });
    const jsonObj = parser.parse(xmlData);

    // Assuming the XML structure has a root with multiple <game> elements
    const games = jsonObj.root.game;
    if (!games) {
      console.error('No <game> elements found in cheats.xml.');
      return;
    }

    games.forEach(game => {
      const gameName = game.name || 'Unknown';
      const gameID = game.gameid || 'UNKNOWN';
      const folders = [];

      // Handle direct cheats under <game>
      if (game.cheat) {
        const generalFolder = {
          folder_name: 'General',
          cheats: []
        };

        const cheats = Array.isArray(game.cheat) ? game.cheat : [game.cheat];
        cheats.forEach(cheat => {
          generalFolder.cheats.push({
            name: cheat.name || 'Unnamed Cheat',
            notes: cheat.note || '',
            codes: cheat.codes || ''
          });
        });

        folders.push(generalFolder);
      }

      // Handle cheats within <folder>
      if (game.folder) {
        const gameFolders = Array.isArray(game.folder) ? game.folder : [game.folder];
        gameFolders.forEach(folder => {
          const folderName = folder.name || 'Unnamed Folder';
          const folderCheats = [];

          if (folder.cheat) {
            const cheats = Array.isArray(folder.cheat) ? folder.cheat : [folder.cheat];
            cheats.forEach(cheat => {
              folderCheats.push({
                name: cheat.name || 'Unnamed Cheat',
                notes: cheat.note || '',
                codes: cheat.codes || ''
              });
            });
          }

          folders.push({
            folder_name: folderName,
            cheats: folderCheats
          });
        });
      }

      cheatsData[gameID] = {
        name: gameName,
        folders: folders
      };
    });

    console.log(`Loaded cheats for ${Object.keys(cheatsData).length} games.`);
  } catch (error) {
    console.error('Error loading cheats.xml:', error);
  }
};

// Initialize by loading cheats
loadCheats();

// Function to get cheats for a specific GameID
const getCheatsForGameID = (gameID) => {
  return cheatsData[gameID] || null;
};

// Function to search cheats within a specific game
const searchCheats = (gameID, searchTerm) => {
  const game = cheatsData[gameID];
  if (!game) return null;

  const lowerSearch = searchTerm.toLowerCase();
  const filteredFolders = game.folders.map(folder => {
    const filteredCheats = folder.cheats.filter(cheat => 
      cheat.name.toLowerCase().includes(lowerSearch) ||
      cheat.notes.toLowerCase().includes(lowerSearch) ||
      cheat.codes.toLowerCase().includes(lowerSearch)
    );

    return {
      folder_name: folder.folder_name,
      cheats: filteredCheats
    };
  }).filter(folder => folder.cheats.length > 0);

  return {
    name: game.name,
    folders: filteredFolders
  };
};

module.exports = { getCheatsForGameID, searchCheats };
