// scripts/cheatLookup.js

const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

let cheatsData = {};

/**
 * Loads and parses the cheats.xml file.
 */
const loadCheats = () => {
  try {
    const xmlPath = path.join(__dirname, '..', 'data', 'cheats.xml');
    if (!fs.existsSync(xmlPath)) {
      console.error('cheats.xml not found in data directory.');
      return;
    }

    const xmlData = fs.readFileSync(xmlPath, 'utf8');
    
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      // Always treat 'game', 'folder', and 'cheat' as arrays
      isArray: (tagName, jpath, isLeafNode, isAttribute) => {
        return ['game', 'folder', 'cheat'].includes(tagName);
      }
    });
    
    const jsonObj = parser.parse(xmlData);

    // Log the entire parsed JSON for debugging
    console.log('Parsed Cheats XML:', JSON.stringify(jsonObj, null, 2));

    // Access the 'codelist' root element
    const codelist = jsonObj.codelist;
    if (!codelist || !codelist.game) {
      console.error('No <game> elements found in cheats.xml.');
      return;
    }

    const games = codelist.game; // Already an array due to isArray configuration

    games.forEach(game => {
      const gameName = game.name || 'Unknown Game';
      const gameID = game.gameid || 'UNKNOWN';
      const gameDate = game.date || 'Unknown Date';

      const folders = [];

      // Handle cheats directly under <game>
      if (game.cheat && Array.isArray(game.cheat)) {
        const generalFolder = {
          folder_name: 'General',
          allowedon: 0, // Default value; adjust as needed
          cheats: game.cheat.map(cheat => ({
            name: cheat.name || 'Unnamed Cheat',
            notes: cheat.note || '',
            codes: cheat.codes || ''
          }))
        };
        folders.push(generalFolder);
      }

      // Handle cheats within <folder>
      if (game.folder && Array.isArray(game.folder)) {
        game.folder.forEach(folder => {
          const folderName = folder.name || 'Unnamed Folder';
          const allowedOn = folder.allowedon !== undefined ? folder.allowedon : 0;

          const folderCheats = [];
          if (folder.cheat && Array.isArray(folder.cheat)) {
            folder.cheat.forEach(cheat => {
              folderCheats.push({
                name: cheat.name || 'Unnamed Cheat',
                notes: cheat.note || '',
                codes: cheat.codes || ''
              });
            });
          }

          folders.push({
            folder_name: folderName,
            allowedon: allowedOn,
            cheats: folderCheats
          });
        });
      }

      // Populate cheatsData with gameID as the key
      cheatsData[gameID] = {
        name: gameName,
        date: gameDate,
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

/**
 * Retrieves cheats for a specific GameID.
 * @param {string} gameID - The GameID to lookup.
 * @returns {object|null} - The cheats data or null if not found.
 */
const getCheatsForGameID = (gameID) => {
  return cheatsData[gameID] || null;
};

/**
 * Searches within a specific game's cheats based on a search term.
 * @param {string} gameID - The GameID to search within.
 * @param {string} searchTerm - The term to search for.
 * @returns {object} - The filtered cheats data.
 */
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
      allowedon: folder.allowedon,
      cheats: filteredCheats
    };
  }).filter(folder => folder.cheats.length > 0);

  return {
    name: game.name,
    date: game.date,
    folders: filteredFolders
  };
};

/**
 * Searches games by name or GameID.
 * @param {object} cheatData - The cheats data object.
 * @param {string} searchTerm - The term to search for.
 * @returns {object} - The filtered games data.
 */
const search_games = (cheatData, searchTerm) => {
  const lowerSearch = searchTerm.toLowerCase();
  const filteredCheats = {};

  Object.keys(cheatData).forEach(gameID => {
    const game = cheatData[gameID];
    if (game.name.toLowerCase().includes(lowerSearch) || gameID.toLowerCase().includes(lowerSearch)) {
      filteredCheats[gameID] = game;
    }
  });

  return filteredCheats;
};

module.exports = { getCheatsForGameID, searchCheats, search_games };
