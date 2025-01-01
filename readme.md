# NDS Cheat Browser

This project provides a web interface for browsing and managing cheat codes for Nintendo DS games. It allows users to upload an NDS ROM, parses the ROM to extract the GameID, and then looks up corresponding cheats from a `cheats.xml` database. Users can also upload a Delta Emulator SQLite database to manage the enabled/disabled state of cheats and bookmark their favorite cheats.

## Features

*   **ROM Upload and GameID Extraction:**
    *   Users can upload an NDS ROM file (`.nds`).
    *   The application extracts the GameID using `ndstool` and calculates the JAMCRC.
    *   The SHA1 hash (`shasum`) of the ROM is computed for identification.
    *   Relevant code:
    ```javascript:scripts/gameIdTools.js
    startLine: 16
    endLine: 100
    ```
    ```javascript:server.js
    startLine: 107
    endLine: 136
    ```

*   **Cheat Lookup:**
    *   Uses the extracted GameID to look up cheats from a pre-populated `cheats.xml` file.
    *   Parses the XML and organizes cheats into folders.
    *   Relevant code:
    ```javascript:scripts/cheatLookup.js
    startLine: 12
    endLine: 103
    ```
    ```javascript:server.js
    startLine: 131
    endLine: 136
    ```

*   **Delta Emulator SQLite Integration:**
    *   Users can upload a Delta Emulator SQLite database (`.sqlite`).
    *   The application reads the database to determine which cheats are enabled for a given game (identified by the ROM's `shasum`).
    *   Relevant code:
    ```javascript:server.js
    startLine: 193
    endLine: 219
    ```

*   **Cheat Management:**
    *   Displays cheats in a user-friendly interface, organized by folders.
    *   Allows users to enable/disable cheats (currently only affects the current session).
    *   Users can bookmark cheats, which are stored in a separate `bookmarks.sqlite` database.
    *   Relevant code:
    ```javascript:public/main.js
    startLine: 147
    endLine: 208
    ```
    ```javascript:public/main.js
    startLine: 362
    endLine: 401
    ```
    ```javascript:public/browser.js
    startLine: 90
    endLine: 128
    ```
    ```javascript:public/browser.js
    startLine: 135
    endLine: 189
    ```
    ```javascript:server.js
    startLine: 55
    endLine: 67
    ```
    ```javascript:server.js
    startLine: 328
    endLine: 351
    ```
    ```javascript:server.js
    startLine: 358
    endLine: 377
    ```
    ```javascript:server.js
    startLine: 404
    endLine: 428
    ```

*   **Delta SQLite Generation:**
    *   Users can generate a modified Delta SQLite database with selected cheats enabled.
    *   Relevant code:
    ```javascript:public/main.js
    startLine: 215
    endLine: 264
    ```
    ```javascript:scripts/generateDeltaDb.js
    startLine: 98
    endLine: 138
    ```

*   **Database Browser:**
    *   Provides a separate page to browse all available games and cheats in the `cheats.xml` database.
    *   Allows users to bookmark cheats from the browser.
    *   Relevant code:
    ```javascript:public/browser.js
    startLine: 35
    endLine: 88
    ```
    ```html:public/browser.html
    startLine: 2
    endLine: 33
    ```

## Project Structure

*   **`/public`:** Contains static files served to the client (HTML, CSS, JavaScript).
    *   `index.html`: Main page for ROM and Delta upload, cheat display, and Delta generation.
    *   `browser.html`: Page for browsing the entire cheat database.
    *   `main.js`: JavaScript for the main page's functionality.
    *   `browser.js`: JavaScript for the database browser page.
    *   `styles.css`: CSS styles for the application.
*   **`/scripts`:** Contains server-side utility scripts.
    *   `cheatLookup.js`: Handles parsing of `cheats.xml` and cheat lookup.
    *   `generateDeltaDb.js`: Handles modification of the Delta SQLite database.
    *   `gameIdTools.js`: Handles GameID generation and `shasum` computation.
*   **`/data`:** Contains the `cheats.xml` file and the `bookmarks.sqlite` database.
*   **`server.js`:** Main server-side application logic.
*   **`package.json`:** Project dependencies and scripts.

## Setup

1. **Prerequisites:**
    *   Node.js and npm installed.
    *   `ndstool` installed and accessible in your system's PATH (for GameID extraction).

2. **Install Dependencies:**
    ```bash
    npm install
    ```

3. **Place `cheats.xml`:**
    *   Obtain a `cheats.xml` file (e.g., from [https://github.com/DeadSkullzJr/NDS-i-Cheat-Databases](https://github.com/DeadSkullzJr/NDS-i-Cheat-Databases)).
    *   Place the `cheats.xml` file in the `/data` directory.

4. **Run the Application:**
    ```bash
    node server.js
    ```

5. **Access the Application:**
    *   Open your web browser and go to `http://localhost:5050`.

## Usage

1. **Upload ROM:**
    *   On the main page (`index.html`), use the "Upload NDS ROM" form to upload your `.nds` ROM file.
    *   The GameID and `shasum` will be calculated, and corresponding cheats will be displayed if found.

2. **Upload Delta SQLite (Optional):**
    *   Use the "Upload Delta Emulator SQLite" form to upload your `.sqlite` file.
    *   This will update the enabled/disabled status of cheats based on your Delta settings.

3. **Manage Cheats:**
    *   Enable/disable cheats using the checkboxes.
    *   Bookmark cheats by checking the bookmark checkboxes (or automatically when enabling a cheat).

4. **Generate Delta SQLite:**
    *   Select the cheats you want to enable.
    *   Click the "Generate Delta Cheats SQLite" button to download a modified Delta database with your selected cheats enabled.

5. **Browse the Database:**
    *   Go to the "Database Browser" page (`browser.html`) to view all available games and cheats.
    *   Bookmark cheats directly from the browser.

## Notes

*   The application uses `express-rate-limit` to prevent abuse of the upload endpoints.
*   The `bookmarks.sqlite` database stores user bookmarks.
*   The application is currently designed to handle one game at a time.
*   Error handling and user feedback can be further improved.
*   The cheat code formatting function is in `server.js`.
    ```javascript:server.js
    startLine: 69
    endLine: 98
    ```
*   Styling is done using Bootstrap 5 and custom CSS.
    ```css:public/styles.css
    startLine: 1
    endLine: 73
    ```

## Future Improvements

*   Implement user authentication and multi-user support.
*   Allow searching for cheats within the application.
*   Add more robust error handling and user feedback.
*   Improve the UI/UX, especially for displaying large numbers of cheats.
*   Consider using a client-side framework (e.g., React, Vue) for a more dynamic user interface.
*   Add support for other cheat database formats.
*   Implement a way to persist cheat enabled/disabled states other than just relying on the Delta SQLite upload.

```mermaid
classDiagram
    class ROMData {
        +path String
        +header Bytes[512]
        +gameCode String
        +jamCrc String
        +gameID (gameCode + jamCrc) String
        +shasum (SHA1) String
    }

    class CheatsXML {
        +name String
        +gameid (gameCode + jamCrc) String
        +date String
    }

    class Folder {
        +folder_name String
        +allowedon Number
        +cheats List~Cheat~
    }

    class Cheat {
        +name String
        +notes String
        +codes String
        +is_enabled Boolean
        +is_bookmarked Boolean
    }

    class DeltaSQLiteGame {
        +Z_PK Number
        +ZIDENTIFIER (shasum) String
    }

    class DeltaSQLiteCheat {
        +Z_PK Number
        +ZGAME Number
        +ZISENABLED Number
        +ZCODE String
        +ZNAME String
        +ZTYPE Buffer
    }

    class BookmarkRecord {
        +id Number
        +gameid (shasum) String
        +cheat_name String
        +cheat_code String
    }

    class UserDeltaMemory {
        +shasum (SHA1) String
        +cheatCode String
        +name String
        +is_enabled Boolean
    }

    class APIGameResponse {
        +gameid (shasum) String
        +game_name String
        +folders List~Folder~
    }

    class APICheatResponse {
        +name String
        +notes String
        +codes String
        +is_enabled Boolean
        +is_bookmarked Boolean
    }

    CheatsXML "1" --> "*" Folder : contains
    Folder "1" --> "*" Cheat : contains
    DeltaSQLiteGame "1" --> "*" DeltaSQLiteCheat : has
    APIGameResponse "1" --> "*" Folder : contains
    Folder "1" --> "*" APICheatResponse : contains
    ROMData --> CheatsXML : lookupBy_gameID (gameCode + jamCrc)
    ROMData --> DeltaSQLiteGame : lookupBy_shasum (SHA1)
    DeltaSQLiteCheat --> UserDeltaMemory : parsedTo
    UserDeltaMemory --> APICheatResponse : mergedInto
    BookmarkRecord --> APICheatResponse : mergedInto

    note for ROMData "Represents an uploaded .nds ROM file.\nParses header for gameCode and jamCrc.\nUses SHA1 hash for identification."
    note for CheatsXML "Parsed from /data/cheats.xml at startup.\nContains game elements with gameid (gameCode + jamCrc)."
    note for Folder "Groups cheats under a game with properties and Cheat objects."
    note for Cheat "Contains cheat code and metadata including name, notes, codes, and states."
    note for DeltaSQLiteGame "Game entry in delta.sqlite ZGAME table.\nZIDENTIFIER is ROM shasum (SHA1)."
    note for DeltaSQLiteCheat "Cheat entry in delta.sqlite with enabled state, code, and game reference."
    note for BookmarkRecord "User-saved bookmark with gameid (shasum), cheat name, and code."
    note for UserDeltaMemory "In-memory mapping of cheats from delta.sqlite.\nKeyed by shasum (SHA1)."
    note for APIGameResponse "JSON response for /upload-rom with game details and folders.\ngameid is shasum (SHA1)."
    note for APICheatResponse "JSON cheat representation with merged XML, Delta, and bookmark data."
    ```