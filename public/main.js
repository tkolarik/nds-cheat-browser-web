// public/main.js

document.addEventListener('DOMContentLoaded', () => {
    const romForm = document.getElementById('rom-form');
    const deltaForm = document.getElementById('delta-form');
    const romFileInput = document.getElementById('rom-file');
    const deltaFileInput = document.getElementById('delta-file');
    const gameInfoDiv = document.getElementById('game-info');
    const gameNameEl = document.getElementById('game-name');
    const gameIdEl = document.getElementById('game-id');
    const cheatsSection = document.getElementById('cheats-section');
    const cheatsContainer = document.getElementById('cheats-container');
    const generateDeltaBtn = document.getElementById('generate-delta-btn');
    const toastContainer = document.getElementById('toast-container');
    const noCheatsFoundDiv = document.getElementById('no-cheats-found');
    const parsedGameIdEl = document.getElementById('parsed-gameid');

    let currentGameID = '';
    let currentGameName = '';
    let currentCheats = [];

    // Utility function to show toast notifications
    const showToast = (message, type = 'success') => {
      const toastId = `toast-${Date.now()}`;
      const toastHTML = `
        <div id="${toastId}" class="toast align-items-center text-bg-${type} border-0" role="alert" aria-live="assertive" aria-atomic="true">
          <div class="d-flex">
            <div class="toast-body">
              ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
          </div>
        </div>
      `;
      toastContainer.insertAdjacentHTML('beforeend', toastHTML);
      const toastElement = document.getElementById(toastId);
      const bsToast = new bootstrap.Toast(toastElement);
      bsToast.show();

      // Remove the toast from DOM after it hides
      toastElement.addEventListener('hidden.bs.toast', () => {
        toastElement.remove();
      });
    };

    // Handle ROM Upload
    romForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const file = romFileInput.files[0];
      if (!file) {
        showToast('Please select a .nds ROM file to upload.', 'warning');
        return;
      }

      const formData = new FormData();
      formData.append('rom', file);

      try {
        const response = await fetch('/upload-rom', {
          method: 'POST',
          body: formData
        });

        const data = await response.json();

        if (!response.ok) {
          // Display error message
          showToast(data.error || 'Failed to upload ROM.', 'danger');

          if (data.gameid) {
            // Display the parsed GameID
            currentGameID = data.gameid;
            parsedGameIdEl.textContent = currentGameID;
            noCheatsFoundDiv.classList.remove('d-none');
          } else {
            // Hide any previous GameID display
            noCheatsFoundDiv.classList.add('d-none');
          }

          // Optionally, clear previous game info and cheats
          gameInfoDiv.classList.add('d-none');
          cheatsSection.classList.add('d-none');
          cheatsContainer.innerHTML = '';

          return;
        }

        // Successful upload and cheats found
        currentGameID = data.gameid;
        currentGameName = data.game_name;
        gameNameEl.textContent = currentGameName;
        gameIdEl.textContent = currentGameID;
        gameInfoDiv.classList.remove('d-none');

        // Hide the "No Cheats Found" alert if previously shown
        noCheatsFoundDiv.classList.add('d-none');
        parsedGameIdEl.textContent = '';

        // Display Cheats
        currentCheats = data.folders;
        displayCheats(currentCheats);
        cheatsSection.classList.remove('d-none');

        showToast('ROM uploaded and cheats loaded successfully.');

      } catch (error) {
        console.error('Error uploading ROM:', error);
        showToast('An error occurred while uploading the ROM.', 'danger');
      }
    });

    // Handle Delta SQLite Upload
    deltaForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const file = deltaFileInput.files[0];
      if (!file) {
        showToast('Please select a Delta Emulator .sqlite file to upload.', 'warning');
        return;
      }

      const formData = new FormData();
      formData.append('delta', file);

      try {
        const response = await fetch('/upload-delta', {
          method: 'POST',
          body: formData
        });

        const data = await response.json();
        if (!response.ok) {
          showToast(data.error || 'Failed to upload Delta SQLite.', 'danger');
          return;
        }

        showToast('Delta SQLite file uploaded and parsed successfully.');

      } catch (error) {
        console.error('Error uploading Delta SQLite:', error);
        showToast('An error occurred while uploading the Delta SQLite file.', 'danger');
      }
    });

    // Function to display cheats with collapsible folders
    const displayCheats = (folders) => {
      cheatsContainer.innerHTML = '';

      folders.forEach((folder, index) => {
        const folderId = `folder-${index}`;

        // Create folder card
        const folderCard = document.createElement('div');
        folderCard.classList.add('card', 'mb-3');

        // Create folder header with collapse toggle
        const folderHeader = document.createElement('div');
        folderHeader.classList.add('card-header', 'd-flex', 'justify-content-between', 'align-items-center');
        folderHeader.innerHTML = `
          <h5 class="mb-0">${folder.folder_name}</h5>
          <button class="btn btn-sm btn-outline-primary toggle-btn" type="button" data-bs-toggle="collapse" data-bs-target="#${folderId}" aria-expanded="false" aria-controls="${folderId}">
            <i class="bi bi-chevron-down"></i>
          </button>
        `;
        folderCard.appendChild(folderHeader);

        // Create collapsible folder body (collapsed by default)
        const folderBody = document.createElement('div');
        folderBody.id = folderId;
        folderBody.classList.add('collapse');
        folderBody.innerHTML = `
          <div class="card-body">
            ${generateCheatsHTML(folder.cheats)}
          </div>
        `;
        folderCard.appendChild(folderBody);

        cheatsContainer.appendChild(folderCard);
      });
    };

    // Function to generate HTML for cheats
    const generateCheatsHTML = (cheats) => {
      let html = '';

      cheats.forEach(cheat => {
        const isEnabled = cheat.is_enabled ? 'checked' : '';
        const isBookmarked = cheat.is_bookmarked ? 'checked' : '';
        html += `
          <div class="cheat-item mb-3">
            <div class="form-check">
              <input class="form-check-input cheat-checkbox" type="checkbox" ${isEnabled} id="${sanitizeId(cheat.name)}" data-name="${cheat.name}" data-codes="${encodeURIComponent(cheat.codes)}">
              <label class="form-check-label" for="${sanitizeId(cheat.name)}">
                ${cheat.name}
              </label>
              <input type="checkbox" class="form-check-input ms-3 bookmark-checkbox" id="bookmark-${sanitizeId(cheat.name)}" data-name="${cheat.name}">
              <label class="form-check-label ms-1" for="bookmark-${sanitizeId(cheat.name)}">
                Bookmark
              </label>
            </div>
            ${cheat.notes ? `<div class="cheat-description"><strong>Notes:</strong> ${cheat.notes}</div>` : ''}
            <div class="cheat-codes">
              <strong>Codes:</strong><br>
              <pre>${cheat.codes || 'N/A'}</pre>
            </div>
          </div>
        `;
      });

      return html;
    };

    // Sanitize ID for HTML elements
    const sanitizeId = (str) => {
      return str.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    };

    // Handle Delta SQLite Generation
    generateDeltaBtn.addEventListener('click', async () => {
      const selectedCheatsElements = document.querySelectorAll('.cheat-checkbox:checked');
      if (selectedCheatsElements.length === 0) {
        showToast('Please select at least one cheat to enable.', 'warning');
        return;
      }

      const selectedCheats = Array.from(selectedCheatsElements).map(cb => ({
        name: cb.getAttribute('data-name'),
        codes: decodeURIComponent(cb.getAttribute('data-codes')),
        is_enabled: true
      }));

      const requestBody = {
        gameid: currentGameID,
        game_name: currentGameName,
        selectedCheats: selectedCheats
      };

      try {
        const response = await fetch('/generate-delta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const data = await response.json();
          showToast(data.error || 'Failed to generate Delta SQLite.', 'danger');
          return;
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'delta_cheats_modified.sqlite';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        showToast('Delta-compatible SQLite database generated and downloaded.');

      } catch (error) {
        console.error('Error generating Delta SQLite:', error);
        showToast('An error occurred while generating the Delta SQLite.', 'danger');
      }
    });

    // Handle Bookmark Toggle
    cheatsContainer.addEventListener('change', async (e) => {
      if (e.target.classList.contains('bookmark-checkbox')) {
        const cheatName = e.target.getAttribute('data-name');
        const isBookmarked = e.target.checked;

        try {
          // Fetch current bookmarks for the game
          const response = await fetch(`/get-bookmarks?gameid=${encodeURIComponent(currentGameID)}`, {
              method: 'GET',
          });
          const data = await response.json();
          let bookmarks = data.bookmarks;

          if (isBookmarked) {
              if (!bookmarks.includes(cheatName)) {
                  bookmarks.push(cheatName);
              }
          } else {
              bookmarks = bookmarks.filter(name => name !== cheatName);
          }

          // Save updated bookmarks
          const saveResponse = await fetch('/save-bookmarks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameid: currentGameID, bookmarks }),
          });
          const saveData = await saveResponse.json();

          if (saveResponse.ok) {
              showToast(`Cheat "${cheatName}" has been ${isBookmarked ? 'bookmarked' : 'removed from bookmarks'}.`, 'success');
          } else {
              showToast(saveData.error || 'Failed to update bookmarks.', 'danger');
          }

        } catch (error) {
          console.error('Error updating bookmarks:', error);
          showToast('An error occurred while updating bookmarks.', 'danger');
        }
      }

      if (e.target.classList.contains('cheat-checkbox')) {
        const cheatName = e.target.getAttribute('data-name');
        const isEnabled = e.target.checked;

        // Update the cheat status in the backend (if necessary)
        // This requires implementing an endpoint to update cheat statuses
        // For now, we'll assume that enabling/disabling cheats only affects the current session
        // Alternatively, you can trigger re-generation of the Delta SQLite with updated cheats

        showToast(`Cheat "${cheatName}" has been ${isEnabled ? 'enabled' : 'disabled'}.`);
      }
    });
});
