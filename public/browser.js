// public/browser.js

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const gamesContainer = document.getElementById('games-container');
    const toastContainer = document.querySelector('.toast-container');

    let allGames = [];

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

    // Fetch all games and cheats
    const fetchGames = async () => {
        try {
            const response = await fetch('/api/games', {
                method: 'GET',
            });
            const data = await response.json();
            if (response.ok) {
                allGames = data.games;
                displayGames(allGames);
            } else {
                showToast(data.error || 'Failed to load games.', 'danger');
            }
        } catch (error) {
            console.error('Error fetching games:', error);
            showToast('An error occurred while fetching games.', 'danger');
        }
    };

    // Display games
    const displayGames = (games) => {
        gamesContainer.innerHTML = '';

        if (games.length === 0) {
            gamesContainer.innerHTML = '<p>No games found.</p>';
            return;
        }

        games.forEach((game, index) => {
            const gameCard = document.createElement('div');
            gameCard.classList.add('card', 'mb-3');

            const gameHeader = document.createElement('div');
            gameHeader.classList.add('card-header', 'd-flex', 'justify-content-between', 'align-items-center');
            gameHeader.innerHTML = `
                <h5 class="mb-0">${game.game_name}</h5>
                <button class="btn btn-sm btn-outline-primary toggle-btn" type="button" data-bs-toggle="collapse" data-bs-target="#game-${index}-cheats" aria-expanded="false" aria-controls="game-${index}-cheats">
                    <i class="bi bi-chevron-down"></i>
                </button>
            `;
            gameCard.appendChild(gameHeader);

            const gameBody = document.createElement('div');
            gameBody.id = `game-${index}-cheats`;
            gameBody.classList.add('collapse');
            gameBody.innerHTML = `
                <div class="card-body">
                    ${generateCheatsHTML(game.folders)}
                </div>
            `;
            gameCard.appendChild(gameBody);

            gamesContainer.appendChild(gameCard);
        });
    };

    // Generate HTML for cheats
    const generateCheatsHTML = (folders) => {
        let html = '';

        folders.forEach(folder => {
            html += `
                <div class="folder mb-4">
                    <h6>${folder.folder_name}</h6>
                    ${generateFolderCheatsHTML(folder.cheats)}
                </div>
            `;
        });

        return html;
    };

    const generateFolderCheatsHTML = (cheats) => {
        let html = '';

        cheats.forEach(cheat => {
            html += `
                <div class="cheat-item mb-3">
                    <div class="form-check">
                        <input class="form-check-input cheat-checkbox" type="checkbox" ${cheat.is_enabled ? 'checked' : ''} id="cheat-${sanitizeId(cheat.name)}" data-name="${cheat.name}" data-gameid="${sanitizeId(cheat.gameid)}">
                        <label class="form-check-label" for="cheat-${sanitizeId(cheat.name)}">
                            ${cheat.name}
                        </label>
                        <input type="checkbox" class="form-check-input ms-3 bookmark-checkbox" id="bookmark-${sanitizeId(cheat.name)}" data-name="${cheat.name}" data-gameid="${sanitizeId(cheat.gameid)}" ${cheat.is_bookmarked ? 'checked' : ''}>
                        <label class="form-check-label ms-1" for="bookmark-${sanitizeId(cheat.name)}">
                            Bookmark
                        </label>
                    </div>
                    ${cheat.codes ? `<div class="cheat-codes mt-2"><strong>Codes:</strong><br><pre>${cheat.codes}</pre></div>` : ''}
                </div>
            `;
        });

        return html;
    };

    // Sanitize ID for HTML elements
    const sanitizeId = (str) => {
        return str.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    };

    // Handle Cheat and Bookmark Toggles
    gamesContainer.addEventListener('change', async (e) => {
        if (e.target.classList.contains('bookmark-checkbox')) {
            const cheatName = e.target.getAttribute('data-name');
            const gameID = e.target.getAttribute('data-gameid');
            const isBookmarked = e.target.checked;

            try {
                // Fetch current bookmarks for the game
                const response = await fetch(`/get-bookmarks?gameid=${encodeURIComponent(gameID)}`, {
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
                    body: JSON.stringify({ gameid: gameID, bookmarks }),
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

    // Handle Search Input
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase();
        const filteredGames = allGames.filter(game => game.game_name.toLowerCase().includes(query));
        displayGames(filteredGames);
    });

    // Fetch games on load
    fetchGames();
});
