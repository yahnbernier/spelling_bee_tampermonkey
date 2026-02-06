function updateTable() {
    // Your existing code...
    let previousValues = {};

    // Track previous cell values to detect changes
    const cells = document.querySelectorAll('.cell');
    cells.forEach(cell => {
        const cellValue = cell.textContent;
        if (previousValues[cell.dataset.id] !== undefined && previousValues[cell.dataset.id] !== cellValue) {
            // Cell has updated
            cell.classList.add('flash'); // Add flash class
            cell.classList.add('recently-updated'); // Add persistent recent highlight
            setTimeout(() => cell.classList.remove('flash'), 1000); // Remove the flash class after 1 second
        }
        previousValues[cell.dataset.id] = cellValue; // Update previous value
    });

    // Clear previous highlights before applying new ones
    document.querySelectorAll('.recently-updated').forEach(updatedCell => {
        updatedCell.classList.remove('recently-updated');
    });
    // Your existing code continues...
}

// CSS Animations
const style = document.createElement('style');
style.textContent = `
    .flash {
        animation: flashYellow 1s;
    }

    .recently-updated {
        background-color: yellow;
    }

    @keyframes flashYellow {
        0% { background-color: yellow; }
        100% { background-color: transparent; }
    }
`;
document.head.append(style);

// Update version
const version = '1.2';
