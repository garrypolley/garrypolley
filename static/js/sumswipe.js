/**
 * SumSwipe — swipe letter paths so A=1…Z=26 hits a target sum.
 * Touch / mouse / pen via Pointer Events. Pure helpers exported for smoke tests.
 */
var SumSwipeUtils = (function () {
  "use strict";

  var MIN_WORD_LEN = 3;
  var MAX_WORD_LEN = 10;

  function letterValue(ch) {
    if (typeof ch !== "string" || ch.length === 0) {
      return 0;
    }
    var code = ch.toUpperCase().charCodeAt(0);
    if (code < 65 || code > 90) {
      return 0;
    }
    return code - 64;
  }

  function wordSum(word) {
    if (typeof word !== "string") {
      return 0;
    }
    var total = 0;
    for (var i = 0; i < word.length; i++) {
      total += letterValue(word.charAt(i));
    }
    return total;
  }

  function normalizeWord(word) {
    if (typeof word !== "string") {
      return "";
    }
    return word.toUpperCase().replace(/[^A-Z]/g, "");
  }

  function indexToRowCol(index, size) {
    return { row: Math.floor(index / size), col: index % size };
  }

  function rowColToIndex(row, col, size) {
    return row * size + col;
  }

  function areAdjacent(a, b, size) {
    var pa = indexToRowCol(a, size);
    var pb = indexToRowCol(b, size);
    var dr = Math.abs(pa.row - pb.row);
    var dc = Math.abs(pa.col - pb.col);
    if (dr === 0 && dc === 0) {
      return false;
    }
    return dr <= 1 && dc <= 1;
  }

  function isValidPath(indices, size) {
    if (!Array.isArray(indices) || indices.length === 0) {
      return false;
    }
    var seen = {};
    for (var i = 0; i < indices.length; i++) {
      var idx = indices[i];
      if (typeof idx !== "number" || idx !== idx || idx < 0 || idx >= size * size) {
        return false;
      }
      if (seen[idx]) {
        return false;
      }
      seen[idx] = true;
      if (i > 0 && !areAdjacent(indices[i - 1], idx, size)) {
        return false;
      }
    }
    return true;
  }

  function pathToWord(grid, indices) {
    if (!Array.isArray(grid) || !Array.isArray(indices)) {
      return "";
    }
    var out = "";
    for (var i = 0; i < indices.length; i++) {
      var ch = grid[indices[i]];
      if (typeof ch !== "string") {
        return "";
      }
      out += ch;
    }
    return normalizeWord(out);
  }

  function flattenGrid(rows) {
    var out = [];
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      for (var c = 0; c < row.length; c++) {
        out.push(String(row.charAt ? row.charAt(c) : row[c]).toUpperCase());
      }
    }
    return out;
  }

  /**
   * Compact dictionary: puzzle answers + common short words that may appear as
   * alternate finds on the grids. Kept small on purpose for a static site tool.
   */
  var BASE_WORDS = [
    "ADD","AGE","AIR","AND","ANT","APE","ARC","ARE","ARK","ARM","ART","ASH","ASK",
    "BAG","BAT","BED","BEE","BET","BIG","BIT","BOX","BOY","BUS","BUT","BUY",
    "CAB","CAN","CAP","CAR","CAT","COW","CRY","CUP","CUT",
    "DAD","DAY","DEN","DID","DIE","DIG","DIM","DIP","DOG","DOT","DRY","DUE",
    "EAR","EAT","EEL","EGG","ELF","END","ERA","EVE","EYE",
    "FAN","FAR","FAT","FED","FEW","FIG","FIN","FIR","FIT","FIX","FLY","FOG","FOR","FOX","FUN","FUR",
    "GAP","GAS","GEL","GEM","GET","GIG","GIN","GOD","GOT","GUM","GUN","GUY","GYM",
    "HAD","HAM","HAS","HAT","HAY","HEN","HER","HID","HIM","HIP","HIS","HIT","HOG","HOP","HOT","HOW","HUB","HUE","HUG","HUM","HUT",
    "ICE","ILL","INK","INN","ION","ITS","IVY",
    "JAM","JAR","JAW","JAY","JET","JOB","JOG","JOY","JUG",
    "KEY","KID","KIN","KIT",
    "LAB","LAD","LAG","LAP","LAW","LAY","LED","LEG","LET","LID","LIE","LIP","LIT","LOG","LOT","LOW",
    "MAD","MAN","MAP","MAT","MAY","MEN","MET","MIX","MOB","MOM","MOP","MUD","MUG",
    "NAG","NAP","NET","NEW","NIL","NIP","NOD","NOR","NOT","NOW","NUN","NUT",
    "OAK","OAR","OAT","ODD","OFF","OIL","OLD","ONE","ORB","ORE","OUR","OUT","OWE","OWL","OWN",
    "PAD","PAL","PAN","PAR","PAT","PAW","PAY","PEA","PEN","PER","PET","PIE","PIG","PIN","PIT","PLY","POD","POP","POT","PRO","PUB","PUN","PUP","PUT",
    "RAG","RAM","RAN","RAP","RAT","RAW","RAY","RED","RIB","RID","RIG","RIM","RIP","ROB","ROD","ROT","ROW","RUB","RUG","RUM","RUN",
    "SAD","SAG","SAP","SAT","SAW","SAY","SEA","SET","SEW","SHE","SHY","SIN","SIP","SIR","SIT","SIX","SKI","SKY","SLY","SOB","SOD","SON","SOW","SOY","SPA","SPY","SUB","SUM","SUN","SUP",
    "TAB","TAD","TAG","TAN","TAP","TAR","TAX","TEA","TEN","THE","TIE","TIN","TIP","TOE","TON","TOO","TOP","TOW","TOY","TRY","TUB","TUG","TWO",
    "URN","USE",
    "VAN","VAT","VET","VIA","VOW",
    "WAD","WAG","WAR","WAS","WAX","WAY","WEB","WED","WEE","WET","WHO","WHY","WIG","WIN","WIT","WOE","WON","WOO","WOW",
    "YAK","YAM","YAP","YAW","YEA","YES","YET","YOU",
    "ZAP","ZEN","ZIP","ZOO",
    "ABLE","ACID","AGED","AIMS","AKIN","ALSO","AREA","ARMY","ARTS","ATOM","AUNT","AVID","AWAY",
    "BACK","BAKE","BALL","BAND","BANK","BARE","BARK","BARN","BASE","BATH","BEAM","BEAN","BEAR","BEAT","BEEN","BELL","BELT","BEND","BEST","BETA","BIKE","BILL","BIND","BIRD","BITE","BLOW","BLUE","BOAT","BODY","BOIL","BOLD","BOMB","BOND","BONE","BOOK","BOOM","BOOT","BORE","BORN","BOSS","BOTH","BOWL","BURN","BUSH","BUSY","BYTE",
    "CAFE","CAGE","CAKE","CALL","CALM","CAME","CAMP","CARD","CARE","CART","CASE","CASH","CAST","CAVE","CELL","CENT","CHAT","CHEF","CHEW","CHIN","CHIP","CHOP","CITY","CLAM","CLAP","CLAW","CLAY","CLIP","CLUB","CLUE","COAL","COAT","CODE","COIL","COIN","COLD","COMA","COMB","COME","CONE","COOK","COOL","COPE","COPY","CORD","CORE","CORK","CORN","COST","COZY","CRAB","CREW","CROP","CROW","CUBE","CURE","CURL","CUTE",
    "DAMP","DARE","DARK","DART","DASH","DATA","DATE","DAWN","DAYS","DEAD","DEAF","DEAL","DEAR","DEBT","DECK","DEED","DEEP","DEER","DEMO","DENY","DESK","DIAL","DICE","DIET","DIME","DINE","DIRT","DISC","DISH","DISK","DIVE","DOCK","DOES","DOLE","DOLL","DONE","DOOM","DOOR","DOSE","DOWN","DRAG","DRAW","DREW","DRIP","DROP","DRUG","DRUM","DUAL","DUCK","DUEL","DUET","DULL","DUMB","DUMP","DUNE","DUSK","DUST","DUTY",
    "EACH","EARL","EARN","EASE","EAST","EASY","EDGE","EDIT","ELSE","EMIT","ENVY","EPIC","EVEN","EVER","EVIL","EXAM","EXIT","FACE","FACT","FADE","FAIL","FAIR","FAKE","FALL","FAME","FANG","FARE","FARM","FAST","FATE","FEAR","FEAT","FEED","FEEL","FELL","FELT","FILE","FILL","FILM","FIND","FINE","FIRE","FIRM","FISH","FIST","FIVE","FLAG","FLAP","FLAT","FLAW","FLEA","FLED","FLEE","FLEW","FLEX","FLIP","FLOW","FOAM","FOIL","FOLD","FOLK","FOND","FOOD","FOOL","FOOT","FORD","FORK","FORM","FORT","FOUL","FOUR","FREE","FROG","FROM","FUEL","FULL","FUME","FUND","FURY","FUSE","FUSS","FUZZ",
    "GAIN","GALA","GAME","GANG","GATE","GAVE","GAZE","GEAR","GEMS","GENE","GIFT","GIRL","GIVE","GLAD","GLEE","GLEN","GLOW","GLUE","GOAL","GOAT","GOES","GOLD","GOLF","GONE","GOOD","GOSH","GRAB","GRAM","GRAY","GREW","GREY","GRID","GRIM","GRIN","GRIP","GROW","GULF","GUSH","GUST","HACK","HAIL","HAIR","HALF","HALL","HALT","HAND","HANG","HARD","HARM","HATE","HAUL","HAVE","HAWK","HAZE","HEAD","HEAL","HEAP","HEAR","HEAT","HEEL","HELD","HELL","HELP","HERB","HERD","HERE","HERO","HIDE","HIGH","HIKE","HILL","HINT","HIRE","HOLD","HOLE","HOME","HONE","HOOD","HOOK","HOPE","HORN","HOSE","HOST","HOUR","HOWL","HUGE","HULL","HUNG","HUNK","HUNT","HURT","HUSH","IDEA","IDLE","IDOL","INCH","INFO","INTO","IRIS","IRON","ISLE","ITEM",
    "JACK","JADE","JAIL","JAZZ","JEAN","JEEP","JOIN","JOKE","JOLT","JUMP","JUNK","JURY","JUST","KEEN","KEEP","KICK","KILL","KIND","KING","KISS","KITE","KNEE","KNEW","KNIT","KNOB","KNOT","KNOW",
    "LACE","LACK","LADY","LAID","LAKE","LAMB","LAME","LAMP","LAND","LANE","LARK","LAST","LATE","LAWN","LAZY","LEAD","LEAF","LEAK","LEAN","LEAP","LEFT","LEND","LENS","LESS","LIAR","LICK","LIED","LIFE","LIFT","LIKE","LILY","LIMB","LIME","LIMP","LINE","LINK","LION","LISP","LIST","LIVE","LOAD","LOAF","LOAN","LOCK","LOFT","LOGO","LONE","LONG","LOOK","LOOM","LOOP","LORD","LOSE","LOSS","LOST","LOUD","LOVE","LUCK","LUMP","LUNG","LURE","LUSH","LUST",
    "MADE","MAID","MAIL","MAIN","MAKE","MALE","MALL","MALT","MANE","MANY","MARE","MARK","MARS","MART","MASH","MASK","MASS","MAST","MATE","MATH","MAZE","MEAL","MEAN","MEAT","MEET","MELT","MEMO","MEND","MENU","MESH","MESS","MICE","MILD","MILE","MILK","MILL","MIND","MINE","MINT","MISS","MIST","MOAT","MOCK","MODE","MOLD","MOLE","MONK","MOOD","MOON","MOOR","MORE","MOSS","MOST","MOTH","MOVE","MUCH","MUCK","MULE","MUSE","MUSH","MUST","MUTE","MYTH",
    "NAIL","NAME","NAVY","NEAR","NEAT","NECK","NEED","NEST","NEWS","NEXT","NICE","NICK","NINE","NODE","NONE","NOOK","NOON","NOPE","NORM","NOSE","NOTE","NOUN","NUDE","NULL","NUMB",
    "OBEY","ODOR","OILY","OMEN","OMIT","ONCE","ONLY","ONTO","OOZE","OPAL","OPEN","ORAL","ORCA","OUST","OVAL","OVEN","OVER","OWED",
    "PACE","PACK","PACT","PAGE","PAID","PAIL","PAIN","PAIR","PALE","PALM","PARK","PART","PASS","PAST","PATH","PAVE","PAWN","PEAK","PEAR","PEAT","PECK","PEEL","PEER","PELT","PERK","PEST","PICK","PIER","PIKE","PILE","PILL","PINE","PINT","PIPE","PLAN","PLAY","PLEA","PLOD","PLOT","PLOW","PLUG","PLUM","PLUS","POEM","POET","POKE","POLE","POLL","POND","POOL","POOR","POPE","PORE","PORK","PORT","POSE","POST","POUR","PRAY","PREY","PROP","PULL","PULP","PUMP","PUNK","PUNT","PURE","PUSH",
    "QUIZ","RACE","RACK","RAFT","RAGE","RAID","RAIL","RAIN","RAKE","RAMP","RANK","RARE","RASH","RATE","RAVE","READ","REAL","REAP","REAR","REED","REEF","REEL","RELY","RENT","REST","RICE","RICH","RIDE","RIFE","RIFT","RILE","RING","RIOT","RIPE","RISE","RISK","RITE","ROAD","ROAM","ROAR","ROBE","ROCK","RODE","ROLE","ROLL","ROOF","ROOM","ROOT","ROPE","ROSE","ROSY","ROUT","ROVE","RUBY","RUDE","RUIN","RULE","RUMP","RUNE","RUNG","RUSH","RUST",
    "SACK","SAFE","SAGA","SAGE","SAID","SAIL","SAKE","SALE","SALT","SAME","SAND","SANE","SANG","SANK","SAVE","SCAN","SCAR","SEAL","SEAM","SEAR","SEAT","SEED","SEEK","SEEM","SEEN","SELF","SELL","SEND","SENT","SETS","SHED","SHIP","SHOE","SHOP","SHOT","SHOW","SHUT","SICK","SIDE","SIFT","SIGH","SIGN","SILK","SILL","SILO","SING","SINK","SITE","SIZE","SKIM","SKIN","SKIP","SLAB","SLAM","SLAP","SLAT","SLAY","SLED","SLEW","SLID","SLIM","SLIP","SLIT","SLOW","SLUG","SLUM","SLUR","SNAP","SNOW","SOAK","SOAP","SOAR","SODA","SOFA","SOFT","SOIL","SOLD","SOLE","SOLO","SOME","SONG","SOON","SORE","SORT","SOUL","SOUP","SOUR","SPAN","SPAR","SPAT","SPIN","SPIT","SPOT","STAR","STAY","STEM","STEP","STEW","STIR","STOP","STOW","STUB","STUD","SUCH","SUIT","SULK","SUMS","SUNK","SURE","SURF","SWAN","SWAP","SWAT","SWAY","SWIM",
    "TACK","TACO","TAIL","TAKE","TALE","TALK","TALL","TAME","TANK","TAPE","TART","TASK","TAXI","TEAM","TEAR","TELL","TEND","TENT","TERM","TEST","TEXT","THAN","THAT","THAW","THEE","THEM","THEN","THEY","THIN","THIS","THUD","TICK","TIDE","TIDY","TIED","TIER","TILE","TILL","TILT","TIME","TINY","TIRE","TOAD","TOFU","TOIL","TOLD","TOLL","TOMB","TONE","TOOK","TOOL","TOPS","TORE","TORN","TOSS","TOTE","TOUR","TOWN","TOYS","TRAM","TRAP","TRAY","TREE","TREK","TRIM","TRIO","TRIP","TROT","TRUE","TUBE","TUCK","TUNA","TUNE","TURF","TURN","TUSK","TWIN","TYPE",
    "UGLY","UNDO","UNIT","UNTO","UPON","URGE","USED","USER","VAIN","VALE","VARY","VASE","VAST","VEIL","VEIN","VENT","VERB","VERY","VEST","VETO","VIAL","VIBE","VICE","VIEW","VILE","VINE","VISA","VOID","VOLT","VOTE",
    "WADE","WAGE","WAIL","WAIT","WAKE","WALK","WALL","WAND","WANE","WANT","WARD","WARM","WARN","WARP","WART","WARY","WASH","WASP","WAVE","WAVY","WEAK","WEAR","WEED","WEEK","WELD","WELL","WENT","WERE","WEST","WHAT","WHEN","WHIP","WHIZ","WIDE","WIFE","WILD","WILL","WILT","WIND","WINE","WING","WINK","WIPE","WIRE","WISE","WISH","WITH","WOLF","WOMB","WOOD","WOOL","WORD","WORE","WORK","WORM","WORN","WRAP","YARD","YARN","YAWN","YEAR","YELL","YELP","YOGA","YOKE","YOLK","YOUR","ZEAL","ZERO","ZEST","ZINC","ZONE","ZOOM",
    // Puzzle answers + intentional extras
    "CAT","DOG","MATH","PLUS","FUN","TILE","FINGER","FINE","MINUS","TIMES","EQUAL","ROUT",
    "CUBE","OVAL","LINE","THINK","FOCUS","SMART","LOGIC","SOLVE","SWIPE","TRACE","SCORE",
    "VALUE","TOTAL","PHONE","DIGIT","NUMBER","PUZZLE","BRAIN","CLUE","HINT","LEVEL","PATH",
    "GRID","PLAY","GAME","TOUCH","SLIDE","COUNT","PRIME","ANGLE","SHAPE","POWER","PROOF",
  ];

  var DICTIONARY = (function () {
    var set = {};
    for (var i = 0; i < BASE_WORDS.length; i++) {
      set[BASE_WORDS[i]] = true;
    }
    return set;
  })();

  function isDictionaryWord(word) {
    var w = normalizeWord(word);
    if (w.length < MIN_WORD_LEN || w.length > MAX_WORD_LEN) {
      return false;
    }
    return !!DICTIONARY[w];
  }

  function addDictionaryWords(words) {
    if (!Array.isArray(words)) {
      return;
    }
    for (var i = 0; i < words.length; i++) {
      var w = normalizeWord(words[i]);
      if (w) {
        DICTIONARY[w] = true;
      }
    }
  }

  /**
   * Curated puzzles with unique target sums. Paths verified for intended answers.
   * Any dictionary word that hits a remaining target sum counts as a find.
   */
  var PUZZLES = [
    {
      id: "warm-up",
      title: "Warm-up",
      blurb: "Swipe adjacent letters (including diagonals). A=1 … Z=26. Hit each target sum.",
      size: 4,
      rows: ["CATS", "DOGU", "MATH", "PLUS"],
      targets: [
        { sum: 24, hint: "A small pet", answer: "CAT" },
        { sum: 26, hint: "Man's best friend", answer: "DOG" },
        { sum: 42, hint: "School subject", answer: "MATH" },
        { sum: 68, hint: "Addition sign word", answer: "PLUS" },
      ],
    },
    {
      id: "touch-trail",
      title: "Touch Trail",
      blurb: "Keep your finger down and drag — longer paths welcome.",
      size: 4,
      rows: ["FING", "UNGE", "NGER", "TILE"],
      targets: [
        { sum: 41, hint: "A good time", answer: "FUN" },
        { sum: 46, hint: "A square on the board", answer: "TILE" },
        { sum: 59, hint: "Digit on your hand", answer: "FINGER" },
        { sum: 34, hint: "Nice quality", answer: "FINE" },
      ],
    },
    {
      id: "operators",
      title: "Operators",
      blurb: "Math vocabulary hiding in the grid.",
      size: 5,
      rows: ["TIMES", "PLUSX", "MINUS", "EQUAL", "ROOTY"],
      targets: [
        { sum: 66, hint: "Multiplication word", answer: "TIMES" },
        { sum: 68, hint: "Opposite of minus", answer: "PLUS" },
        { sum: 76, hint: "Subtraction word", answer: "MINUS" },
        { sum: 56, hint: "Same on both sides", answer: "EQUAL" },
        { sum: 74, hint: "A path taken", answer: "ROUT" },
      ],
    },
    {
      id: "shape-up",
      title: "Shape Up",
      blurb: "Geometry-flavored finds.",
      size: 4,
      rows: ["CUBE", "OVAL", "AREA", "LINE"],
      targets: [
        { sum: 31, hint: "Six faces", answer: "CUBE" },
        { sum: 50, hint: "Egg-shaped", answer: "OVAL" },
        { sum: 25, hint: "Length × width", answer: "AREA" },
        { sum: 40, hint: "Straight mark", answer: "LINE" },
      ],
    },
    {
      id: "brainy",
      title: "Brainy",
      blurb: "Think, then swipe.",
      size: 5,
      rows: ["THINK", "FOCUS", "SMART", "LOGIC", "SOLVE"],
      targets: [
        { sum: 62, hint: "Use your head", answer: "THINK" },
        { sum: 64, hint: "Concentrate", answer: "FOCUS" },
        { sum: 71, hint: "Clever", answer: "SMART" },
        { sum: 46, hint: "Reasoning", answer: "LOGIC" },
        { sum: 73, hint: "Find the answer", answer: "SOLVE" },
      ],
    },
    {
      id: "swipe-lab",
      title: "Swipe Lab",
      blurb: "Phone-friendly finale — drag, swipe, and score.",
      size: 5,
      rows: ["SWIPE", "TRACE", "SCORE", "VALUE", "TOTAL"],
      targets: [
        { sum: 72, hint: "Finger gesture", answer: "SWIPE" },
        { sum: 47, hint: "Follow a path", answer: "TRACE" },
        { sum: 60, hint: "Points earned", answer: "SCORE" },
        { sum: 61, hint: "Letter worth", answer: "VALUE" },
        { sum: 68, hint: "Grand sum", answer: "TOTAL" },
      ],
    },
  ];

  PUZZLES.forEach(function (p) {
    addDictionaryWords(
      p.targets.map(function (t) {
        return t.answer;
      })
    );
  });

  function getPuzzles() {
    return PUZZLES.map(function (p) {
      return {
        id: p.id,
        title: p.title,
        blurb: p.blurb,
        size: p.size,
        rows: p.rows.slice(),
        grid: flattenGrid(p.rows),
        targets: p.targets.map(function (t) {
          return { sum: t.sum, hint: t.hint, answer: t.answer };
        }),
      };
    });
  }

  return {
    MIN_WORD_LEN: MIN_WORD_LEN,
    MAX_WORD_LEN: MAX_WORD_LEN,
    letterValue: letterValue,
    wordSum: wordSum,
    normalizeWord: normalizeWord,
    indexToRowCol: indexToRowCol,
    rowColToIndex: rowColToIndex,
    areAdjacent: areAdjacent,
    isValidPath: isValidPath,
    pathToWord: pathToWord,
    flattenGrid: flattenGrid,
    isDictionaryWord: isDictionaryWord,
    addDictionaryWords: addDictionaryWords,
    getPuzzles: getPuzzles,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = SumSwipeUtils;
}

(function () {
  "use strict";

  if (typeof document === "undefined") {
    return;
  }

  var root = document.getElementById("sumSwipeTool");
  if (!root) {
    return;
  }

  var utils = SumSwipeUtils;
  var puzzles = utils.getPuzzles();
  var storageKey = "sumswipe-progress-v1";

  var state = {
    puzzleIndex: 0,
    path: [],
    dragging: false,
    found: {},
    revealed: {},
  };

  var els = {
    title: document.getElementById("ssTitle"),
    blurb: document.getElementById("ssBlurb"),
    progress: document.getElementById("ssProgress"),
    grid: document.getElementById("ssGrid"),
    pathSvg: document.getElementById("ssPathSvg"),
    liveWord: document.getElementById("ssLiveWord"),
    liveSum: document.getElementById("ssLiveSum"),
    liveEq: document.getElementById("ssLiveEq"),
    targets: document.getElementById("ssTargets"),
    status: document.getElementById("ssStatus"),
    prev: document.getElementById("ssPrev"),
    next: document.getElementById("ssNext"),
    clear: document.getElementById("ssClear"),
    hint: document.getElementById("ssHint"),
    reset: document.getElementById("ssResetPuzzle"),
  };

  function loadProgress() {
    try {
      var raw = localStorage.getItem(storageKey);
      if (!raw) {
        return {};
      }
      var data = JSON.parse(raw);
      return data && typeof data === "object" ? data : {};
    } catch (e) {
      return {};
    }
  }

  function saveProgress() {
    try {
      var all = loadProgress();
      var puzzle = puzzles[state.puzzleIndex];
      all[puzzle.id] = { found: state.found, revealed: state.revealed };
      localStorage.setItem(storageKey, JSON.stringify(all));
    } catch (e) {
      // ignore quota / private mode
    }
  }

  function restorePuzzleProgress() {
    var puzzle = puzzles[state.puzzleIndex];
    var all = loadProgress();
    var saved = all[puzzle.id];
    state.found = {};
    state.revealed = {};
    if (saved && saved.found && typeof saved.found === "object") {
      state.found = saved.found;
    }
    if (saved && saved.revealed && typeof saved.revealed === "object") {
      state.revealed = saved.revealed;
    }
  }

  function setStatus(msg, kind) {
    els.status.textContent = msg || "";
    els.status.classList.remove("is-error", "is-success");
    if (kind === "error") {
      els.status.classList.add("is-error");
    } else if (kind === "success") {
      els.status.classList.add("is-success");
    }
  }

  function currentPuzzle() {
    return puzzles[state.puzzleIndex];
  }

  function foundCount() {
    return Object.keys(state.found).length;
  }

  function isComplete() {
    return foundCount() >= currentPuzzle().targets.length;
  }

  function renderChrome() {
    var p = currentPuzzle();
    els.title.textContent = p.title;
    els.blurb.textContent = p.blurb;
    els.progress.textContent =
      "Puzzle " +
      (state.puzzleIndex + 1) +
      " / " +
      puzzles.length +
      " · " +
      foundCount() +
      " / " +
      p.targets.length +
      " found";
    els.prev.disabled = state.puzzleIndex === 0;
    els.next.disabled = state.puzzleIndex >= puzzles.length - 1;
  }

  function cellCenter(index) {
    var cell = els.grid.querySelector('[data-index="' + index + '"]');
    if (!cell) {
      return null;
    }
    var gridRect = els.grid.getBoundingClientRect();
    var r = cell.getBoundingClientRect();
    return {
      x: r.left - gridRect.left + r.width / 2,
      y: r.top - gridRect.top + r.height / 2,
    };
  }

  function drawPath() {
    var svg = els.pathSvg;
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
    if (state.path.length < 2) {
      return;
    }
    var d = "";
    for (var i = 0; i < state.path.length; i++) {
      var pt = cellCenter(state.path[i]);
      if (!pt) {
        continue;
      }
      d += (i === 0 ? "M" : "L") + pt.x + " " + pt.y + " ";
    }
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d.trim());
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "rgba(38, 96, 171, 0.85)");
    path.setAttribute("stroke-width", "6");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
  }

  function updateLive() {
    var p = currentPuzzle();
    var word = utils.pathToWord(p.grid, state.path);
    var sum = utils.wordSum(word);
    els.liveWord.textContent = word || "—";
    els.liveSum.textContent = word ? String(sum) : "—";

    if (!word) {
      els.liveEq.textContent = "Swipe through letters to build a word.";
      return;
    }
    var parts = [];
    for (var i = 0; i < word.length; i++) {
      var ch = word.charAt(i);
      parts.push(ch + "(" + utils.letterValue(ch) + ")");
    }
    els.liveEq.textContent = parts.join(" + ") + " = " + sum;
  }

  function highlightPath() {
    var cells = els.grid.querySelectorAll(".ss-cell");
    for (var i = 0; i < cells.length; i++) {
      cells[i].classList.remove("is-path", "is-path-head");
    }
    for (var j = 0; j < state.path.length; j++) {
      var cell = els.grid.querySelector('[data-index="' + state.path[j] + '"]');
      if (!cell) {
        continue;
      }
      cell.classList.add("is-path");
      if (j === state.path.length - 1) {
        cell.classList.add("is-path-head");
      }
    }
    drawPath();
    updateLive();
  }

  function clearPath() {
    state.path = [];
    highlightPath();
  }

  function renderTargets() {
    var p = currentPuzzle();
    els.targets.innerHTML = "";
    for (var i = 0; i < p.targets.length; i++) {
      var t = p.targets[i];
      var li = document.createElement("li");
      li.className = "ss-target";
      var foundWord = state.found[String(i)];
      if (foundWord) {
        li.classList.add("is-found");
      }
      var sumEl = document.createElement("span");
      sumEl.className = "ss-target-sum";
      sumEl.textContent = String(t.sum);
      var meta = document.createElement("span");
      meta.className = "ss-target-meta";
      if (foundWord) {
        meta.textContent = foundWord;
      } else if (state.revealed[String(i)]) {
        meta.textContent = t.hint + " → " + t.answer;
      } else {
        meta.textContent = t.hint;
      }
      li.appendChild(sumEl);
      li.appendChild(meta);
      els.targets.appendChild(li);
    }
  }

  function syncSvgSize() {
    var rect = els.grid.getBoundingClientRect();
    els.pathSvg.setAttribute("width", String(rect.width));
    els.pathSvg.setAttribute("height", String(rect.height));
    els.pathSvg.setAttribute("viewBox", "0 0 " + rect.width + " " + rect.height);
    drawPath();
  }

  function renderGrid() {
    var p = currentPuzzle();
    els.grid.style.setProperty("--ss-size", String(p.size));
    els.grid.innerHTML = "";
    els.grid.setAttribute(
      "aria-label",
      p.title + " letter grid, " + p.size + " by " + p.size
    );

    for (var i = 0; i < p.grid.length; i++) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ss-cell";
      btn.dataset.index = String(i);
      btn.setAttribute("aria-label", "Letter " + p.grid[i] + ", value " + utils.letterValue(p.grid[i]));
      btn.tabIndex = -1;
      var letter = document.createElement("span");
      letter.className = "ss-cell-letter";
      letter.textContent = p.grid[i];
      var val = document.createElement("span");
      val.className = "ss-cell-value";
      val.textContent = String(utils.letterValue(p.grid[i]));
      btn.appendChild(letter);
      btn.appendChild(val);
      els.grid.appendChild(btn);
    }

    requestAnimationFrame(syncSvgSize);
  }

  function loadPuzzle(index) {
    state.puzzleIndex = index;
    state.path = [];
    state.dragging = false;
    restorePuzzleProgress();
    renderChrome();
    renderGrid();
    renderTargets();
    updateLive();
    if (isComplete()) {
      setStatus("Puzzle complete! Swipe for fun, or jump to the next one.", "success");
    } else {
      setStatus("Drag across letters. Release to submit.");
    }
  }

  function tryCommitPath() {
    var p = currentPuzzle();
    if (!utils.isValidPath(state.path, p.size) || state.path.length < utils.MIN_WORD_LEN) {
      clearPath();
      return;
    }
    var word = utils.pathToWord(p.grid, state.path);
    var sum = utils.wordSum(word);

    if (!utils.isDictionaryWord(word)) {
      setStatus('"' + word + '" isn’t in the word list. Sum would be ' + sum + ".", "error");
      clearPath();
      return;
    }

    for (var key in state.found) {
      if (Object.prototype.hasOwnProperty.call(state.found, key) && state.found[key] === word) {
        setStatus("Already found " + word + ".", "error");
        clearPath();
        return;
      }
    }

    var matchedIndex = -1;
    for (var i = 0; i < p.targets.length; i++) {
      if (state.found[String(i)]) {
        continue;
      }
      if (p.targets[i].sum === sum) {
        matchedIndex = i;
        break;
      }
    }

    if (matchedIndex === -1) {
      setStatus(word + " = " + sum + " — not a remaining target.", "error");
      clearPath();
      return;
    }

    state.found[String(matchedIndex)] = word;
    saveProgress();
    renderChrome();
    renderTargets();
    clearPath();

    if (isComplete()) {
      setStatus('Nice! "' + word + '" hits ' + sum + ". Puzzle complete.", "success");
      root.classList.add("ss-celebrate");
      setTimeout(function () {
        root.classList.remove("ss-celebrate");
      }, 700);
    } else {
      setStatus("Got it — " + word + " = " + sum + ".", "success");
    }
  }

  function indexFromPoint(clientX, clientY) {
    var el = document.elementFromPoint(clientX, clientY);
    if (!el) {
      return -1;
    }
    var cell = el.closest ? el.closest(".ss-cell") : null;
    if (!cell || !els.grid.contains(cell)) {
      return -1;
    }
    return parseInt(cell.dataset.index, 10);
  }

  function extendPath(index) {
    var p = currentPuzzle();
    if (index < 0 || index >= p.grid.length) {
      return;
    }
    if (state.path.length === 0) {
      state.path.push(index);
      highlightPath();
      return;
    }
    var last = state.path[state.path.length - 1];
    if (index === last) {
      return;
    }
    if (state.path.length >= 2 && index === state.path[state.path.length - 2]) {
      state.path.pop();
      highlightPath();
      return;
    }
    if (state.path.indexOf(index) !== -1) {
      return;
    }
    if (!utils.areAdjacent(last, index, p.size)) {
      return;
    }
    if (state.path.length >= utils.MAX_WORD_LEN) {
      return;
    }
    state.path.push(index);
    highlightPath();
  }

  function onPointerDown(e) {
    if (e.button != null && e.button !== 0) {
      return;
    }
    var index = indexFromPoint(e.clientX, e.clientY);
    if (index < 0) {
      return;
    }
    e.preventDefault();
    state.dragging = true;
    state.path = [];
    if (els.grid.setPointerCapture) {
      try {
        els.grid.setPointerCapture(e.pointerId);
      } catch (err) {
        // ignore
      }
    }
    extendPath(index);
  }

  function onPointerMove(e) {
    if (!state.dragging) {
      return;
    }
    e.preventDefault();
    var index = indexFromPoint(e.clientX, e.clientY);
    if (index >= 0) {
      extendPath(index);
    }
  }

  function onPointerUp(e) {
    if (!state.dragging) {
      return;
    }
    state.dragging = false;
    if (els.grid.releasePointerCapture) {
      try {
        els.grid.releasePointerCapture(e.pointerId);
      } catch (err) {
        // ignore
      }
    }
    tryCommitPath();
  }

  els.grid.addEventListener("pointerdown", onPointerDown);
  els.grid.addEventListener("pointermove", onPointerMove);
  els.grid.addEventListener("pointerup", onPointerUp);
  els.grid.addEventListener("pointercancel", onPointerUp);
  els.grid.addEventListener("lostpointercapture", function () {
    if (state.dragging) {
      state.dragging = false;
      tryCommitPath();
    }
  });

  els.grid.addEventListener(
    "touchmove",
    function (e) {
      if (state.dragging) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  els.prev.addEventListener("click", function () {
    if (state.puzzleIndex > 0) {
      loadPuzzle(state.puzzleIndex - 1);
    }
  });
  els.next.addEventListener("click", function () {
    if (state.puzzleIndex < puzzles.length - 1) {
      loadPuzzle(state.puzzleIndex + 1);
    }
  });
  els.clear.addEventListener("click", function () {
    clearPath();
    setStatus("Path cleared.");
  });
  els.hint.addEventListener("click", function () {
    var p = currentPuzzle();
    for (var i = 0; i < p.targets.length; i++) {
      if (!state.found[String(i)]) {
        state.revealed[String(i)] = true;
        saveProgress();
        renderTargets();
        setStatus('Hint: look for "' + p.targets[i].answer + '" (sum ' + p.targets[i].sum + ").");
        return;
      }
    }
    setStatus("All targets already found.");
  });
  els.reset.addEventListener("click", function () {
    state.found = {};
    state.revealed = {};
    saveProgress();
    clearPath();
    renderChrome();
    renderTargets();
    setStatus("Puzzle progress cleared.");
  });

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      syncSvgSize();
      highlightPath();
    }, 100);
  });

  loadPuzzle(0);
})();
