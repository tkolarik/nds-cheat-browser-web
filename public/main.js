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
          showToast(data.error || 'Failed to upload ROM.', 'danger');
          return;
        }
  
        // Display Game Info
        currentGameID = data.gameid;
        currentGameName = data.game_name;
        gameNameEl.textContent = currentGameName;
        gameIdEl.textContent = currentGameID;
        gameInfoDiv.classList.remove('d-none');
  
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
  
        showToast('Delta SQLite file uploaded successfully.');
  
      } catch (error) {
        console.error('Error uploading Delta SQLite:', error);
        showToast('An error occurred while uploading the Delta SQLite file.', 'danger');
      }
    });
  
    // Function to display cheats
    const displayCheats = (folders) => {
      cheatsContainer.innerHTML = '';
  
      folders.forEach(folder => {
        const folderCard = document.createElement('div');
        folderCard.classList.add('card', 'mb-3');
  
        const folderHeader = document.createElement('div');
        folderHeader.classList.add('card-header');
        folderHeader.innerHTML = `<h5>${folder.folder_name}</h5>`;
        folderCard.appendChild(folderHeader);
  
        const folderBody = document.createElement('div');
        folderBody.classList.add('card-body');
  
        folder.cheats.forEach(cheat => {
          const cheatDiv = document.createElement('div');
          cheatDiv.classList.add('mb-3');
  
          cheatDiv.innerHTML = `
            <div class="form-check">
              <input class="form-check-input cheat-checkbox" type="checkbox" value="" id="${sanitizeId(cheat.name)}" data-name="${cheat.name}" data-codes="${encodeURIComponent(cheat.codes)}">
              <label class="form-check-label" for="${sanitizeId(cheat.name)}">
                ${cheat.name}
              </label>
            </div>
            <div class="cheat-description">
              <strong>Notes:</strong> ${cheat.notes || 'N/A'}
            </div>
            <div class="cheat-codes">
              <strong>Codes:</strong><br>
              <pre>${cheat.codes || 'N/A'}</pre>
            </div>
          `;
  
          folderBody.appendChild(cheatDiv);
        });
  
        folderCard.appendChild(folderBody);
        cheatsContainer.appendChild(folderCard);
      });
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
        codes: decodeURIComponent(cb.getAttribute('data-codes'))
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
        a.download = 'delta_cheats.sqlite';
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
  });
  