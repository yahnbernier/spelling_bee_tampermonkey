// ==UserScript==
// @name         Spelling Bee Counters
// @namespace    http://tampermonkey.net/
// @version      0.6
// @description  Improve NYTimes Spelling Bee layout if using "Today's Hints"
// @author       Yahn Bernier
// @match        https://www.nytimes.com/puzzles/spelling-bee*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=nytimes.com
// @grant        GM_xmlhttpRequest
// @updateURL    https://raw.githubusercontent.com/yahnbernier/spelling_bee_tampermonkey/blob/main/script.user.js
// @downloadURL  https://raw.githubusercontent.com/yahnbernier/spelling_bee_tampermonkey/blob/main/script.user.js

// ==/UserScript==

//const hint_element = document.getElementsByClassName( "pz-toolbar-button pz-toolbar-button__hints" )[0];
//var hint_url = hint_element.href;

// new puzzles release at 3 am so we shift NYC time backward 3 hours
var utc_date = new Date();
var currentdate = new Date( utc_date.toLocaleString( 'en-US', {
    timeZone: 'America/New_York',
  }) );
currentdate = new Date( currentdate.getTime() - 3 * 60 * 60 * 1000 );

function isValidDate(dateString) {
  var regEx = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateString.match(regEx))
  {
      return false; // Invalid format
  }
  var d = new Date(dateString);
  var dNum = d.getTime();
  if(!dNum && dNum !== 0)
  {
      return false; // NaN value, Invalid date
  }
  return d.toISOString().slice(0,10) === dateString;
}

function generate_hint_url()
{
    var hint_url = "";

    console.log( "generating hint for ", document.URL );

    // see if url ends with a date such as "https://www.nytimes.com/puzzles/spelling-bee/2024-01-08"
    var base_url = "https://www.nytimes.com/puzzles/spelling-bee";
    if ( document.URL.startsWith( base_url ) )
    {
        var part_after_base = document.URL.slice( base_url.length + 1 );
        console.log( "base", part_after_base );
        // if the part after the base looks like a valid date "yyyy-mm-dd", try and load hints for that date!
        if ( isValidDate( part_after_base ) )
        {
            // replace - with /
            hint_url = "https://www.nytimes.com/" + part_after_base.replaceAll( "-", "/" ) + "/crosswords/spelling-bee-forum.html";
        }
    }

    if ( hint_url.length == 0 )
    {
        hint_url = "https://www.nytimes.com/" + currentdate.getFullYear() + "/" + ( currentdate.getMonth() + 1 ).toString().padStart( 2, "0" ) + "/" + currentdate.getDate().toString().padStart( 2, "0" ) + "/crosswords/spelling-bee-forum.html";
    }

    return hint_url;
}

var hint_url = generate_hint_url();

//hint_url = hint_url + "fail";

var dict = {}; // build a dictionary of first two letter pairs and count
var lengthCountsByLetter = {}

// hints
var dictHints = {};
var lengthCountsByLetterHints = {};

var max_score = 0;
var total_words = 0;
var maxlen = 4;

console.log( hint_url );

let HintProcessor = class
{
    extract_two_letters( inputstring, dict )
    {
        var raw_string = inputstring.textContent.trim();
        var stringArray = raw_string.split( " " );
        for ( const x of stringArray )
        {
            var tokens = x.split( "-" );
            //console.log( tokens );
            dict[ tokens[ 0 ] ] = Number( tokens[ 1 ] );
        }
    }

    extract_length_counts( row, outlist )
    {
        const cells = row.getElementsByClassName( "cell" );

        // skip the final "Σ"
        for ( var i = 1 ; i < cells.length - 1; ++i )
        {
            var l = Number( cells[ i ].textContent );
            outlist.push( l );
            maxlen = Math.max( maxlen, l );
        }
    }

    process_rows( hintRows, dict )
    {
        var lengths = [];
        this.extract_length_counts( hintRows[ 0 ], lengths );

        for ( var x = 1 ; x < hintRows.length - 1; ++x )
        {
            const cells = hintRows[ x ].getElementsByClassName( "cell" );
            var cellLetter = cells[ 0 ].textContent.slice( 0, 1 );

            // init key
            dict[ cellLetter ] = {};

            for ( var y = 1; y < cells.length - 1; ++y )
            {
                var cellText = cells[ y ].textContent;

                var cellCount = Number( cellText );
                if ( isNaN( cellCount ) )
                {
                    continue;
                }
                dict[ cellLetter ][ lengths[ y - 1 ] ] = cellCount;
            }
        }
    }

    get_max_score( doc )
    {
        const pattern = /POINTS\:\s+([0-9]+)/;

        for ( const node of doc.getElementsByClassName("content") )
        {
            const matches = node.textContent.match( pattern );
            if ( matches )
            {
                return Number( matches[ 1 ] );
            }
        }

        return 0;
    }

    get_total_words( doc )
    {
        const pattern = /WORDS\:\s+([0-9]+)/;

        for ( const node of doc.getElementsByClassName("content") )
        {
            const matches = node.textContent.match( pattern );
            if ( matches )
            {
                return Number( matches[ 1 ] );
            }
        }

        return 0;
    }
}

function is_complete( str )
{
    var tokens = str.split( "/" );
    if ( tokens.length != 2 )
    {
        return true;
    }

    if ( tokens [ 0 ] == tokens[ 1 ] )
    {
        return true;
    }
    return false;
}

var intv;
var wordListObserver = null;

function rebuildDictionaries() {
    // Reset dictionaries
    dict = {};
    lengthCountsByLetter = {};
    
    const nodes = document.querySelectorAll(".sb-anagram, .sb-anagram.pangram");
    var wordsSeen = {};
    
    for (let i = 0; i < nodes.length; i++) {
        const element = nodes[i];
        const word = element.textContent.replace(/\s+\d+\/\d+.*$/, '').trim(); // Remove progress labels
        
        if (word in wordsSeen) {
            continue;
        }
        
        wordsSeen[word] = 1;
        
        const firstCharacter = word.slice(0, 1);
        const firstTwoChars = word.slice(0, 2);
        
        // Build two-letter dictionary
        if (!(firstTwoChars in dict)) {
            dict[firstTwoChars] = 0;
        }
        dict[firstTwoChars] += 1;
        
        // Build length counts by letter
        const length = word.length;
        if (!(firstCharacter in lengthCountsByLetter)) {
            lengthCountsByLetter[firstCharacter] = {};
        }
        
        const lcl = lengthCountsByLetter[firstCharacter];
        if (!(length in lcl)) {
            lcl[length] = 0;
        }
        lcl[length] += 1;
    }
}

function updateTable() {
    console.log("Updating table with new word data...");
    
    rebuildDictionaries();
    
    // Update the main table
    const tableBody = document.querySelector(".table tbody");
    if (!tableBody) return;
    
    const rows = tableBody.querySelectorAll(".row");
    
    // Skip header row (index 0), process data rows
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const cells = row.querySelectorAll("td");
        
        // Get the letter from first cell (e.g., "B:")
        const letterCell = cells[0];
        const letter = letterCell.textContent.trim().replace(":", "");
        
        const lcl = lengthCountsByLetter[letter] || {};
        const lcl_hint = lengthCountsByLetterHints[letter] || {};
        
        let sum = 0;
        let sumHint = 0;
        
        // Update length count cells (skip first cell which is the letter)
        let cellIndex = 1;
        for (let j = 4; j <= maxlen + 1; j++) {
            const cell = cells[cellIndex];
            if (!cell) break;
            
            let add;
            if (j in lcl_hint) {
                sumHint += lcl_hint[j];
                if (j in lcl) {
                    sum += lcl[j];
                    add = lcl[j].toString() + "/" + lcl_hint[j].toString();
                } else {
                    add = "0/" + lcl_hint[j].toString();
                }
                
                // Update cell styling
                cell.classList.remove("cell-complete", "cell-incomplete");
                if (!is_complete(add)) {
                    cell.classList.add("cell-incomplete");
                    cell.setAttribute("aria-label", "Incomplete: " + add);
                    add = "❌ " + add;
                } else {
                    cell.classList.add("cell-complete");
                    cell.setAttribute("aria-label", "Complete: " + add);
                    add = "✓ " + add;
                }
            } else if (j > maxlen) {
                add = sum.toString() + "/" + sumHint.toString();
            } else {
                add = "-";
            }
            
            cell.textContent = add;
            cellIndex++;
        }
        
        // Update two-letter pair cells
        const twoLetterCells = row.querySelectorAll(".cellwide");
        for (let cellWide of twoLetterCells) {
            const match = cellWide.textContent.match(/([A-Z]{2})-/);
            if (!match) continue;
            
            const pair = match[1].toLowerCase();
            let progress;
            
            if (pair in dict) {
                progress = dict[pair].toString() + "/" + dictHints[pair].toString();
            } else {
                progress = "0/" + dictHints[pair].toString();
            }
            
            let add;
            cellWide.classList.remove("cell-complete", "cell-incomplete");
            if (!is_complete(progress)) {
                cellWide.classList.add("cell-incomplete");
                cellWide.setAttribute("aria-label", "Incomplete: " + pair.toUpperCase() + "-" + progress);
                add = "❌ " + pair.toUpperCase() + "-" + progress;
            } else {
                cellWide.classList.add("cell-complete");
                cellWide.setAttribute("aria-label", "Complete: " + pair.toUpperCase() + "-" + progress);
                add = "✓ " + pair.toUpperCase() + "-" + progress;
            }
            
            cellWide.textContent = add;
        }
    }
    
    // Update anagram labels with progress
    updateAnagramLabels();
}

function updateAnagramLabels() {
    const nodes = document.querySelectorAll(".sb-anagram, .sb-anagram.pangram");
    var dictSeen = {};
    
    for (let i = 0; i < nodes.length; i++) {
        const element = nodes[i];
        const word = element.textContent.replace(/\s+\d+\/\d+.*$/, '').trim();
        const firstTwoChars = word.slice(0, 2);
        
        if (firstTwoChars in dictSeen) {
            continue;
        }
        
        const count = dict[firstTwoChars] || 0;
        const goal = dictHints[firstTwoChars];
        
        if (!goal) continue;
        
        dictSeen[firstTwoChars] = true;
        const prog = count.toString() + "/" + goal.toString();
        
        element.textContent = word + " " + prog;
        element.style.fontWeight = "bold";
        element.style.color = is_complete(prog) ? "blue" : "red";
    }
}

function updateProgressLabels() {
    // Update the progress label
    const progressNode = document.getElementsByClassName("sb-progress-value")[0];
    if (progressNode && max_score > 0) {
        const currentScore = progressNode.textContent.replace(/\/\d+$/, '').trim();
        progressNode.textContent = currentScore + "/" + max_score.toString();
    }
    
    // Update word list label
    const wordNode = document.getElementsByClassName("sb-wordlist-summary")[0];
    if (wordNode && total_words > 0) {
        const match = wordNode.textContent.match(/^(\\d+)/);
        if (match) {
            const currentCount = match[1];
            wordNode.textContent = currentCount + " out of " + total_words.toString();
        }
    }
}

function setupWordListObserver() {
    if (wordListObserver) {
        wordListObserver.disconnect();
    }
    
    // Observe changes to the word list area
    const wordListContainer = document.querySelector(".sb-wordlist-window, .sb-wordlist-drawer");
    const progressContainer = document.querySelector(".sb-progress-value");
    
    wordListObserver = new MutationObserver((mutations) => {
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
            updateTable();
            updateProgressLabels();
        }
    });
    
    const config = {
        childList: true,
        subtree: true,
        characterData: true,
        characterDataOldValue: true
    };
    
    if (wordListContainer) {
        wordListObserver.observe(wordListContainer, config);
    }
    
    if (progressContainer) {
        wordListObserver.observe(progressContainer, config);
    }
    
    console.log("Word list observer set up for real-time updates");
}

function continue_processing()
{
    console.log( "processing rest..." );

    const nodes = document.querySelectorAll(".sb-anagram, .sb-anagram.pangram");
    var c = nodes.length;

    console.log( "progress words", c );

    if ( c == 0 )
    {
        var div = document.createElement( "div" );
        div.innerHTML = '<div id="childId"><br>';
        div.innerHTML = '<br>No words retrieved (just started day?)!<br>';
        div.innerHTML += '</div>';
        div.style.color = "blue";
        div.style.fontWeight = "bold";
        div.style.fontSize = "x-large";

        // FIX START: Check if pz-module exists
        const pzmodule = document.getElementsByClassName( "pz-module" )[0];
        if (pzmodule) {
            pzmodule.appendChild( div );
        } else {
            // Fallback: append to the main game container if pz-module isn't found
            const fallback = document.querySelector(".sb-content-box") || document.body;
            fallback.appendChild(div);
        }
        // FIX END
    }

    // Build initial dictionaries
    rebuildDictionaries();

    console.log( "length by first letter...", Object.keys( lengthCountsByLetter ).length );
    console.log( "length by first two letters...", Object.keys( dict ).length );

    // Update anagram labels initially
    updateAnagramLabels();

    console.log( "set style..." );

    var style = document.createElement('style');
    style.innerHTML = `
    p {
        font-family: 'nyt-imperial';
        font-size: 0.9rem;
    }

    .content {
        font-family: 'nyt-imperial';
        font-size: 1rem;
        line-height: 1rem;
        margin-bottom: 0rem;
    }

    .table {
        text-align: center;
        text-transform: uppercase;
        width: auto;
        margin: 0.5rem 0;
        font-size: 0.75rem;
        line-height: 1.2rem;
        border-collapse: collapse;
        background-color: #f7f7f7;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        overflow: hidden;
    }

    .row {
        height: auto;
        transition: background-color 0.2s ease;
    }

    .table .row:hover {
        background-color: #fffacd;
        cursor: pointer;
    }

    .row:first-child {
        background-color: #f0c800;
        border-bottom: 2px solid #d4b000;
    }

    .row:nth-child(odd):not(:first-child) {
        background-color: #f7f7f7;
    }

    .row:nth-child(even) {
        background-color: #ffffff;
    }

    .celllegend {
        width: 24px;
        min-width: 24px;
        max-width: 24px;
        padding: 6px 4px;
    }

    .cell {
        width: 44px;
        min-width: 44px;
        max-width: 44px;
        text-align: right;
        padding: 6px 8px;
        transition: background-color 0.2s ease;
    }

    .cell:hover {
        background-color: #f0c800;
    }

    .cellwide {
        width: 60px;
        min-width: 60px;
        max-width: 60px;
        text-align: right;
        padding: 6px 8px;
        font-size: 0.7rem;
        transition: background-color 0.2s ease;
    }

    .cellwide:hover {
        background-color: #f0c800;
    }

    .cell-complete {
        color: #5a5a5a;
        background-color: #e6f3e6;
        font-weight: normal;
    }

    .cell-incomplete {
        color: red;
        background-color: #ffe6e6;
        font-weight: bold;
    }

    .table-header {
        background-color: #f0c800;
        padding: 10px;
        border-radius: 8px 8px 0 0;
        margin-bottom: 0;
        text-align: center;
        font-weight: bold;
        font-size: 1rem;
        color: #000;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
  `;
    document.head.appendChild(style);

    console.log( "create table..." );

    console.log( "maxlen", maxlen );


    const content_box = document.querySelector(".sb-controls") || document.querySelector('[class^="sb-"]');

    if (!content_box) {
        console.error("Spelling Bee Counters: Could not find a container to attach the table to.");
        return; // Exit the function so it doesn't crash the whole script
    }

    var newArea = document.createElement( 'div' );
    // ... rest of your table creation code ...
    //content_box.appendChild( newArea );

    // Add header section
    var tableHeader = document.createElement( 'div' );
    tableHeader.className = "table-header";
    tableHeader.textContent = "📊 Word Count Progress";
    newArea.appendChild( tableHeader );

    var newTable = document.createElement( 'table' );
    newTable.className = "table";

    newArea.appendChild( newTable );
    var newTableBody = document.createElement( 'tbody' );
    newTable.appendChild( newTableBody );

    var newRow;
    var newCell;

    console.log( "build header..." );

    // header
    newRow = document.createElement( 'tr' );
    newRow.className = "row";
    // add header
    for ( var h = 3; h <= maxlen + 1; h++ )
    {
        newCell = document.createElement( 'td' );
        newCell.className = "cell";

        if ( h == 3 )
        {
            newCell.className = "celllegend";
            newCell.textContent = "";
        }
        else if ( h > maxlen )
        {
            newCell.style.fontWeight = "700";
            newCell.textContent = "Σ";
        }
        else
        {
            newCell.style.fontWeight = "700";
            newCell.textContent = h.toString();
        }

        newRow.appendChild( newCell );
    }

    // legend for two letter hints, too
    newCell = document.createElement( 'td' );
    newCell.className = "cellwide";
    newCell.textContent = "PAIRS";
    newRow.appendChild( newCell );

    newTableBody.appendChild( newRow );

    console.log( "cur", lengthCountsByLetter );
    console.log( "hints", lengthCountsByLetterHints );

    function get_two_letter_keys_beginning_with_letter( search, dict, list )
    {
        for ( var key in dict )
        {
            if ( key.slice( 0, 1 ) == search )
            {
                list.push( key );
            }
        }
    }

    var progress;

    console.log( lengthCountsByLetterHints );

    // now add lines
    for (var key in lengthCountsByLetterHints )
    {
        var two_letters = [];
        get_two_letter_keys_beginning_with_letter( key, dictHints, two_letters );

        console.log( "building row for ", key, two_letters );

        //console.log( key, two_letters );
        // console.log( "lengthCountsByLetter", lengthCountsByLetter );

        var lcl = {}
        if ( key in lengthCountsByLetter )
        {
            lcl = lengthCountsByLetter[ key ];
        }
        var lcl_hint = lengthCountsByLetterHints[ key ];

        newRow = document.createElement( 'tr' );
        newRow.className = "row";

        var letterSpan = document.createElement( 'span' );
        letterSpan.style.fontWeight = "700";
        letterSpan.textContent = key.toString().toUpperCase();
        newCell = document.createElement( 'td' );
        newCell.className = "celllegend";
        newCell.appendChild( letterSpan );
        newCell.insertAdjacentHTML( 'beforeend', ":" );
        newRow.appendChild( newCell );

        console.log( "hint", lcl_hint, "actual", lcl );

        var sum = 0;
        var sumHint = 0;
        for ( var j = 4; j <= maxlen + 1; j++ )
        {
            newCell = document.createElement( 'td' );
            newCell.className = "cell";

            var add;
            if ( j in lcl_hint )
            {
                sumHint += lcl_hint[ j ];
                if ( j in lcl )
                {
                   sum += lcl[ j ];
                   add = lcl[ j ].toString() + "/" + lcl_hint[ j ].toString();
                }
                else
                {
                    add = "0/" + lcl_hint[ j ].toString();
                }

                if ( !is_complete( add ) )
                {
                    newCell.classList.add("cell-incomplete");
                    newCell.setAttribute("aria-label", "Incomplete: " + add);
                    add = "❌ " + add;
                }
                else
                {
                    newCell.classList.add("cell-complete");
                    newCell.setAttribute("aria-label", "Complete: " + add);
                    add = "✓ " + add;
                }
            }
            else if ( j > maxlen )
            {
                add = sum.toString() + "/" + sumHint.toString();
            }
            else
            {
                add = "-";
            }

            newCell.textContent = add;
            newRow.appendChild( newCell );
        }

        // now append the two letter hints
        for ( var twoLetterPair of two_letters )
        {
            newCell = document.createElement( 'td' );
            newCell.className = "cellwide";

            if ( twoLetterPair in dict )
            {
                progress = dict[ twoLetterPair ].toString() + "/" + dictHints[ twoLetterPair ].toString();
            }
            else
            {
                progress = "0/" + dictHints[ twoLetterPair ].toString()
            }

             if ( !is_complete( progress ) )
             {
                 newCell.classList.add("cell-incomplete");
                 newCell.setAttribute("aria-label", "Incomplete: " + twoLetterPair.toUpperCase() + "-" + progress);
                 add = "❌ " + twoLetterPair.toUpperCase() + "-" + progress;
             }
             else
             {
                 newCell.classList.add("cell-complete");
                 newCell.setAttribute("aria-label", "Complete: " + twoLetterPair.toUpperCase() + "-" + progress);
                 add = "✓ " + twoLetterPair.toUpperCase() + "-" + progress;
             }

            newCell.textContent = add;
            newRow.appendChild( newCell );
        }

        newTableBody.appendChild( newRow );
    }

    function add_newline_span( areaNode )
    {
        var newSpan = document.createElement( 'span' );
        newSpan.insertAdjacentHTML( 'beforeend', "<br>" );
        areaNode.appendChild( newSpan );
    }

    console.log( "update progress labels !" );

    // update the progress label
    updateProgressLabels();

    content_box.appendChild( newArea );
    
    // Set up real-time observer after table is created
    setupWordListObserver();
}

GM_xmlhttpRequest({
    method: 'GET',
    url: hint_url,
    headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "en-US,en;q=0.9",
        "sec-ch-ua-platform": "\"Unknown\"",
        "upgrade-insecure-requests": "1"
    },
    onload: function(resp) {
        var range = document.createRange();
        range.setStartAfter(document.body);
        var xhr_frag = range.createContextualFragment(resp.responseText);
        var xhr_doc = document.implementation.createDocument(null, 'html', null);
        xhr_doc.adoptNode(xhr_frag);
        xhr_doc.documentElement.appendChild(xhr_frag);

        const tables = xhr_doc.getElementsByClassName("table");
        if (tables.length == 0) {
            console.log("Could not find hint table at", hint_url);
            return;
        }

        const hintTable = tables[0];
        const hintRows = hintTable.getElementsByClassName("row");
        var processor = new HintProcessor();
        processor.process_rows(hintRows, lengthCountsByLetterHints);

        var parentElement = hintTable.parentNode;
        const pNodes = parentElement.getElementsByClassName("content");
        var final = pNodes.length - 1;

        const twoLetterSpans = pNodes[final].getElementsByTagName("span");
        for (var sp = 0; sp < twoLetterSpans.length; ++sp) {
            processor.extract_two_letters(twoLetterSpans[sp], dictHints);
        }

        max_score = processor.get_max_score(xhr_doc);
        total_words = processor.get_total_words(xhr_doc);

        console.log("Hints loaded. Waiting for game to start...");

        // --- NEW OBSERVER LOGIC REPLACES SETINTERVAL ---
        const startIfReady = () => {
            // Look for the word list or controls that appear after clicking "Play"
            const gameReady = document.querySelector(".sb-wordlist-window, .sb-controls, .sb-wordlist-heading");

            if (gameReady && !document.getElementById("counters-initialized")) {
                // Mark as initialized so we don't run twice
                const marker = document.createElement("div");
                marker.id = "counters-initialized";
                marker.style.display = "none";
                document.body.appendChild(marker);

                console.log("Game detected! Running script...");
                continue_processing();
            }
        };

        // Create observer to watch for the game UI appearing
        const observer = new MutationObserver((mutations) => {
            startIfReady();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Run once immediately in case page is already open
        startIfReady();
    }
});
