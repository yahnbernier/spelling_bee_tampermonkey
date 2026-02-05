// ==UserScript==
// @name         Spelling Bee Counters
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Improve NYTimes Spelling Bee layout if using "Today's Hints"
// @author       Yahn Bernier v.2
// @match        https://www.nytimes.com/puzzles/spelling-bee*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=nytimes.com
// @grant        GM_xmlhttpRequest

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
var lengthCountsByLetterHints = {}

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
        const pattern = /POINTS\:\s+([0-9]+)\,/;

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
        const pattern = /WORDS\:\s+([0-9]+)\,/;

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

/*
extract the table from hints site directly and fill in table showing 0/2 etc.

	4	5	6	7	8	10	Σ
B:	2	2	2	2	-	-	8
D:	4	2	3	-	-	-	9
E:	-	2	1	1	2	1	7
L:	1	1	1	-	-	-	3
M:	11	7	6	2	1	-	27
N:	-	-	-	-	1	-	1
O:	1	-	-	-	-	-	1
Σ:	19	14	13	5	4	1	56
Two letter list:

BE-1 BL-2 BO-5
DE-5 DO-4
EM-7
LE-1 LO-2
ME-12 MO-15
NO-1
OM-1
*/

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

    // pass 1 build dict

    var lcl;
    var lcl_hint;
    var i;
    var element;
    var firstTwoChars = "";
    var firstCharacter;
    var wordsSeen = {}

     for (i = 0; i < c; i++) {
        element = nodes[i];

        var word = element.textContent;
        if ( word in wordsSeen )
        {
            continue;
        }

        wordsSeen[ word ] = 1;

        firstCharacter = element.textContent.slice( 0, 1 );
        firstTwoChars = element.textContent.slice( 0, 2 );
        if ( !(firstTwoChars in dict ) )
        {
            dict[ firstTwoChars ] = 0;
        }

        dict[ firstTwoChars ] += 1;

        // now deal with first char counts
        var length = element.textContent.length;
        if ( !( firstCharacter in lengthCountsByLetter ) )
        {
            lengthCountsByLetter[ firstCharacter ] = {}
        }

        lcl = lengthCountsByLetter[ firstCharacter ];

        if ( !(length in lcl ) )
        {
            lcl[ length ] = 0;
        }

        lcl[ length ] += 1;
    }

    console.log( "length by first letter...", Object.keys( lengthCountsByLetter ).length );
    console.log( "length by first two letters...", Object.keys( dict ).length );

    //console.log( "first two letters..." );

    var dictSeen = {}; // track first time we printed pair
    for ( i = 0; i < c; i++ ) {
        element = nodes[i];
        //console.log( element );
        firstTwoChars = element.textContent.slice( 0, 2 );
        var count = dict[ firstTwoChars ];
        if ( firstTwoChars in dictSeen )
        {
            continue;
        }

        var goal = dictHints[ firstTwoChars ];

        dictSeen[ firstTwoChars ] = true;
        var prog = count.toString() + "/" + goal.toString();
        element.textContent = element.textContent + " " + prog;
        element.style.color = "blue";
        if ( !is_complete( prog ) )
        {
            element.style.color = "red";
        }
        element.style.fontWeight = "bold";
    }

    //console.log( dict );
    //console.log( dictHints );

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
        margin: 0rem;
        font-size: 0.60rem;
        line-height: 1.0rem;
    }

    .row {
        height: 12px;
    }

    .celllegend {
        width: 20px;
        min-width: 20px;
        max-width: 20px;
    }

    .cell {
        width: 40px;
        min-width: 40px;
        max-width: 40px;
        text-align: right;
    }

    .cellwide {
        width: 50px;
        min-width: 50px;
        max-width: 50px;
        text-align: right;
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

        lcl = {}
        if ( key in lengthCountsByLetter )
        {
            lcl = lengthCountsByLetter[ key ];
        }
        lcl_hint = lengthCountsByLetterHints[ key ];

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
                    newCell.style.color = "red";
                    newCell.style.fontWeight = "bold";
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
        for ( j of two_letters )
        {
            newCell = document.createElement( 'td' );
            newCell.className = "cellwide";

            if ( j in dict )
            {
                progress = dict[ j ].toString() + "/" + dictHints[ j ].toString();
            }
            else
            {
                progress = "0/" + dictHints[ j ].toString()
            }

             if ( !is_complete( progress ) )
             {
                 newCell.style.color = "red";
                 newCell.style.fontWeight = "700";
             }

            add = j.toUpperCase() + "-" + progress;

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
    var progressNode = document.getElementsByClassName( "sb-progress-value" )[ 0 ];
    if ( progressNode )
    {
       progressNode.textContent = progressNode.textContent + "/" + max_score.toString();
       console.log( progressNode.textContent );
    }

    // update word list label
    var wordNode = document.getElementsByClassName( "sb-wordlist-summary" )[ 0 ];
    if ( wordNode )
    {
        wordNode.textContent = wordNode.textContent + " out of " + total_words.toString();
        console.log( progressNode.textContent );
    }

    content_box.appendChild( newArea );
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

