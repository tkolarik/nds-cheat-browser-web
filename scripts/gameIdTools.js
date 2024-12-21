// scripts/gameIdTools.js

const { execFile } = require('child_process');
const fs = require('fs');
const crc = require('crc'); // CRC32 calculation
const path = require('path');

const generateGameID = async (romPath) => {
  try {
    const gameCode = await extractGameCode(romPath);
    if (!gameCode) {
      throw new Error('Failed to extract Game Code.');
    }

    const jamCrc = await calculateJamCRC(romPath);
    if (!jamCrc) {
      throw new Error('Failed to calculate JAMCRC.');
    }

    return `${gameCode} ${jamCrc}`;
  } catch (error) {
    console.error('generateGameID Error:', error);
    return null;
  }
};

const extractGameCode = (romPath) => {
  return new Promise((resolve, reject) => {
    execFile('ndstool', ['-i', romPath], (error, stdout, stderr) => {
      if (error) {
        console.error('ndstool Error:', stderr);
        return reject(error);
      }

      // Parse stdout to find "Game code"
      const lines = stdout.split('\n');
      const gameCodeLine = lines.find(line => line.includes('Game code'));

      if (!gameCodeLine) {
        console.error('Game code not found in ndstool output.');
        return reject(new Error('Game code not found.'));
      }

      // Example line:
      // 0x0C	Game code                	IPKE (NTR-IPKE-USA)
      const parts = gameCodeLine.split('\t');
      if (parts.length < 3) {
        console.error('Unexpected Game code line format.');
        return reject(new Error('Unexpected Game code line format.'));
      }

      const gameCodeFull = parts[2].trim();
      const gameCode = gameCodeFull.substring(0, 4).toUpperCase();
      resolve(gameCode);
    });
  });
};

const calculateJamCRC = (romPath) => {
  return new Promise((resolve, reject) => {
    fs.readFile(romPath, (err, data) => {
      if (err) {
        console.error('Error reading ROM file:', err);
        return reject(err);
      }

      const header = data.slice(0, 512);
      if (header.length < 512) {
        console.error('ROM header is less than 512 bytes.');
        return reject(new Error('ROM header is too short.'));
      }

      const crc32Val = crc.crc32(header) >>> 0; // Ensure unsigned
      const jamCrc = (~crc32Val >>> 0) >>> 0; // Bitwise NOT and ensure 32-bit
      const jamCrcHex = jamCrc.toString(16).toUpperCase().padStart(8, '0');

      resolve(jamCrcHex);
    });
  });
};

module.exports = { generateGameID };
