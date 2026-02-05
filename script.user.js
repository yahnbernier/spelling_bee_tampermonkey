    let isUpdating = false; // Guard flag to prevent re-entrant calls
    
    wordListObserver = new MutationObserver((mutations) => {
        // Prevent re-entrant calls
        if (isUpdating) {
            return;
        }
        
        let shouldUpdate = false;
        
        for (let mutation of mutations) {
            // Check if new words were added or removed
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                for (let node of mutation.addedNodes) {
                    if (node.classList && (node.classList.contains('sb-anagram') || 
                        node.querySelector && node.querySelector('.sb-anagram'))) {
                        shouldUpdate = true;
                        break;
                    }
                }
            }
            
            // Check if progress text changed
            if (mutation.type === 'characterData' || 
                (mutation.type === 'childList' && mutation.target.classList && 
                 mutation.target.classList.contains('sb-progress-value'))) {
                shouldUpdate = true;
            }
        }
        
        if (shouldUpdate) {
            isUpdating = true; // Set flag before updating
            try {
                updateTable();
                updateProgressLabels();
            } finally {
                isUpdating = false; // Clear flag after updating
            }
        }
    });